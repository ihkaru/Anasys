
import { Logger } from "../../../utils/logger";
import { MarketDataRepository } from "../repositories/market-data.repository";
import { SymbolService } from "./symbol.service";
import { SyncService } from "./sync.service";

export class CandleService {
    constructor(
        private symbolService: SymbolService,
        private syncService: SyncService,
        private marketDataRepo: MarketDataRepository,
        private logger: Logger
    ) {}

    async getOHLCV(ticker: string, interval = '1d', limit = 100, before?: string) {
        // this.logger.debug(`[getOHLCV] Request: ${ticker} (${interval}) before=${before || 'now'}`);
        
        const symbol = await this.symbolService.getSymbolByTicker(ticker);
        if (!symbol) throw new Error(`Symbol ${ticker} not found`);
        
        const beforeDate = before ? new Date(before) : undefined;

        // Smart Stale Check (Only if getting LATEST data i.e. !before)
        if (!beforeDate) {
            const lastTimestamp = await this.marketDataRepo.getLastTimestamp(symbol.id, interval);
            const isStale = this.isStale(lastTimestamp, interval);
            
            if (isStale) {
                this.logger.info(`[getOHLCV] Data stale for ${ticker} (${interval}). Last: ${lastTimestamp?.toISOString() || 'NEVER'}. Syncing...`);
                try {
                    await this.syncService.syncSymbolData(ticker, symbol.type, interval);
                } catch (e) {
                     // Rate limit or API error shouldn't block returning existing data
                    this.logger.warn(`[getOHLCV] Auto-sync failed, returning stale data`, e);
                }
            }
        }

        let candles = await this.marketDataRepo.getRawCandles(symbol.id, interval, limit, beforeDate);

        if (candles.length === 0 && beforeDate ) {
             // Try backfilling if historical data requested but missing
             this.logger.info(`[getOHLCV] Historical data missing for ${ticker}, backfilling...`);
             const startBackfill = Date.now();
             try {
                await this.syncService.syncSymbolData(ticker, symbol.type, interval, beforeDate);
                this.logger.info(`[getOHLCV] Backfill sync took ${Date.now() - startBackfill}ms`);
                
                const startQuery = Date.now();
                candles = await this.marketDataRepo.getRawCandles(symbol.id, interval, limit, beforeDate);
                this.logger.info(`[getOHLCV] Backfill query took ${Date.now() - startQuery}ms`);
             } catch (e) {
                this.logger.error(`[getOHLCV] Backfill failed`, e);
             }
        }

        return candles.reverse().map(c => ({
            timestamp: c.timestamp,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume)
        }));
    }

    private isStale(lastDate: Date | null, interval: string): boolean {
        if (!lastDate) return true;
        
        const now = new Date();
        const diffMs = now.getTime() - lastDate.getTime();
        const diffMinutes = diffMs / (1000 * 60);
        
        // Thresholds (slightly loose to account for API delays)
        switch (interval) {
            case '1m': return diffMinutes > 5;   // 5 min old
            case '5m': return diffMinutes > 10;
            case '15m': return diffMinutes > 20; // Allow 20 min lag
            case '30m': return diffMinutes > 40;
            case '1h': return diffMinutes > 75;  // 1h 15m
            case '4h': return diffMinutes > 260; 
            case '1d': return diffMinutes > 1600; // > 26 hours (allow for next day market open)
            case '1wk': return diffMinutes > 10080 + 1440; // 1 week + 1 day
            default: return diffMinutes > 60;
        }
    }


    async getDownsampledCandles(ticker: string, resolution: string = '1 day', limit = 1000) {
        const symbol = await this.symbolService.getSymbolByTicker(ticker);
        if (!symbol) throw new Error("Symbol not found");
        
        const result = await this.marketDataRepo.getDownsampled(symbol.id, resolution, limit);
        
        return result.reverse().map((row: any) => ({
            timestamp: new Date(row.bucket),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: Number(row.volume)
        }));
    }
}
