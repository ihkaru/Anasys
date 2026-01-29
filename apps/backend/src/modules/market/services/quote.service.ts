
import { Logger } from "../../../utils/logger";
import { CacheService } from "../cache/cache.service";
import { YahooFinanceProvider, type QuoteResult, type SearchResult } from "../providers/yahoo-finance.provider";
import { MarketDataRepository } from "../repositories/market-data.repository";
import { SymbolRepository } from "../repositories/symbol.repository";
import { generateSparkline } from "../utils/sparkline.utils";

export interface QuoteWithSparkline extends QuoteResult {
    sparkline: number[];
    type: 'STOCK' | 'CRYPTO';
    iconUrl?: string;
    website?: string;
}

export class QuoteService {
    private readonly QUOTE_CACHE_TTL = 60 * 1000; // 1 minute cache for quotes
    private readonly SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for search
    private readonly TRENDING_CACHE_TTL = 15 * 60 * 1000; // 15 minutes for trending
    
    constructor(
        private symbolRepo: SymbolRepository,
        private marketDataRepo: MarketDataRepository,
        private dataProvider: YahooFinanceProvider,
        private cacheService: CacheService,
        private logger: Logger
    ) {}

    /**
     * Get real-time quotes for multiple tickers
     * Uses cache to avoid hitting Yahoo too often
     */
    async getQuotes(tickers: string[], period: string = '1d'): Promise<QuoteWithSparkline[]> {
        if (!tickers.length) return [];

        this.logger.debug(`Getting quotes for ${tickers.length} tickers (period=${period})`);
        
        const results: QuoteWithSparkline[] = [];
        const tickersToFetch: string[] = [];
        
        // Check cache first
        // Cache key must include period!
        for (const ticker of tickers) {
            const cacheKey = `quote:${ticker}:${period}`;
            const cached = this.cacheService.get<QuoteWithSparkline>(cacheKey);
            if (cached) {
                results.push(cached);
            } else {
                tickersToFetch.push(ticker);
            }
        }
        
        if (tickersToFetch.length === 0) {
            this.logger.debug(`All ${tickers.length} quotes served from cache`);
            return results;
        }
        
        this.logger.debug(`Fetching ${tickersToFetch.length} quotes from Yahoo`);
        
        // Fetch from Yahoo with rate limiting (batch in groups of 5 with delay)
        const BATCH_SIZE = 5;
        const DELAY_MS = 500; // 0.5s between batches to be safe
        
        for (let i = 0; i < tickersToFetch.length; i += BATCH_SIZE) {
            const batch = tickersToFetch.slice(i, i + BATCH_SIZE);
            
            try {
                const quotes = await this.dataProvider.fetchQuotes(batch);
                
                // Enrich with symbol data and sparkline
                for (const quote of quotes) {
                    const enriched = await this.enrichQuote(quote, period);
                    if (enriched) {
                        // Cache it
                        this.cacheService.set(`quote:${quote.ticker}:${period}`, enriched, this.QUOTE_CACHE_TTL);
                        results.push(enriched);
                    }
                }
            } catch (e) {
                this.logger.error(`Batch quote fetch failed:`, e);
            }
            
            // Delay between batches (except last)
            if (i + BATCH_SIZE < tickersToFetch.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
        }
        
        return results;
    }

    /**
     * Enrich quote with local DB data (type, sparkline, icon)
     */
    private async enrichQuote(quote: QuoteResult, period: string): Promise<QuoteWithSparkline | null> {
        try {
            // Get symbol info from DB
            const symbol = await this.symbolRepo.findByTicker(quote.ticker);
            
            // Determine interval and limit based on period
            let interval = '1d';
            let limit = 7;
            
            switch (period.toLowerCase()) {
                case '24h':
                    interval = '1h'; // Assuming we have 1h data
                    limit = 24;
                    break;
                case '7d':
                    interval = '1d';
                    limit = 7;
                    break;
                case '30d':
                    interval = '1d';
                    limit = 30;
                    break;
                case '90d':
                    interval = '1d';
                    limit = 90;
                    break;
                default:
                    interval = '1d';
                    limit = 7;
            }

            // Get sparkline from recent market data
            let sparkline: number[] = [];
            let periodChange = quote.change;
            let periodChangePercent = quote.changePercent;

            if (symbol) {
                const recentCandles = await this.marketDataRepo.getRecentCandles(symbol.id, interval, limit);
                // Since getRecentCandles returns DESC, we need to reverse to show correct graph (left to right) if it is time based
                // getRecentCandles returns: order by timestamp desc. So index 0 is latest.
                // Sparkline usually expects [oldest, ..., newest].
                sparkline = recentCandles.map(c => Number(c.close)).reverse();

                // Calculate period-based return if we have history
                if (sparkline.length > 0) {
                    const startPrice = sparkline[0];
                    if (startPrice > 0) {
                        periodChange = quote.price - startPrice;
                        periodChangePercent = ((quote.price - startPrice) / startPrice) * 100;
                    }
                }
            }
            
            // If no sparkline data, generate based on change direction
            if (sparkline.length < 2) {
                sparkline = generateSparkline(quote.changePercent >= 0);
                // If we simulated sparkline, we keep original daily change as fallback
                periodChange = quote.change;
                periodChangePercent = quote.changePercent;
            }
            
            return {
                ...quote,
                change: periodChange,
                changePercent: periodChangePercent,
                type: symbol?.type as 'STOCK' | 'CRYPTO' || (quote.ticker.includes('-USD') ? 'CRYPTO' : 'STOCK'),
                sparkline,
                iconUrl: symbol?.iconUrl || undefined,
                website: symbol?.website || undefined,
            };
        } catch (e) {
            this.logger.error(`Failed to enrich quote for ${quote.ticker}`, e);
            return {
                ...quote,
                type: quote.ticker.includes('-USD') ? 'CRYPTO' : 'STOCK',
                sparkline: generateSparkline(quote.changePercent >= 0),
            };
        }
    }

    /**
     * Search for symbols - combines Yahoo search with local DB
     */
    async search(query: string, limit: number = 15): Promise<SearchResult[]> {
        if (!query || query.length < 1) return [];
        
        const cacheKey = `search:${query.toLowerCase()}:${limit}`;
        const cached = this.cacheService.get<SearchResult[]>(cacheKey);
        if (cached) {
            return cached;
        }
        
        this.logger.debug(`Searching for: ${query}`);
        
        // Search Yahoo Finance
        const results = await this.dataProvider.search(query, limit);
        
        // Cache results
        if (results.length > 0) {
            this.cacheService.set(cacheKey, results, this.SEARCH_CACHE_TTL);
        }
        
        return results;
    }

    /**
     * Get trending symbols with quotes
     */
    async getTrending(region: string = 'US', count: number = 10): Promise<QuoteWithSparkline[]> {
        const cacheKey = `trending:${region}:${count}`;
        const cached = this.cacheService.get<QuoteWithSparkline[]>(cacheKey);
        if (cached) {
            return cached;
        }
        
        this.logger.debug(`Fetching trending symbols for region: ${region}`);
        
        // Get trending tickers from Yahoo
        const trending = await this.dataProvider.fetchTrending(region, count);
        
        if (trending.length === 0) {
            return [];
        }
        
        // Get quotes for trending tickers
        const tickers = trending.map(t => t.ticker);
        const quotes = await this.getQuotes(tickers);
        
        // Cache results
        if (quotes.length > 0) {
            this.cacheService.set(cacheKey, quotes, this.TRENDING_CACHE_TTL);
        }
        
        return quotes;
    }

    /**
     * Get recommendations for a symbol
     */
    async getRecommendations(ticker: string): Promise<QuoteWithSparkline[]> {
        const cacheKey = `recommendations:${ticker}`;
        const cached = this.cacheService.get<QuoteWithSparkline[]>(cacheKey);
        if (cached) {
            return cached;
        }
        
        this.logger.debug(`Fetching recommendations for: ${ticker}`);
        
        const recommendedTickers = await this.dataProvider.fetchRecommendations(ticker);
        
        if (recommendedTickers.length === 0) {
            return [];
        }
        
        // Get quotes for recommended tickers (limit to 5)
        const quotes = await this.getQuotes(recommendedTickers.slice(0, 5));
        
        // Cache for 1 hour (recommendations don't change often)
        if (quotes.length > 0) {
            this.cacheService.set(cacheKey, quotes, 60 * 60 * 1000);
        }
        
        return quotes;
    }
}
