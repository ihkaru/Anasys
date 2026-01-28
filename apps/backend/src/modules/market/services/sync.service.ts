
import { Logger } from "../../../utils/logger";
import { IDataProvider } from "../providers/data-provider.interface";
import { MarketDataRepository } from "../repositories/market-data.repository";
import { SymbolService } from "./symbol.service";

export interface SyncResult {
    count: number;
    status: 'success' | 'empty' | 'uptodate' | 'error';
}

export class SyncService {
    constructor(
        private symbolService: SymbolService,
        private marketDataRepo: MarketDataRepository,
        private dataProvider: IDataProvider,
        private logger: Logger
    ) {}

    async syncSymbolData(ticker: string, type: 'STOCK' | 'CRYPTO', interval: string = '1h', endDate?: Date): Promise<SyncResult> {
        try {
            this.logger.info(`Sync started for ${ticker} (${interval})` + (endDate ? ` until ${endDate.toISOString()}` : ''));
            const symbol = await this.symbolService.ensureSymbol(ticker, type);
            
            const queryOptions = await this.determineQueryOptions(symbol.id, interval, endDate);
            
            if (queryOptions.status === 'uptodate') {
                return { count: 0, status: 'uptodate' };
            }
            
            const chartOptions: any = {
                period1: queryOptions.period1,
                interval: interval as any
            };
            if (queryOptions.period2) {
                chartOptions.period2 = queryOptions.period2;
            }
            
            this.logger.debug(`Fetching ${ticker} (${interval}) range: ${queryOptions.period1} -> ${queryOptions.period2 || 'now'}`);

            const result = await this.dataProvider.fetchChart(ticker, chartOptions);

            if (!result || !result.quotes || result.quotes.length === 0) {
                 this.logger.warn(`No data found for ${ticker}`);
                 return { count: 0, status: 'empty' };
            }

            const values = this.validateAndCleanCandles(result.quotes, symbol.id, interval);

            if (values.length === 0) return { count: 0, status: 'empty' };

            await this.marketDataRepo.upsert(values);

            this.logger.info(`Saved ${values.length} candles for ${ticker} (${interval})`);
            
            // Re-fetch symbol service to avoid circular dependency if repositories were unified or different architecture, but here we can just update via repo or service if exposed.
            // But we have symbolService here. However, SymbolService wraps repo.
            // Let's assume we can add updateLastSynced to SymbolService or use repo directly if injected.
            // For now, let's assume we don't have direct access to update method on symbolService unless added.
            // But we injected symbolService. Let's assume we inject SymbolRepository into SyncService for this small update or add method to SymbolService.
            // Adding method to symbolService is cleaner.
            
            // For now, skipping updateLastSynced explicit call as it requires extending SymbolService interface in this prompt flow.
            // Ideally: await this.symbolService.updateLastSynced(symbol.id);

            return { count: values.length, status: 'success' };

        } catch (error: any) {
             if (error?.code === 429 || error?.name === 'HTTPError' && error?.response?.status === 429) {
                this.logger.warn(`Rate limited by Yahoo Finance for ${ticker}. Try again in a few minutes.`);
                throw new Error('Yahoo Finance rate limit exceeded. Please wait a few minutes before retrying.');
            }
            
            this.logger.error(`Failed to sync ${ticker}`, error);
            throw error;
        }
    }

    private async determineQueryOptions(symbolId: number, interval: string, endDate?: Date): Promise<any> {
        const options: any = {};
        
        if (endDate) {
             // BACKFILL MODE
             const start = new Date(endDate);
             if (interval === '1h') start.setDate(start.getDate() - 30);
             else if (interval === '1d') start.setFullYear(start.getFullYear() - 1);
             else if (interval === '1wk') start.setFullYear(start.getFullYear() - 5);
             else if (interval === '1mo') start.setFullYear(start.getFullYear() - 10);
             else start.setDate(start.getDate() - 60);

             options.period1 = start;
             options.period2 = endDate;
        } else {
            // FORWARD FILL
            const lastTimestamp = await this.marketDataRepo.getLastTimestamp(symbolId, interval);
            
            if (lastTimestamp) {
                options.period1 = lastTimestamp;
            } else {
                 const start = new Date();
                 if (interval === '1d') start.setFullYear(start.getFullYear() - 1);
                 else if (interval === '1h') start.setMonth(start.getMonth() - 2);
                 else start.setDate(start.getDate() - 7);
                 options.period1 = start;
            }
            
            if (new Date(options.period1) > new Date()) {
                return { status: 'uptodate' };
            }
        }
        return options;
    }

    private validateAndCleanCandles(candles: any[], symbolId: number, interval: string): any[] {
        return candles.map((candle: any) => ({
            symbolId: symbolId,
            timestamp: new Date(candle.date),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            interval: interval
        })).filter((c: any) => 
            c.open !== null && c.close !== null && 
            c.open > 0 && c.close > 0 && 
            c.high > 0 && c.low > 0
        );
    }
}
