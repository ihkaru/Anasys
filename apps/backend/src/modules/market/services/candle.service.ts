
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
        this.logger.debug(`[getOHLCV] Request: ${ticker} (${interval}) before=${before || 'now'}`);
        
        const symbol = await this.symbolService.getSymbolByTicker(ticker);
        if (!symbol) throw new Error(`Symbol ${ticker} not found`);
        
        const beforeDate = before ? new Date(before) : undefined;

        let candles = await this.marketDataRepo.getRawCandles(symbol.id, interval, limit, beforeDate);

        if (candles.length === 0) {
            this.logger.info(`[getOHLCV] Data missing/insufficient for ${ticker}, syncing...`);
            try {
                if (beforeDate) {
                    await this.syncService.syncSymbolData(ticker, symbol.type, interval, beforeDate);
                } else {
                    await this.syncService.syncSymbolData(ticker, symbol.type, interval);
                }
                
                candles = await this.marketDataRepo.getRawCandles(symbol.id, interval, limit, beforeDate);
            } catch (e) {
                this.logger.error(`[getOHLCV] Auto-sync failed for ${ticker}`, e);
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
