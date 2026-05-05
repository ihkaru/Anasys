import { Redis } from "ioredis";
import { Logger } from "../../../utils/logger";
import type { IDataProvider, QuoteResult, SearchResult, UnifiedCandle } from "./data-provider.interface";

/**
 * TradingView Native Provider
 * 1. Search: Uses public TradingView HTTP API (Direct fetch).
 * 2. History: Delegates to Rust Engine via Redis Task Queue.
 */
export class TradingViewNativeProvider implements IDataProvider {
	private logger = new Logger("TradingViewNative");
	private redis: Redis;

	constructor() {
		this.redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
	}

	getName(): string {
		return "tradingview-native";
	}

	async fetchChart(ticker: string, options: any): Promise<UnifiedCandle[]> {
		this.logger.debug(`[Native] Requesting OHLCV for ${ticker} via Rust Engine...`);

		const taskId = Math.random().toString(36).substring(7);
		const task = {
			id: taskId,
			command: "ohlcv",
			payload: {
				ticker,
				interval: options.interval,
				assetType: options.assetType || "STOCK",
				start: options.start ? Math.floor(new Date(options.start).getTime() / 1000) : 0,
				end: options.end ? Math.floor(new Date(options.end).getTime() / 1000) : Math.floor(Date.now() / 1000),
			},
		};

		// Push to Rust Engine
		await this.redis.lpush("harvest:tasks:queue", JSON.stringify(task));
		this.logger.info(`[Native] Task pushed to Rust: ${ticker} (${options.interval})`);

		// Since this is non-blocking (the user sees data once synced to QuestDB),
		// we return an empty array here. The next request (or WebSocket) will pick up the data.
		return [];
	}

	async fetchQuotes(_tickers: string[]): Promise<QuoteResult[]> {
		// Quotes still need a bridge or more complex WS logic.
		// For now, we can fallback to the Python bridge or implement a simple REST fetch if available.
		return [];
	}

	async search(query: string, limit: number = 20): Promise<SearchResult[]> {
		this.logger.debug(`[Native] Searching for ${query}...`);
		try {
			const url = `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(query)}`;
			const res = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Origin: "https://www.tradingview.com",
					Referer: "https://www.tradingview.com/",
				},
			});

			if (!res.ok) throw new Error(`Search API failed: ${res.status}`);
			const data = await res.json();

			return (data.symbols || []).slice(0, limit).map((r: any) => ({
				ticker: r.symbol,
				name: r.description || r.symbol,
				type: r.type,
				exchange: r.exchange,
				currency: r.currency_code || r.currency,
				source: "TRADINGVIEW",
				fullSymbol: r.symbol.includes(":") ? r.symbol : `${r.exchange}:${r.symbol}`,
			}));
		} catch (e) {
			this.logger.error("[Native] Search failed:", e);
			return [];
		}
	}

	async fetchQuoteSummary(_ticker: string, _modules: string[]): Promise<any> {
		return {};
	}

	async fetchTrending(_region: string, _count: number): Promise<any[]> {
		return [];
	}

	async fetchRecommendations(_ticker: string): Promise<string[]> {
		return [];
	}

	async fetchDailyGainers(_count: number): Promise<any[]> {
		return [];
	}

	async fetchDailyLosers(_count: number): Promise<any[]> {
		return [];
	}
}
