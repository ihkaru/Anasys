
import { sql } from "drizzle-orm";
import { db } from "../db";
import { Logger } from "../utils/logger";

const logger = new Logger('GlobalOutlierAuditBatched');

async function auditGlobalOutliersBatched() {
    logger.info("🛡️ Starting Global Generic Outlier Detection (Batched by Symbol)...");
    const start = performance.now();

    try {
        // 1. Get all symbol IDs
        const symbols = await db.execute(sql`SELECT id, ticker FROM symbols WHERE is_active = true`);
        logger.info(`📋 Found ${symbols.length} active symbols to audit.`);

        let totalDeletedCrashes = 0;
        let totalDeletedPumps = 0;

        // 2. Process per symbol to avoid DB massive transaction logs/RAM usage
        for (const [i, symbol] of symbols.entries()) {
            const symId = symbol.id;
            const ticker = symbol.ticker;

            // Log progress every 100 symbols
            if (i % 100 === 0) logger.debug(`   Processing ${i}/${symbols.length} (${ticker})...`);

            // FLASH CRASH (DB Calc)
            const crashResult = await db.execute(sql`
                WITH evaluated AS (
                    SELECT 
                        symbol_id, 
                        timestamp, 
                        close, 
                        LAG(close) OVER (ORDER BY timestamp) as prev_close,
                        LEAD(close) OVER (ORDER BY timestamp) as next_close
                    FROM market_data
                    WHERE symbol_id = ${symId}
                ),
                anomalies AS (
                    SELECT timestamp
                    FROM evaluated
                    WHERE 
                        prev_close > 0 AND close > 0 AND next_close > 0
                        AND (close / prev_close) < 0.2 
                        AND (next_close / close) > 3.0
                )
                DELETE FROM market_data
                WHERE symbol_id = ${symId} AND timestamp IN (SELECT timestamp FROM anomalies)
                RETURNING close;
            `);

            if (crashResult.length > 0) {
                logger.warn(`   [${ticker}] 📉 Removed ${crashResult.length} flash crashes.`);
                totalDeletedCrashes += crashResult.length;
            }

            // FLASH PUMP (DB Calc)
            const pumpResult = await db.execute(sql`
                WITH evaluated AS (
                    SELECT 
                        symbol_id, 
                        timestamp, 
                        close, 
                        LAG(close) OVER (ORDER BY timestamp) as prev_close,
                        LEAD(close) OVER (ORDER BY timestamp) as next_close
                    FROM market_data
                    WHERE symbol_id = ${symId}
                ),
                anomalies AS (
                    SELECT timestamp
                    FROM evaluated
                    WHERE 
                        prev_close > 0 AND close > 0 AND next_close > 0
                        AND (close / prev_close) > 5.0
                        AND (next_close / close) < 0.25
                )
                DELETE FROM market_data
                WHERE symbol_id = ${symId} AND timestamp IN (SELECT timestamp FROM anomalies)
                RETURNING close;
            `);

            if (pumpResult.length > 0) {
                logger.warn(`   [${ticker}] 🚀 Removed ${pumpResult.length} flash pumps.`);
                totalDeletedPumps += pumpResult.length;
            }
        }

        const duration = ((performance.now() - start) / 1000).toFixed(2);
        logger.info(`✨ Global Audit Completed in ${duration}s`);
        logger.info(`   - Total Crashes Removed: ${totalDeletedCrashes}`);
        logger.info(`   - Total Pumps Removed: ${totalDeletedPumps}`);
        
    } catch (error) {
        logger.error("Audit failed", error);
        process.exit(1);
    }
    
    process.exit(0);
}

auditGlobalOutliersBatched();
