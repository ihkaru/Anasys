
import { sql } from "drizzle-orm";
import { db } from "../db";
import { Logger } from "../utils/logger";

const logger = new Logger('GlobalOutlierAudit');

async function auditGlobalOutliers() {
    logger.info("🛡️ Starting Global Generic Outlier Detection...");
    const start = performance.now();

    try {
        // DETECT FLASH CRASH ANOMALIES (The "Needle" Pattern)
        // Logic: Price drops by > 80% relative to previous candle, AND next candle recovers by > 300%.
        // This indicates a single bad data point like 100 -> 1 -> 100.
        // We use a CTE to calculate previous and next prices.

        logger.info("🔍 Scanning for flash crash anomalies (Drop > 80% then Recover > 300%)...");

        const flashCrashQuery = sql`
            WITH evaluated AS (
                SELECT 
                    symbol_id, 
                    timestamp, 
                    close, 
                    LAG(close) OVER (PARTITION BY symbol_id ORDER BY timestamp) as prev_close,
                    LEAD(close) OVER (PARTITION BY symbol_id ORDER BY timestamp) as next_close
                FROM market_data
            ),
            anomalies AS (
                SELECT * FROM evaluated
                WHERE 
                    prev_close > 0 AND close > 0 AND next_close > 0
                    AND (close / prev_close) < 0.2  -- Drop > 80%
                    AND (next_close / close) > 3.0  -- Recover > 200% (Safety margin)
            )
            DELETE FROM market_data
            WHERE (symbol_id, timestamp) IN (SELECT symbol_id, timestamp FROM anomalies)
            RETURNING symbol_id, timestamp, close;
        `;

        const deletedCrashes = await db.execute(flashCrashQuery);

        if (deletedCrashes.length > 0) {
            logger.warn(`😱 Detected & Deleted ${deletedCrashes.length} Flash Crash Anomalies!`);
            // Get symbol names for context
            const symbolIds = [...new Set(deletedCrashes.map((d: any) => d.symbol_id))];
            const symbols = await db.execute(sql`SELECT id, ticker FROM symbols WHERE id IN ${symbolIds}`);
            const symbolMap = Object.fromEntries(symbols.map((s: any) => [s.id, s.ticker]));

            deletedCrashes.slice(0, 10).forEach((d: any) => {
                logger.debug(`   - [${symbolMap[d.symbol_id]}] ${new Date(d.timestamp).toISOString()}: ${d.close}`);
            });
            if (deletedCrashes.length > 10) logger.debug(`   ... and ${deletedCrashes.length - 10} more.`);
        } else {
            logger.info("✅ No flash crash anomalies found.");
        }


        // DETECT FLASH PUMP ANOMALIES (The Inverse "Needle")
        // Logic: Price pumps > 500% then drops > 80%
        
        logger.info("🔍 Scanning for flash pump anomalies (Pump > 500% then Drop > 80%)...");

        const flashPumpQuery = sql`
            WITH evaluated AS (
                SELECT 
                    symbol_id, 
                    timestamp, 
                    close, 
                    LAG(close) OVER (PARTITION BY symbol_id ORDER BY timestamp) as prev_close,
                    LEAD(close) OVER (PARTITION BY symbol_id ORDER BY timestamp) as next_close
                FROM market_data
            ),
            anomalies AS (
                SELECT * FROM evaluated
                WHERE 
                    prev_close > 0 AND close > 0 AND next_close > 0
                    AND (close / prev_close) > 5.0   -- Pump > 400% increase
                    AND (next_close / close) < 0.25  -- Drop > 75%
            )
            DELETE FROM market_data
            WHERE (symbol_id, timestamp) IN (SELECT symbol_id, timestamp FROM anomalies)
            RETURNING symbol_id, timestamp, close;
        `;

        const deletedPumps = await db.execute(flashPumpQuery);

        if (deletedPumps.length > 0) {
            logger.warn(`🚀 Detected & Deleted ${deletedPumps.length} Flash Pump Anomalies!`);
             const symbolIds = [...new Set(deletedPumps.map((d: any) => d.symbol_id))];
            const symbols = await db.execute(sql`SELECT id, ticker FROM symbols WHERE id IN ${symbolIds}`);
            const symbolMap = Object.fromEntries(symbols.map((s: any) => [s.id, s.ticker]));

            deletedPumps.slice(0, 10).forEach((d: any) => {
                logger.debug(`   - [${symbolMap[d.symbol_id]}] ${new Date(d.timestamp).toISOString()}: ${d.close}`);
            });
        } else {
            logger.info("✅ No flash pump anomalies found.");
        }

        const duration = ((performance.now() - start) / 1000).toFixed(2);
        logger.info(`✨ Global Heuristic Audit Completed in ${duration}s`);
        
    } catch (error) {
        logger.error("Audit failed", error);
        process.exit(1);
    }
    
    process.exit(0);
}

auditGlobalOutliers();
