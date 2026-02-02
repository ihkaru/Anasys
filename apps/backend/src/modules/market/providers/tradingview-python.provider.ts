import { spawn } from "node:child_process";
import { Logger } from "../../../utils/logger";
import type { IDataProvider, UnifiedCandle } from "./data-provider.interface";

/**
 * TradingView Data Provider (Python Bridge)
 * Uses the unofficial 'tradingview-scraper' Python library via child process.
 *
 * WARNING: Unofficial API. Subject to rate limits and blocking.
 * Requires: python3, pandas, tradingview-scraper
 */
export class TradingViewPythonProvider implements IDataProvider {
	private logger = new Logger("TradingViewProvider");
	private pythonPath = "python3"; // Assume in path
	private scriptPath = "src/scripts/bridge_tradingview.py";

	getName(): string {
		return "tradingview-python";
	}

	async fetchChart(ticker: string, options: any): Promise<UnifiedCandle[]> {
		this.logger.debug(`Fetching ${ticker} from TradingView...`);

		let limit = 200; // Default

		// Calculate needed limit if period1 (start date) is provided
		if (options.period1) {
			const start = new Date(options.period1).getTime();
			const now = Date.now();
			const diffMs = now - start;
			const intervalMs = this.getIntervalMs(options.interval);
			if (intervalMs > 0) {
				limit = Math.ceil(diffMs / intervalMs) + 50; // Add buffer
				// Cap at reasonable max for TradingView to avoid timeouts/blocks
				if (limit > 5000) limit = 5000;
			}
		} else if (options.limit) {
			limit = Number(options.limit);
		}

		this.logger.debug(`[TradingViewProvider] Requesting ${limit} candles for ${ticker} (${options.interval})`);

		const result = await this.executePython("chart", {
			symbol: ticker,
			interval: options.interval,
			period: options.period,
			limit: limit,
		});

		// Map raw data to UnifiedCandle
		// Bridge script returns [{time, open, high, low, close, volume}, ...]
		const mapped = result.map((c: any) => {
			let ts = c.time || c.date || c.timestamp;
			// Unix timestamp in seconds? Convert to ms
			if (typeof ts === "number" && ts < 2000000000) {
				ts *= 1000;
			}
			return {
				timestamp: new Date(ts),
				open: Number(c.open),
				high: Number(c.high),
				low: Number(c.low),
				close: Number(c.close),
				volume: Number(c.volume || 0),
			};
		});

		this.logger.debug(`[TradingViewProvider] Received ${mapped.length} candles from Python`);
		return mapped;
	}

	private getIntervalMs(interval: string): number {
		const num = parseInt(interval, 10);
		const unit = interval.replace(/[0-9]/g, "");

		let multiplier = 0;
		switch (unit) {
			case "m":
				multiplier = 60 * 1000;
				break;
			case "h":
				multiplier = 60 * 60 * 1000;
				break;
			case "d":
				multiplier = 24 * 60 * 60 * 1000;
				break;
			case "w":
				multiplier = 7 * 24 * 60 * 60 * 1000;
				break;
			case "mo":
				multiplier = 30 * 24 * 60 * 60 * 1000;
				break; // Approx
			default:
				return 0;
		}
		return (num || 1) * multiplier;
	}

	async fetchQuoteSummary(_ticker: string, _modules: string[]): Promise<any> {
		this.logger.warn("fetchQuoteSummary not implemented for TradingViewPythonProvider");
		return {};
	}

	async fetchQuotes(tickers: string[]): Promise<any[]> {
		if (tickers.length === 0) return [];
		this.logger.debug(`Fetching quotes for ${tickers.join(",")} from TradingView`);

		// Use clean tickers (no exchange prefix for search if possible, or handle inside python)
		const cleanTickers = tickers.map((t) => {
			if (t.includes(":")) return t.split(":")[1];
			return t;
		});

		const raw = await this.executePython("quote", { tickers: cleanTickers });

		// Map to format compatible with Yahoo QuoteResult
		return raw.map((r: any) => ({
			ticker: r.name, // or keep original?
			price: Number(r.close || 0),
			// Screener usually returns 'change' as %. And 'change_abs' as value.
			// Yahoo 'change' is absolute, 'changePercent' is %.
			change: Number(r.change_abs || r.change || 0),
			changePercent: Number(r.change || 0), // Screener 'change' is %
			volume: Number(r.volume || 0),
			marketCap: Number(r.market_cap_basic || 0),
			currency: r.currency || "USD",
			displayName: r.name,
			// Extended Hours Logic
			marketState: r.postmarket_close ? "POST" : r.premarket_close ? "PRE" : "REGULAR",
			preMarketPrice: r.premarket_close ? Number(r.premarket_close) : undefined,
			preMarketChange: r.premarket_change_abs ? Number(r.premarket_change_abs) : undefined,
			preMarketChangePercent: r.premarket_change ? Number(r.premarket_change) : undefined,
			postMarketPrice: r.postmarket_close ? Number(r.postmarket_close) : undefined,
			postMarketChange: r.postmarket_change_abs ? Number(r.postmarket_change_abs) : undefined,
			postMarketChangePercent: r.postmarket_change ? Number(r.postmarket_change) : undefined,
		}));
	}

	async search(query: string, limit: number = 20): Promise<any[]> {
		this.logger.debug(`Searching for ${query} on TradingView...`);
		try {
			const results = await this.executePython("search", { query, limit, scanner: "global" });
			return results.map((r: any) => ({
				symbol: r.name || r.symbol?.split(":")[1],
				name: r.description || r.name,
				type: r.type,
				exchange: r.exchange,
				currency: r.currency,
				price: r.close,
				change: r.change,
				marketCap: r.market_cap_basic,
				source: "TRADINGVIEW",
				fullSymbol: r.symbol, // e.g., "NASDAQ:MU"
			}));
		} catch (e) {
			this.logger.error("TradingView search failed:", e);
			return []; // Graceful fallback
		}
	}

	async fetchTrending(_region: string, _count: number): Promise<any[]> {
		return [];
	}

	async fetchRecommendations(_ticker: string): Promise<string[]> {
		return [];
	}

	async fetchDailyGainers(count: number): Promise<any[]> {
		return this.executePython("movers", { category: "gainers", count });
	}

	async fetchDailyLosers(count: number): Promise<any[]> {
		return this.executePython("movers", { category: "losers", count });
	}

	/**
	 * Execute the Python bridge script
	 */
	private executePython(command: string, args: any): Promise<any> {
		return new Promise((resolve, reject) => {
			const process = spawn(this.pythonPath, [this.scriptPath, command, JSON.stringify(args)]);

			let dataString = "";
			let errorString = "";

			process.stdout.on("data", (data) => {
				dataString += data.toString();
			});

			process.stderr.on("data", (data) => {
				errorString += data.toString();
			});

			process.on("close", (code) => {
				if (code !== 0) {
					const errorMsg = errorString || dataString || `Unknown error (exit code ${code})`;
					this.logger.error(`Python script failed: ${errorMsg}`);
					reject(new Error(`TradingView Bridge failed: ${errorMsg}`));
					return;
				}
				try {
					const lines = dataString.trim().split("\n");
					const lastLine = lines[lines.length - 1];
					this.logger.debug(`[Python Bridge] Raw output last line: ${lastLine.substring(0, 200)}...`);
					const result = JSON.parse(lastLine);

					if (result.error) {
						reject(new Error(result.error));
					} else {
						resolve(result.data || []);
					}
				} catch (_e) {
					reject(new Error(`Invalid JSON from Python script: ${dataString}`));
				}
			});
		});
	}
}
