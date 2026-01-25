import { symbols } from "@packages/db/src/schema";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { Logger } from "../../utils/logger";
import { marketService } from "../market/market.service";

const logger = new Logger('SchedulerService');

export class SchedulerService {
    private intervalId: Timer | null = null;
    private readonly INTERVAL_MS = 60 * 60 * 1000; // 1 Hour

    start() {
        logger.info('Scheduler started. Interval: 1h');
        
        // Run immediately on startup? Maybe not, to avoid slow startup.
        // Let's run it after a short delay.
        setTimeout(() => this.runJob(), 5000);

        this.intervalId = setInterval(() => {
            this.runJob();
        }, this.INTERVAL_MS);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('Scheduler stopped');
        }
    }

    private async runJob() {
        logger.info('Running scheduled market sync...');
        try {
            // "Smart Rotation" - Pick 15 oldest updated symbols
            const BATCH_SIZE = 15;
            
            const staleSymbols = await db.select().from(symbols)
                .where(eq(symbols.isActive, true))
                .orderBy(asc(symbols.lastSyncedAt)) // Nulls first (never synced) or oldest first
                .limit(BATCH_SIZE);

            if (staleSymbols.length === 0) {
                logger.info('No active symbols to sync.');
                return;
            }

            logger.info(`Syncing batch of ${staleSymbols.length} stale symbols (Oldest: ${staleSymbols[0].lastSyncedAt})`);

            for (const symbol of staleSymbols) {
                try {
                    // Sync 1d and 1h
                    await marketService.syncSymbolData(symbol.ticker, symbol.type as 'STOCK' | 'CRYPTO', '1d');
                    await marketService.syncSymbolData(symbol.ticker, symbol.type as 'STOCK' | 'CRYPTO', '1h');
                    
                    // Respect Rate Limits: 1 request every 2-3 seconds is safe for batch of 15
                    await new Promise(resolve => setTimeout(resolve, 3000)); 

                } catch (e: any) {
                    logger.error(`Scheduled sync failed for ${symbol.ticker}: ${e.message}`);
                    // If it fails, maybe touch lastSyncedAt so it doesn't get stuck in loop constantly failing?
                    // Optional: bump it by 1 hour to retry later
                    await db.update(symbols).set({ lastSyncedAt: new Date() }).where(eq(symbols.id, symbol.id));
                }
            }
            logger.info('Batch sync completed.');
        } catch (e) {
            logger.error('Critical error in scheduler job', e);
        }
    }
}

export const schedulerService = new SchedulerService();
