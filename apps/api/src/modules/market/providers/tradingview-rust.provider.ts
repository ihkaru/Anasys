import { Logger } from "../../../utils/logger";
import { redisConnection } from "../../scheduler/queue";
import type { IDataProvider, QuoteResult, SearchResult, UnifiedCandle } from "./data-provider.interface";

/**
 * TradingView Data Provider (Rust Native)
 * Delegates tasks to the high-performance Rust Performance Engine via Redis.
 */
export class TradingViewRustProvider implements IDataProvider {
	private logger = new Logger("TradingViewRustProvider");

	getName(): string {
		return "tradingview-rust";
	}

	async fetchChart(ticker: string, options: any): Promise<UnifiedCandle[]> {
		const startOpt = options.start || options.period1;
		const endOpt = options.end || options.period2;

		const raw = await this.executeTask("ohlcv_direct", {
			ticker,
			interval: options.interval || "1d",
			assetType: options.assetType || "STOCK",
			start: startOpt ? Math.floor(new Date(startOpt).getTime() / 1000) : 0,
			end: endOpt ? Math.floor(new Date(endOpt).getTime() / 1000) : 0,
		});

		if (!Array.isArray(raw)) {
			return [];
		}

		return raw.map((c: any) => ({
			timestamp: new Date(c.timestamp * 1000),
			open: c.open,
			high: c.high,
			low: c.low,
			close: c.close,
			volume: c.volume,
		}));
	}

	async fetchQuoteSummary(_ticker: string, _modules: string[]): Promise<any> {
		return {};
	}

	async fetchQuotes(tickers: string[]): Promise<QuoteResult[]> {
		if (!tickers.length) return [];

		const raw = await this.executeTask("quote", { tickers });

		return raw.map((r: any) => ({
			ticker: r.symbol,
			name: r.name,
			price: r.price || 0,
			change: r.change || 0,
			changePercent: r.change || 0, // Screener 'change' is %
			volume: 0, // Screener doesn't always return volume in the requested columns here
			updatedAt: new Date(),
			source: "TRADINGVIEW",
			exchange: r.exchange,
		}));
	}

	async search(query: string, limit: number = 20): Promise<SearchResult[]> {
		const results = await this.executeTask("search", { query, limit });

		return results.map((r: any) => ({
			ticker: r.symbol,
			name: r.description || r.name,
			type: r.tv_type,
			exchange: r.exchange,
			currency: r.currency,
			source: "TRADINGVIEW",
			fullSymbol: r.symbol,
		}));
	}

	async fetchTrending(_region?: string, _count?: number): Promise<any[]> {
		return [];
	}

	async fetchRecommendations(_ticker: string): Promise<string[]> {
		return [];
	}

	async fetchDailyGainers(count: number = 20): Promise<QuoteResult[]> {
		const raw = await this.executeTask("movers", { market: "stocks-usa", category: "gainers", limit: count });
		return this.mapMovers(raw);
	}

	async fetchDailyLosers(count: number = 20): Promise<QuoteResult[]> {
		const raw = await this.executeTask("movers", { market: "stocks-usa", category: "losers", limit: count });
		return this.mapMovers(raw);
	}

	private mapMovers(raw: any[]): QuoteResult[] {
		return raw.map((r: any) => ({
			ticker: r.symbol,
			name: r.name,
			price: r.price || 0,
			change: r.change || 0,
			changePercent: r.change || 0,
			volume: 0,
			updatedAt: new Date(),
			source: "TRADINGVIEW",
			exchange: r.exchange,
			previousClose: 0,
		}));
	}

	/**
	 * Delegates a command to the Rust Performance Engine.
	 * Implements a low-latency request/response cycle over Redis.
	 */
	private async executeTask(command: string, payload: any): Promise<any> {
		const id = crypto.randomUUID();
		const taskRequest = JSON.stringify({ id, command, payload });
		const start = Date.now();

		this.logger.info(`[Task] Sending ${command} (id: ${id}) to Engine...`);

		try {
			// 1. Push to task queue
			await redisConnection.rpush("harvest:tasks:queue", taskRequest);

			// 2. Wait for response (BRPOP with 30s timeout)
			const responseKey = `harvest:tasks:response:${id}`;
			const result = await redisConnection.brpop(responseKey, 30);

			if (!result) {
				throw new Error(`Task ${command} timed out after 30s`);
			}

			const [_key, jsonStr] = result;
			if (!jsonStr) return [];
			
			const data = JSON.parse(jsonStr);

			if (data && typeof data === "object" && data.error) {
				const errMsg = data.error.toLowerCase();
				if (errMsg.includes("rate limit") || errMsg.includes("429")) {
					this.logger.warn(`[Task] TradingView Rate Limit detected for ${command}. Returning empty.`);
					return [];
				}
				throw new Error(`Engine Error: ${data.error}`);
			}

			this.logger.info(`[Task] Received response for ${command} in ${Date.now() - start}ms`);
			return data;
		} catch (error) {
			this.logger.error(`[Task] Failed to execute ${command}:`, error);
			throw error;
		}
	}
}
