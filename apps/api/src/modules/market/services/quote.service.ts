import type { Logger } from "../../../utils/logger";
import type { CacheService } from "../cache/cache.service";
import type { QuoteResult, SearchResult } from "../providers/data-provider.interface";
import type { YahooFinanceProvider } from "../providers/yahoo-finance.provider";
import type { MarketDataRepository } from "../repositories/market-data.repository";
import type { SymbolRepository } from "../repositories/symbol.repository";
import { generateSparkline } from "../utils/sparkline.utils";

export interface QuoteWithSparkline extends QuoteResult {
	sparkline: number[];
	type: "STOCK" | "CRYPTO";
	iconUrl?: string;
	website?: string;
	// Extended hours data (inherited from QuoteResult, but explicit here for clarity if needed)
	marketState?: "PRE" | "PREPRE" | "REGULAR" | "POST" | "POSTPOST" | "CLOSED";
	preMarketPrice?: number;
	preMarketChange?: number;
	preMarketChangePercent?: number;
	postMarketPrice?: number;
	postMarketChange?: number;
	postMarketChangePercent?: number;
}

import type { TradingViewPythonProvider } from "../providers/tradingview-python.provider";

export class QuoteService {
	private readonly QUOTE_CACHE_TTL = 5 * 1000; // 5 seconds cache for quotes
	private readonly SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for search
	private readonly TRENDING_CACHE_TTL = 15 * 60 * 1000; // 15 minutes for trending

	constructor(
		private symbolRepo: SymbolRepository,
		private marketDataRepo: MarketDataRepository,
		private dataProvider: YahooFinanceProvider,
		private tvProvider: TradingViewPythonProvider,
		private cacheService: CacheService,
		private logger: Logger,
	) {}

