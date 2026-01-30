
import { sql } from "drizzle-orm";
import { db } from "../db";
import { Logger } from "../utils/logger";

const logger = new Logger('GlobalAudit');

async function auditGlobal() {
    logger.info("🛡️ Starting Global Anomaly Audit...");
    const start = performance.now();

    try {
        // 1. Delete basic invalid data (Negative prices/volumes, High < Low)
        const basicInvalid = await db.execute(sql`
            DELETE FROM market_data 
            WHERE 
                open < 0 OR 
                high < 0 OR 
                low < 0 OR 
                close < 0 OR
                volume < 0 OR
                high < low
            RETURNING symbol_id, timestamp, close;
        `);
        
        if (basicInvalid.length > 0) {
            logger.warn(`🗑️ Deleted ${basicInvalid.length} records with negative values or invalid High/Low.`);
        } else {
            logger.info("✅ No basic invalid data found (Negative prices, etc).");
        }

        // 2. Specific fix for BTC-USD ghost data (Price < 1000 after 2020)
        // First get BTC symbol ID
        const btcSymbol = await db.execute(sql`SELECT id FROM symbols WHERE ticker = 'BTC-USD' LIMIT 1`);
        
        if (btcSymbol.length > 0) {
            const btcId = btcSymbol[0].id;
            const btcGhosts = await db.execute(sql`
                DELETE FROM market_data 
                WHERE 
                    symbol_id = ${btcId} AND 
                    (
                        (close < 1500 AND timestamp > '2020-01-01') OR
                        (close < 50000 AND timestamp > '2025-01-01')
                    )
                RETURNING timestamp, close;
            `);

            if (btcGhosts.length > 0) {
                logger.warn(`👻 Exorcised ${btcGhosts.length} ghost candles for BTC-USD (Close < 1000).`);
                btcGhosts.forEach((g: any) => {
                    logger.debug(`   - Deleted ghost: ${new Date(g.timestamp).toISOString()} Price: ${g.close}`);
                });
            } else {
                logger.info("✅ No BTC-USD ghost data found.");
            }
        }

        // 3. Detect Extreme Flash Crashes/Pumps (> 90% change in single candle relative to close)
        // This is expensive, so we might want to do it selectively or limit the scope.
        // For now, let's look for suspicious absolute values first.
        // Let's look for Zero values which shouldn't exist for most things
        const zeroValues = await db.execute(sql`
            DELETE FROM market_data 
            WHERE close = 0 OR high = 0 OR low = 0
            RETURNING symbol_id, timestamp;
        `);
        
        if (zeroValues.length > 0) {
            logger.warn(`🗑️ Deleted ${zeroValues.length} records with ZERO values.`);
        }

        const duration = ((performance.now() - start) / 1000).toFixed(2);
        logger.info(`🎉 Global Audit Completed in ${duration}s`);
        
    } catch (error) {
        logger.error("Audit failed", error);
        process.exit(1);
    }
    
    process.exit(0);
}

auditGlobal();
