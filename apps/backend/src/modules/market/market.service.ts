
import { db } from "../../db";
import { Logger } from "../../utils/logger";
import { CacheService } from "./cache/cache.service";
import { YahooFinanceProvider } from "./providers/yahoo-finance.provider";
import { MarketDataRepository } from "./repositories/market-data.repository";
import { SymbolRepository } from "./repositories/symbol.repository";
import { CandleService } from "./services/candle.service";
import { FinancialsService } from "./services/financials.service";
import { MoversService } from "./services/movers.service";
import { OverviewService } from "./services/overview.service";
import { QuoteService } from "./services/quote.service";
import { SymbolService } from "./services/symbol.service";
import { SyncService } from "./services/sync.service";

// Initialize Dependencies
// Note: In a real NestJS app this would be in a module. 
// Here we manually wire them up.

const logger = new Logger('MarketService');
const symbolRepo = new SymbolRepository(db);
const marketDataRepo = new MarketDataRepository(db);
const dataProvider = new YahooFinanceProvider();
const cacheService = new CacheService();

const symbolService = new SymbolService(symbolRepo, dataProvider, logger);
const syncService = new SyncService(symbolService, marketDataRepo, dataProvider, logger);
const candleService = new CandleService(symbolService, syncService, marketDataRepo, logger);
const overviewService = new OverviewService(symbolRepo, marketDataRepo, logger);
const moversService = new MoversService(marketDataRepo, symbolRepo, cacheService, logger, db);
const quoteService = new QuoteService(symbolRepo, marketDataRepo, dataProvider, cacheService, logger);
const financialsService = new FinancialsService(dataProvider);

export class MarketService {
    
    // Delegate to SymbolService
    async ensureSymbol(ticker: string, type: 'STOCK' | 'CRYPTO') {
        return symbolService.ensureSymbol(ticker, type);
    }

    async getSymbols() {
        return symbolService.getSymbols();
    }

    async enrichSymbol(ticker: string) {
        return symbolService.enrichSymbol(ticker);
    }

    async getSymbolByTicker(ticker: string) {
        return symbolService.getSymbolByTicker(ticker);
    }
    
    // Delegate to SyncService
    async syncSymbolData(ticker: string, type: 'STOCK' | 'CRYPTO', interval: string = '1h', endDate?: Date) {
        return syncService.syncSymbolData(ticker, type, interval, endDate);
    }
    
    // Delegate to CandleService
    async getOHLCV(ticker: string, interval: string, limit: number, before?: string) {
        return candleService.getOHLCV(ticker, interval, limit, before);
    }
    
    async getDownsampledCandles(ticker: string, resolution: string, limit: number) {
        return candleService.getDownsampledCandles(ticker, resolution, limit);
    }
    
    // Delegate to OverviewService (for backward compatibility)
    async getMarketOverview(tickers: string[]) {
        return overviewService.getMarketOverview(tickers);
    }
    
    // Delegate to MoversService
    async getTopMovers(limit = 6) {
        return moversService.getTopMovers(limit);
    }

    // ===== Delegate to QuoteService =====
    
    /**
     * Get real-time quotes for multiple tickers
     * Uses caching to avoid rate limiting
     */
    async getQuotes(tickers: string[], period: string = '7d') {
        return quoteService.getQuotes(tickers, period);
    }

    /**
     * Search for symbols using Yahoo Finance
     */
    async searchSymbols(query: string, limit: number = 15) {
        return quoteService.search(query, limit);
    }

    /**
     * Get trending symbols
     */
    async getTrendingSymbols(region: string = 'US', count: number = 10) {
        return quoteService.getTrending(region, count);
    }

    /**
     * Get recommendations for a symbol
     */
    async getRecommendations(ticker: string) {
        return quoteService.getRecommendations(ticker);
    }

    // ===== Delegate to FinancialsService =====

    /**
     * Get financial metrics for a stock (PE, margins, etc)
     * Data from: summaryDetail, financialData, defaultKeyStatistics
     */
    async getFinancials(ticker: string) {
        return financialsService.getFinancials(ticker);
    }

    /**
     * Get earnings data (history, calendar, trend)
     * Data from: earnings, earningsHistory, calendarEvents
     */
    async getEarnings(ticker: string) {
        return financialsService.getEarnings(ticker);
    }

    /**
     * Get analyst ratings breakdown (buy/hold/sell)
     * Data from: recommendationTrend
     */
    async getAnalystRatings(ticker: string) {
        return financialsService.getAnalystRatings(ticker);
    }
}

// Export singleton
export const marketService = new MarketService();