	/**
	 * Get real-time quotes for multiple tickers
	 * Uses cache to avoid hitting Yahoo too often
	 */
	async getQuotes(tickers: string[], period: string = "1d", source: string = "YAHOO"): Promise<QuoteWithSparkline[]> {
		if (!tickers.length) return [];

		this.logger.debug(`Getting quotes for ${tickers.length} tickers (period=${period}, source=${source})`);

		const results: QuoteWithSparkline[] = [];
		const tickersToFetch: string[] = [];

		// Check cache first
		// Cache key must include period AND source!
		for (const ticker of tickers) {
			const cacheKey = `quote:${ticker}:${period}:${source}`;
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

		this.logger.debug(`Fetching ${tickersToFetch.length} quotes from ${source}`);

		// Fetch from Provider
		const BATCH_SIZE = 5;
		const DELAY_MS = 500;

		for (let i = 0; i < tickersToFetch.length; i += BATCH_SIZE) {
			const batch = tickersToFetch.slice(i, i + BATCH_SIZE);

			try {
				let quotes: QuoteResult[];
				if (source === "TRADINGVIEW") {
					// Use TradingView Provider
					quotes = await this.tvProvider.fetchQuotes(batch);
				} else {
					// Default to Yahoo
					quotes = await this.dataProvider.fetchQuotes(batch);
				}

				// Enrich and Cache
				for (const quote of quotes) {
					const enriched = await this.enrichQuote(quote, period);
					if (enriched) {
						// Cache it with source-aware TTL
						// Fast sources (TV, Crypto) get sub-second cache
						const isCrypto =
							quote.ticker.includes("-USD") || quote.ticker.includes("-PERP") || enriched.type === "CRYPTO";
						const isFastSource = source === "TRADINGVIEW" || isCrypto;
						const ttl = isFastSource ? 1 : this.QUOTE_CACHE_TTL;

						this.cacheService.set(`quote:${quote.ticker}:${period}:${source}`, enriched, ttl);
						results.push(enriched);
					}
				}
			} catch (e) {
				this.logger.error(`Batch quote fetch failed:`, e);
			}

			// Delay between batches (except last)
			if (i + BATCH_SIZE < tickersToFetch.length) {
				await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
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
			let interval = "1d";
			let limit = 7;

			switch (period.toLowerCase()) {
				case "24h":
					interval = "1h"; // Assuming we have 1h data
					limit = 24;
					break;
				case "7d":
					interval = "1d";
					limit = 7;
					break;
				case "30d":
					interval = "1d";
					limit = 30;
					break;
				case "90d":
					interval = "1d";
					limit = 90;
					break;
				default:
					interval = "1d";
					limit = 7;
			}

			// Get sparkline from recent market data
			let sparkline: number[] = [];
			let periodChange = quote.change;
			let periodChangePercent = quote.changePercent;

			if (symbol) {
				const recentCandles = await this.marketDataRepo.getRecentCandles(symbol.id, interval, limit);
				// Since getRecentCandles returns DESC, we need to reverse to show correct graph (left to right) if it is time based
				sparkline = recentCandles.map((c) => Number(c.close)).reverse();

				// Filter outliers: If a single point is > 50% away from its neighbors
				if (sparkline.length > 3) {
					sparkline = sparkline.map((val, idx, arr) => {
						if (idx === 0 || idx === arr.length - 1) return val;
						const prev = arr[idx - 1];
						const next = arr[idx + 1];
						const avg = (prev + next) / 2;
						if (Math.abs(val - avg) / avg > 0.5) {
							return avg;
						}
						return val;
					});
				}

				// Fix: Append current real-time price to sparkline if valid
				// This ensures the graph ends at the current price, preventing "disconnect" where graph shows down
				// but price is up (due to gap up after last historical candle)
				if (quote.price && quote.price > 0) {
					// Only append if we have some data, or even if we don't?
					// If we have history, check if the last point is significantly different or just old.
					// For simplicity, always append current quote price to reflect "NOW".
					// But we should allow small dupe if the last candle close IS the current price.
					const lastVal = sparkline[sparkline.length - 1];
					if (!lastVal || Math.abs(lastVal - quote.price) > 0.0001) {
						sparkline.push(quote.price);
					}
				}

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
				type: (symbol?.type as "STOCK" | "CRYPTO") || (quote.ticker.includes("-USD") ? "CRYPTO" : "STOCK"),
				sparkline,
				iconUrl: symbol?.iconUrl || undefined,
				website: symbol?.website || undefined,
			};
		} catch (e) {
			this.logger.error(`Failed to enrich quote for ${quote.ticker}`, e);
			return {
				...quote,
				type: quote.ticker.includes("-USD") ? "CRYPTO" : "STOCK",
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
	async getTrending(region: string = "US", count: number = 10): Promise<QuoteWithSparkline[]> {
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
		const tickers = trending.map((t) => t.ticker);
		const quotes = await this.getQuotes(tickers);

		// Cache results
		if (quotes.length > 0) {
			this.cacheService.set(cacheKey, quotes, this.TRENDING_CACHE_TTL);
		}

		return quotes;
	}

	/**
	 * Get Daily Gainers
	 */
	async getDailyGainers(count: number = 10): Promise<QuoteWithSparkline[]> {
		const cacheKey = `gainers:${count}`;
		const cached = this.cacheService.get<QuoteWithSparkline[]>(cacheKey);
		if (cached) return cached;

		this.logger.debug(`Fetching daily gainers (count=${count})`);
		const result = await this.dataProvider.fetchDailyGainers(count);

		if (result.length === 0) return [];

		const tickers = result.map((q) => q.ticker);
		const quotes = await this.getQuotes(tickers, "1d");

		if (quotes.length > 0) {
			this.cacheService.set(cacheKey, quotes, this.TRENDING_CACHE_TTL);
		}
		return quotes;
	}

	/**
	 * Get Daily Losers
	 */
	async getDailyLosers(count: number = 10): Promise<QuoteWithSparkline[]> {
		const cacheKey = `losers:${count}`;
		const cached = this.cacheService.get<QuoteWithSparkline[]>(cacheKey);
		if (cached) return cached;

		this.logger.debug(`Fetching daily losers (count=${count})`);
		const result = await this.dataProvider.fetchDailyLosers(count);

		if (result.length === 0) return [];

		const tickers = result.map((q) => q.ticker);
		const quotes = await this.getQuotes(tickers, "1d");

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
