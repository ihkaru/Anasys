
import yahooFinance from "yahoo-finance2";
import { IDataProvider } from "./data-provider.interface";

export interface QuoteResult {
    ticker: string;
    name: string;
    price: number;
    previousClose: number;
    change: number;
    changePercent: number;
    volume: number;
    marketCap?: number;
    high52Week?: number;
    low52Week?: number;
    updatedAt: Date;
}

export interface SearchResult {
    ticker: string;
    name: string;
    type: string;
    exchange: string;
    score?: number;
}

export interface TrendingResult {
    ticker: string;
    name?: string;
}

export class YahooFinanceProvider implements IDataProvider {
    private client: any;

    constructor() {
        this.client = new (yahooFinance as any)();
    }

    async fetchChart(ticker: string, options: any): Promise<any> {
        return await this.client.chart(ticker, options);
    }
    
    async fetchQuoteSummary(ticker: string, modules: string[]): Promise<any> {
        return await this.client.quoteSummary(ticker, { modules });
    }

    /**
     * Fetch real-time quotes for multiple tickers
     * Rate limit: ~2000 requests/hour for quote endpoint
     */
    async fetchQuotes(tickers: string[]): Promise<QuoteResult[]> {
        const results: QuoteResult[] = [];
        
        // Yahoo quote() can handle multiple tickers
        for (const ticker of tickers) {
            try {
                const quote = await this.client.quote(ticker);
                if (quote) {
                    results.push({
                        ticker: quote.symbol,
                        name: quote.shortName || quote.longName || ticker,
                        price: quote.regularMarketPrice || 0,
                        previousClose: quote.regularMarketPreviousClose || 0,
                        change: quote.regularMarketChange || 0,
                        changePercent: quote.regularMarketChangePercent || 0,
                        volume: quote.regularMarketVolume || 0,
                        marketCap: quote.marketCap,
                        high52Week: quote.fiftyTwoWeekHigh,
                        low52Week: quote.fiftyTwoWeekLow,
                        updatedAt: new Date(),
                    });
                }
            } catch (e) {
                // Skip failed tickers, don't break the batch
                console.warn(`Quote fetch failed for ${ticker}:`, (e as Error).message);
            }
        }
        
        return results;
    }

    /**
     * Search for symbols by query
     */
    async search(query: string, limit: number = 10): Promise<SearchResult[]> {
        try {
            const result = await this.client.search(query, { 
                newsCount: 0, 
                quotesCount: limit 
            });
            
            // Filter out items without valid symbol (can happen with some Yahoo results)
            return (result.quotes || [])
                .filter((q: any) => q && q.symbol)
                .map((q: any) => ({
                    ticker: q.symbol,
                    name: q.shortname || q.longname || q.symbol,
                    type: q.quoteType || 'EQUITY',
                    exchange: q.exchange || '',
                    score: q.score,
                }));
        } catch (e) {
            console.error('Search failed:', (e as Error).message);
            return [];
        }
    }

    /**
     * Get trending symbols by region
     */
    async fetchTrending(region: string = 'US', count: number = 10): Promise<TrendingResult[]> {
        try {
            const result = await this.client.trendingSymbols(region, { count });
            
            return (result.quotes || []).map((q: any) => ({
                ticker: q.symbol,
                name: q.shortName || q.longName,
            }));
        } catch (e) {
            console.error('Trending fetch failed:', (e as Error).message);
            return [];
        }
    }

    /**
     * Get recommendations for a symbol
     */
    async fetchRecommendations(ticker: string): Promise<string[]> {
        try {
            const result = await this.client.recommendationsBySymbol(ticker);
            return (result.recommendedSymbols || []).map((r: any) => r.symbol);
        } catch (e) {
            console.error(`Recommendations fetch failed for ${ticker}:`, (e as Error).message);
            return [];
        }
    }

    /**
     * Get Daily Gainers (Global) - Using Screener
     */
    async fetchDailyGainers(count = 10): Promise<QuoteResult[]> {
        try {
            // Use 'screener' module as dailyGainers is deprecated
            // Predefined screener ID for day gainers is 'day_gainers'
            const result = await this.client.screener({ scrIds: 'day_gainers', count, region: 'US', lang: 'en-US' });
            return this.mapQuotes(result.quotes || []);
        } catch (e) {
            console.error('Daily Gainers fetch failed:', (e as Error).message);
            return [];
        }
    }

    /**
     * Get Daily Losers (Global) - Using Screener
     */
    async fetchDailyLosers(count = 10): Promise<QuoteResult[]> {
        try {
            // Use 'screener' module as dailyLosers is deprecated
            // Predefined screener ID for day losers is 'day_losers'
            const result = await this.client.screener({ scrIds: 'day_losers', count, region: 'US', lang: 'en-US' });
            return this.mapQuotes(result.quotes || []);
        } catch (e) {
            console.error('Daily Losers fetch failed:', (e as Error).message);
            return [];
        }
    }

    private mapQuotes(quotes: any[]): QuoteResult[] {
        return quotes
            .filter((q: any) => q && q.symbol)
            .map((quote: any) => ({
                ticker: quote.symbol,
                name: quote.shortName || quote.longName || quote.symbol,
                price: quote.regularMarketPrice || 0,
                previousClose: quote.regularMarketPreviousClose || 0,
                change: quote.regularMarketChange || 0,
                changePercent: quote.regularMarketChangePercent || 0,
                volume: quote.regularMarketVolume || 0,
                marketCap: quote.marketCap,
                high52Week: quote.fiftyTwoWeekHigh,
                low52Week: quote.fiftyTwoWeekLow,
                updatedAt: new Date(),
            }));
    }

    getName(): string {
        return 'yahoo-finance';
    }
}
