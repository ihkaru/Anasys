import type { Logger } from "../../../utils/logger";
import type { CacheService } from "../cache/cache.service";
import type { QuoteService } from "./quote.service";

export class MoversService {
	constructor(
		private quoteService: QuoteService,
		private cacheService: CacheService,
		private logger: Logger,
	) {}

	async getTopMovers(limit = 6) {
		// Cache is handled individually by quoteService for gainers/losers/trending
		// But we can cache the aggregated result too if we want faster response
		const cacheKey = `movers-agg:${limit}`;
		const cached = await this.cacheService.get<any>(cacheKey);
		if (cached) {
			this.logger.debug(`[getTopMovers] Serving aggregated result from cache`);
			return cached;
		}

		const start = performance.now();
		this.logger.info(`[getTopMovers] Fetching global market movers via Yahoo Finance...`);

		try {
			// Run in parallel for speed
			const [gainers, losers, trending] = await Promise.all([
				this.quoteService.getDailyGainers(limit),
				this.quoteService.getDailyLosers(limit),
				this.quoteService.getTrending("US", limit),
			]);

			// Transform if needed, but QuoteWithSparkline is compatible with frontend expectation
			// Frontend expects: { gainers: [], losers: [], trending: [] }
			// Elements should have: id (optional), ticker, name, price, changePercent, sparkline, type

			// Note: QuoteWithSparkline has 'ticker', 'price', etc.
			// It might lack 'id' if it's not in our DB, but frontend should handle ticker as key.

			// DIAGNOSTIC: log any null tickers from each source (should never happen after enrichQuote guard)
			for (const [key, list] of [
				["gainers", gainers],
				["losers", losers],
				["trending", trending],
			] as const) {
				const nullTickers = list.filter((q) => !q.ticker);
				if (nullTickers.length > 0) {
					this.logger.warn(`[getTopMovers] ⚠️ ${key}: ${nullTickers.length} items with null ticker after enrichment!`);
				}
				this.logger.debug(
					`[getTopMovers] ${key} sample:`,
					list.slice(0, 3).map((q) => ({ ticker: q.ticker, name: q.name })),
				);
			}

			const result = {
				gainers: gainers.filter((q) => q.ticker).slice(0, limit),
				losers: losers.filter((q) => q.ticker).slice(0, limit),
				trending: trending.filter((q) => q.ticker).slice(0, limit),
			};

			const duration = (performance.now() - start).toFixed(2);
			this.logger.info(`[getTopMovers] Completed in ${duration}ms.`);

			// Cache aggregated result for 15 minutes
			await this.cacheService.set(cacheKey, result, 15 * 60 * 1000);

			return result;
		} catch (e) {
			this.logger.error(`[getTopMovers] Critical failure: ${(e as Error).message}`, e);
			// Fallback: Return empty structure instead of crashing
			return { gainers: [], losers: [], trending: [] };
		}
	}
}
