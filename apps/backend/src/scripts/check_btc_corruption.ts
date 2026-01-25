
import { and, eq, gte, lte } from 'drizzle-orm';
import { marketData, symbols } from '../../../../packages/db/src/schema'; // Adjust path if needed
import { db } from '../db';

async function checkCorruption() {
    try {
        console.log("Checking for BTC-USD data around Dec 25-27, 2025...");

        // 1. Get Symbol ID
        const [symbol] = await db.select().from(symbols).where(eq(symbols.ticker, 'BTC-USD')).limit(1);
        
        if (!symbol) {
            console.error("Symbol BTC-USD not found!");
            process.exit(1);
        }
        console.log(`Found BTC-USD with ID: ${symbol.id}`);

        // 2. Query Data
        const records = await db.select()
            .from(marketData)
            .where(and(
                eq(marketData.symbolId, symbol.id),
                gte(marketData.timestamp, new Date('2025-12-25')),
                lte(marketData.timestamp, new Date('2025-12-28'))
            ))
            .orderBy(marketData.timestamp);

        console.log(`Found ${records.length} records:`);
        // Only print if there are suspicious values (low price) or just print summary
        let suspiciousCount = 0;
        records.forEach(r => {
            if (Number(r.close) < 1000) {
                 console.log(`[SUSPICIOUS] ${r.timestamp.toISOString()} | Close: ${r.close}`);
                 suspiciousCount++;
            }
        });
        
        if (suspiciousCount === 0) {
            console.log("No suspicious records (< 1000) found in this range.");
        } else {
            console.log(`Found ${suspiciousCount} suspicious records.`);
        }

    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
}

checkCorruption();
