
import { sql } from "drizzle-orm";
import { db } from "../db";

async function auditAndClean() {
    console.log("Starting comprehensive market data audit...");
    console.time("Audit Duration");

    // Thresholds
    // Stocks: > 25% range in a single candle is suspicious
    // Crypto: > 60% range in a single candle is suspicious
    // Any asset: Price <= 0 or High > 10x Open
    
    const query = sql`
        WITH anomalies AS (
            SELECT 
                m.symbol_id, 
                m.timestamp, 
                m.interval,
                s.ticker,
                s.type,
                m.open, m.high, m.low, m.close,
                ((m.high - m.low) / NULLIF(m.open, 0)) * 100 as volatility_pct
            FROM market_data m
            JOIN symbols s ON m.symbol_id = s.id
            WHERE 
                -- General sanity checks
                m.high < m.low 
                OR m.open <= 0 
                OR m.close <= 0 
                OR m.high <= 0 
                OR m.low <= 0
                
                -- Volatility checks
                OR (s.type = 'STOCK' AND (m.high - m.low) > (m.open * 0.25))
                OR (s.type = 'CRYPTO' AND (m.high - m.low) > (m.open * 0.60))
                
                -- Extreme wick checks (flash crash/pump)
                OR m.high > (m.open * 5)
        )
        SELECT * FROM anomalies ORDER BY volatility_pct DESC;
    `;

    try {
        const results = await db.execute(query);
        
        if (results.length === 0) {
            console.log("✅ No anomalies found. Market data is healthy.");
            process.exit(0);
        }

        console.log(`⚠️  Found ${results.length} anomalous candles.`);
        
        // Print top 10
        console.log("\nTop 5 Worst Offenders:");
        results.slice(0, 5).forEach((r: any) => {
            console.log(`[${r.ticker}] ${r.interval} @ ${new Date(r.timestamp).toISOString()} | Vol: ${Number(r.volatility_pct).toFixed(0)}%`);
        });

        console.log(`\nDeleting in batches of 50 to avoid DB limits...`);

        // Batch Deletion
        const BATCH_SIZE = 50;
        const affectedTickers = new Set<string>();

        for (let i = 0; i < results.length; i += BATCH_SIZE) {
            const batch = results.slice(i, i + BATCH_SIZE);
            const symbolIds = batch.map((r: any) => r.symbol_id);
            const timestamps = batch.map((r: any) => r.timestamp);
            
            batch.forEach((r: any) => affectedTickers.add(r.ticker));

            // Use simple loop for safety against complex WHERE IN tuples if driver has issues
            // Actually, we can just delete one by one in parallel promises for the batch?
            // Or construct a specific WHERE clause.
            // Let's use a loop of individual deletes for maximum safety against "tuple decompression" limit 
            // since that limit can be hit even with small batches if the chunk is compressed.
            // Actually, `DELETE FROM market_data WHERE symbol_id = X AND timestamp = Y AND interval = Z` 
            // should be fine if done sequentially or in small parallel groups.
            
            await Promise.all(batch.map((r: any) => {
                 return db.execute(sql`
                    DELETE FROM market_data 
                    WHERE symbol_id = ${r.symbol_id} 
                    AND timestamp = ${r.timestamp} 
                    AND interval = ${r.interval}
                `);
            }));

            process.stdout.write(`\rProgress: ${Math.min(i + BATCH_SIZE, results.length)} / ${results.length} deleted...`);
            // Small sleep to let DB breathe
            await new Promise(r => setTimeout(r, 100));
        }

        console.log("\n\n✅ Cleanup complete.");
        console.log("------------------------------------------------");
        console.log(`Affected Tickers (${affectedTickers.size}): ${Array.from(affectedTickers).slice(0, 10).join(', ')}...`);
        console.log("RECOMMENDATION: These tickers have data gaps now. You should re-sync them.");
        
    } catch (e) {
        console.error("Audit failed:", e);
        process.exit(1);
    }
    
    console.timeEnd("Audit Duration");
    process.exit(0);
}

auditAndClean();
