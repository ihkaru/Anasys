import { spawn } from "node:child_process";
import { Logger } from "../../../utils/logger";
import type { IDataProvider, QuoteResult, SearchResult, UnifiedCandle } from "./data-provider.interface";

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

		// Construct full symbol if exchange provided
		const symbol = options.exchange ? `${options.exchange}:${ticker}` : ticker;

		const result = await this.executePython("chart", {
			symbol: symbol,
			interval: options.interval,
			period: options.period,
			limit: limit,
		});

		// Map raw data to UnifiedCandle
		// Bridge script returns [{time, open, high, low, close, volume}, ...]
		const mapped = result
			.map((c: any) => {
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
			})
			.filter((c: UnifiedCandle) => {
				// Reject candles where Number() conversion produced NaN or non-positive prices
				if (Number.isNaN(c.open) || Number.isNaN(c.high) || Number.isNaN(c.low) || Number.isNaN(c.close)) {
					this.logger.warn(`[TradingViewProvider] Rejected NaN candle at ${c.timestamp.toISOString()}`);
					return false;
				}
				if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
					this.logger.warn(`[TradingViewProvider] Rejected non-positive candle at ${c.timestamp.toISOString()}`);
					return false;
				}
				return true;
			});

		this.logger.debug(`[TradingViewProvider] Received ${mapped.length} valid candles from Python`);
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

	// Helper to determine market state based on time (US Centric + IDX)
	private determineMarketState(exchange: string, ticker?: string): "PRE" | "REGULAR" | "POST" | "CLOSED" {
		const exUpper = exchange ? exchange.toUpperCase() : "";
		const tickerUpper = ticker ? ticker.toUpperCase() : "";

		// --- 1. US Markets (ET) ---
		const usExchanges = ["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "OTC"];
		if (usExchanges.some((e) => exUpper.includes(e))) {
			const now = new Date();
			// Get NY time parts
			const formatter = new Intl.DateTimeFormat("en-US", {
				timeZone: "America/New_York",
				hour: "numeric",
				minute: "numeric",
				hour12: false,
			});
			const parts = formatter.formatToParts(now);
			const hourPart = parts.find((p) => p.type === "hour");
			const minutePart = parts.find((p) => p.type === "minute");

			if (hourPart && minutePart) {
				const hour = parseInt(hourPart.value, 10);
				const minute = parseInt(minutePart.value, 10);
				const timeVal = hour * 100 + minute;

				// Extended hours schedule (ET)
				if (timeVal >= 400 && timeVal < 930) return "PRE";
				if (timeVal >= 930 && timeVal < 1600) return "REGULAR";
				if (timeVal >= 1600 && timeVal < 2000) return "POST";
				return "CLOSED";
			}
		}

		// --- 2. Indonesia Markets (IDX) (WIB / UTC+7) ---
		// Identify by Exchange "IDX", "JK SE" or Ticker suffix ".JK"
		const isIDX = exUpper === "IDX" || exUpper.includes("JK") || tickerUpper.endsWith(".JK");

		if (isIDX) {
			const now = new Date();
			// Get Jakarta time
			const formatter = new Intl.DateTimeFormat("en-US", {
				timeZone: "Asia/Jakarta",
				hour: "numeric",
				minute: "numeric",
				hour12: false,
			});

			const parts = formatter.formatToParts(now);
			const hourPart = parts.find((p) => p.type === "hour");
			const minutePart = parts.find((p) => p.type === "minute");

			if (hourPart && minutePart) {
				const hour = parseInt(hourPart.value, 10);
				const minute = parseInt(minutePart.value, 10);
				const timeVal = hour * 100 + minute;

				// IDX Schedule (Mon-Thu)
				// Session 1: 09:00 - 12:00
				// Session 2: 13:30 - ~16:00
				// (Fri slightly different, 09:00-11:30, 14:00-16:00, simplified here for general display)

				// Pre-open (08:45-09:00) -> PRE
				if (timeVal >= 845 && timeVal < 900) return "PRE";

				// Session 1
				if (timeVal >= 900 && timeVal < 1200) return "REGULAR";

				// Break (12:00 - 13:30)
				if (timeVal >= 1200 && timeVal < 1330) return "CLOSED"; // Or break? showing Closed is safer

				// Session 2
				if (timeVal >= 1330 && timeVal < 1600) return "REGULAR";

				// Post-Close? IDX doesn't have improved extended hours trading like US
				return "CLOSED";
			}
		}

		// --- 3. Default for others ---
		// For Crypto or undetermined exchanges, assume Open/Regular to avoid "PRE" confusion
		return "REGULAR";
	}

	async fetchQuotes(tickers: string[]): Promise<QuoteResult[]> {
		if (!tickers.length) return [];
		this.logger.debug(`Fetching quotes for ${tickers.join(",")} from TradingView...`);

		const raw = await this.executePython("quote", { symbols: tickers });

		// Map to format compatible with Yahoo QuoteResult
		return raw.map((r: any) => {
			// Determine market state accurately
			let state: any = "REGULAR";
			const computedState = this.determineMarketState(r.exchange);

			// If computed state is REGULAR, force it (ignore premarket_close artifacts)
			if (computedState === "REGULAR") {
				state = "REGULAR";
			} else {
				// Otherwise trust the data or the computed state
				if (r.postmarket_close) state = "POST";
				else if (r.premarket_close && computedState === "PRE") state = "PRE";
				else if (computedState === "CLOSED") state = "CLOSED";
				else if (r.premarket_close) state = "PRE"; // Fallback
			}

			return {
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
				marketState: state,
				preMarketPrice: r.premarket_close ? Number(r.premarket_close) : undefined,
				preMarketChange: r.premarket_change_abs ? Number(r.premarket_change_abs) : undefined,
				preMarketChangePercent: r.premarket_change ? Number(r.premarket_change) : undefined,
				postMarketPrice: r.postmarket_close ? Number(r.postmarket_close) : undefined,
				postMarketChange: r.postmarket_change_abs ? Number(r.postmarket_change_abs) : undefined,
				postMarketChangePercent: r.postmarket_change ? Number(r.postmarket_change) : undefined,
				source: "TRADINGVIEW",
				exchange: r.exchange, // Maps from Python bridge
			};
		});
	}

	async search(query: string, limit: number = 20): Promise<SearchResult[]> {
		this.logger.debug(`Searching for ${query} on TradingView...`);
		try {
			const results = await this.executePython("search", { query, limit, scanner: "global" });
			return results.map((r: any) => ({
				ticker: r.name || r.symbol?.split(":")[1],
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
