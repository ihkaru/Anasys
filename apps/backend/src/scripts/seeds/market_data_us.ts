import { marketData, symbols } from "@packages/db/src/schema";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../../db";

// Fix path: relative from src/scripts/seeds/market_data_us.ts to data/us
const US_DATA_DIR = join(import.meta.dir, "../../../data/us");

// Helper to convert PER to interval string
function perToInterval(per: string): string {
    const p = parseInt(per);
    if (p === 60) return '1h';
    if (p === 1440) return '1d';
    if (p === 5) return '5m';
    if (p === 15) return '15m';
    if (p === 30) return '30m';
    return `${p}m`; // Fallback
}

function parseDateTime(dateStr: string, timeStr: string): Date {
    const y = parseInt(dateStr.substring(0, 4));
    const m = parseInt(dateStr.substring(4, 6)) - 1;
    const d = parseInt(dateStr.substring(6, 8));
    
    const h = parseInt(timeStr.substring(0, 2));
    const min = parseInt(timeStr.substring(2, 4));
    const s = parseInt(timeStr.substring(4, 6));

    return new Date(Date.UTC(y, m, d, h, min, s));
}

async function walkDir(dir: string): Promise<string[]> {
    let results: string[] = [];
    const list = await readdir(dir);
    for (const file of list) {
        const filePath = join(dir, file);
        const st = await stat(filePath);
        if (st.isDirectory()) {
            results = results.concat(await walkDir(filePath));
        } else {
            if (file.endsWith('.txt') || file.endsWith('.csv')) {
                results.push(filePath);
            }
        }
    }
    return results;
}

export async function seed() {
    console.log(`📂 [Source B] Scanning US Data Directory: ${US_DATA_DIR}...`);
    try {
        const files = await walkDir(US_DATA_DIR);
        console.log(`Found ${files.length} files to process.`);

        // ========================================
        // PHASE 1: Pre-create all symbols in batch
        // ========================================
        console.log(`\n🔧 Phase 1: Pre-creating symbols in batch...`);
        const tickerSet = new Set<string>();
        
        for (const filePath of files) {
            const filename = filePath.split('/').pop() || "";
            const tickerRaw = filename.split('.')[0]; 
            tickerSet.add(tickerRaw.toUpperCase());
        }
        
        const allTickers = Array.from(tickerSet);
        console.log(`   Found ${allTickers.length} unique tickers`);
        
        // Batch insert symbols (5000 at a time)
        const SYMBOL_BATCH = 5000;
        for (let i = 0; i < allTickers.length; i += SYMBOL_BATCH) {
            const batch = allTickers.slice(i, i + SYMBOL_BATCH).map(ticker => ({
                ticker,
                name: ticker,
                type: 'STOCK' as const,
                isActive: true,
                provider: 'metastock_import'
            }));
            await db.insert(symbols).values(batch).onConflictDoNothing().execute();
        }
        console.log(`   ✅ Symbols created/verified`);
        
        // Load symbol ID map
        const symbolRows = await db.select({ id: symbols.id, ticker: symbols.ticker }).from(symbols);
        const symbolMap = new Map<string, number>();
        symbolRows.forEach(s => symbolMap.set(s.ticker, s.id));
        console.log(`   📋 Loaded ${symbolMap.size} symbol IDs into memory`);

        // ========================================
        // PHASE 2: Process files with high concurrency
        // ========================================
        console.log(`\n📊 Phase 2: Processing market data...`);
        
        const CONCURRENCY = 100; // Increased from 50
        let processedCount = 0;
        let totalRows = 0;
        const total = files.length;
        const startTime = Date.now();
        
        // Accumulator for mega-batch insert
        let dataBuffer: any[] = [];
        const BUFFER_FLUSH_SIZE = 50000; // Flush every 50k rows
        
        const flushBuffer = async () => {
            if (dataBuffer.length === 0) return;
            const toInsert = dataBuffer;
            dataBuffer = [];
            
            // Use bigger chunks
            const CHUNK_SIZE = 5000;
            for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
                const chunk = toInsert.slice(i, i + CHUNK_SIZE);
                await db.insert(marketData)
                    .values(chunk)
                    .onConflictDoNothing()
                    .execute();
            }
            totalRows += toInsert.length;
        };
        
        const processFile = async (filePath: string) => {
            try {
                const filename = filePath.split('/').pop() || "";
                const ticker = filename.split('.')[0].toUpperCase(); 
                const symbolId = symbolMap.get(ticker);
                
                if (!symbolId) return;

                // Read Content
                const content = await Bun.file(filePath).text();
                const lines = content.trim().split('\n');
                if (lines.length < 2) return;

                const firstLine = lines[1].split(',');
                if (firstLine.length < 9) return;
                
                const per = firstLine[1]; 
                const interval = perToInterval(per);

                const fileData: any[] = [];
                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i].split(',');
                    if (row.length < 9) continue;
                    
                    const dateVal = parseDateTime(row[2], row[3]);
                    const open = parseFloat(row[4]);
                    const high = parseFloat(row[5]);
                    const low = parseFloat(row[6]);
                    const close = parseFloat(row[7]);
                    const volume = parseFloat(row[8]);

                    if (isNaN(open)) continue;

                    fileData.push({
                        symbolId,
                        timestamp: dateVal,
                        open,
                        high,
                        low,
                        close,
                        volume,
                        interval
                    });
                }

                // Add to buffer instead of immediate insert
                dataBuffer.push(...fileData);
                
                // Flush if buffer is large enough
                if (dataBuffer.length >= BUFFER_FLUSH_SIZE) {
                    await flushBuffer();
                }
                
            } catch(e) {
                // Silent error for individual files
            }
            
            processedCount++;
            if (processedCount % 500 === 0) {
                const elapsed = (Date.now() - startTime) / 1000;
                const rate = processedCount / elapsed;
                const eta = Math.round((total - processedCount) / rate);
                console.log(`[${Math.round(processedCount/total*100)}%] ${processedCount}/${total} files | ${totalRows.toLocaleString()} rows | ETA: ${eta}s`);
            }
        };

        const queue = [...files];
        const workers = Array(CONCURRENCY).fill(null).map(async () => {
            while(queue.length > 0) {
                const file = queue.shift();
                if(file) await processFile(file);
            }
        });

        await Promise.all(workers);
        
        // Final flush
        await flushBuffer();
        
        const totalTime = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n🏁 US Data Import Complete!`);
        console.log(`   Files: ${processedCount}`);
        console.log(`   Rows: ${totalRows.toLocaleString()}`);
        console.log(`   Time: ${totalTime}s (${Math.round(processedCount/totalTime)} files/s)`);
        
    } catch (e) {
        console.error(e);
        throw e;
    }
}
