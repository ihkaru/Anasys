import type Redis from "ioredis";
import { getDataValidator } from "../../../utils/data-validator";
import type { Logger } from "../../../utils/logger";
import { getYahooRateLimiter } from "../../../utils/rate-limiter";
import type { UnifiedCandle } from "../providers/data-provider.interface";
import type { DataProviderFactory } from "../providers/provider.factory";

import type { SymbolService } from "./symbol.service";
import { questDbService } from "./QuestDBService";

export interface SyncResult {
	count: number;
	status: "success" | "empty" | "uptodate" | "error";
	rejected?: number;
}

export class SyncService {
	private rateLimiter = getYahooRateLimiter();
	private dataValidator = getDataValidator();

	constructor(
		private symbolService: SymbolService,
		private providerFactory: DataProviderFactory,
		private redis: Redis,
		private logger: Logger,
	) {}

	async syncSymbolData(
		ticker: string,
		type: "STOCK" | "CRYPTO",
		interval: string = "1h",
		endDate?: Date,
		source: string = "YAHOO",
	): Promise<SyncResult> {
		try {
			// ── Priority Throttling (ADR-0021) ──────────────────────────────────
			// Signal background workers to pause for 30s to prioritize this request
			await this.redis.set("harvest:backfill:paused", "1", "EX", 30);

			this.logger.info(
				`Sync started for ${ticker} (${interval}) via ${source}${endDate ? ` until ${endDate.toISOString()}` : ""}`,
			);
			const symbol = await this.symbolService.ensureSymbol(ticker, type);
			const provider = this.providerFactory.getProvider(source);

			const queryOptions = await this.determineQueryOptions(ticker, interval, endDate, source);

			if (queryOptions.status === "uptodate") {
				return { count: 0, status: "uptodate" };
			}

			const chartOptions: any = {
				period1: queryOptions.period1,
				interval: interval as any,
				exchange: symbol.exchange,
				limit: interval === "1d" ? 1500 : 500, // Greedy fetch for daily data
				isCrypto: type === "CRYPTO",
			};

			if (queryOptions.period2) {
				chartOptions.period2 = queryOptions.period2;
				// If we have both periods, estimate the necessary limit to avoid over-fetching (ADR-0020)
				const diffMs = queryOptions.period2.getTime() - queryOptions.period1.getTime();
				const intervalMs = this.getIntervalMs(interval);
				if (intervalMs > 0) {
					// Add 10% buffer for gaps
					chartOptions.limit = Math.min(5000, Math.ceil((diffMs / intervalMs) * 1.1));
				}
			}

			// Enable Pre/Post market data for US stocks to match TradingView and fix alignment gaps
			// Disable for IDX (.JK) stocks — IDX doesn't have meaningful pre/post market,
			// and Yahoo returns flat closing auction candles that corrupt hourly data
			// Explicit Extended Hours Config (ADR-0017)
			// Avoids auction noise in IDX/HKEX while keeping US gap analysis
			const EXTENDED_HOURS_CONFIG: Record<string, boolean> = {
				NASDAQ: true,
				NYSE: true,
				AMEX: true,
				ARCA: true,
				IDX: false,
				HKEX: false,
				DEFAULT: false,
			};

			const exchange = (symbol.exchange || "DEFAULT").toUpperCase();
			chartOptions.includePrePost = EXTENDED_HOURS_CONFIG[exchange] ?? EXTENDED_HOURS_CONFIG.DEFAULT;

			this.logger.debug(
				`Fetching ${ticker} (${interval}) range: ${queryOptions.period1} -> ${queryOptions.period2 || "now"}`,
			);

			// If source is TRADINGVIEW, check if we have a mapped symbol in DB
			let effectiveTicker = ticker;
			if (source === "TRADINGVIEW" && symbol.tradingviewSymbol) {
				effectiveTicker = symbol.tradingviewSymbol;
				if (symbol.tradingviewExchange) {
					chartOptions.exchange = symbol.tradingviewExchange;
				}
				this.logger.debug(`[SyncService] Using mapped TV symbol: ${effectiveTicker} for ${ticker}`);
			}

			// Use rate limiter with Adaptive Bisection (ADR-0022)
			const startFetch = Date.now();
			const result = await this.fetchWithAdaptiveBisection(provider, effectiveTicker, chartOptions, ticker);
			this.logger.debug(`[SyncService] API Fetch (${source}) took ${Date.now() - startFetch}ms`);

			if (!result || result.length === 0) {
				this.logger.warn(`No data found for ${ticker} on ${source}`);
				return { count: 0, status: "empty" };
			}

			// Use enhanced validation
			const isCrypto = type === "CRYPTO";
			const { values, rejected } = this.validateAndCleanCandlesEnhanced(
				result,
				symbol.id,
				interval,
				isCrypto,
				ticker,
				source,
				symbol.lotSize || 1,
			);

			if (values.length === 0) {
				this.logger.warn(`All ${result.length} candles rejected for ${ticker}`);
				return { count: 0, status: "empty", rejected };
			}

			const startUpsert = Date.now();
			await questDbService.writeCandles(values, ticker, interval, source);
			this.logger.debug(`[SyncService] QuestDB Write (${values.length} items) took ${Date.now() - startUpsert}ms`);

			this.logger.info(
				`Saved ${values.length} candles for ${ticker} (${interval})` +
					(rejected > 0 ? ` [${rejected} rejected as anomalies]` : ""),
			);

			// ── Signal INGEST-PENDING to Rust Engine (ADR-0012) ──────────────────
			// Add to active set and publish signal so Engine starts real-time harvesting
			const upperTicker = ticker.toUpperCase();
			this.redis
				.multi()
				.sadd("harvest:realtime:symbols", upperTicker)
				.publish("harvest:ingest-pending", upperTicker)
				.exec()
				.catch((err) => this.logger.error(`Failed to signal INGEST-PENDING for ${ticker}`, err));

			return { count: values.length, status: "success", rejected };
		} catch (error: any) {
			// Rate limiter already handles 429 with retries, but if all retries fail:
			if (this.isRateLimitError(error)) {
				this.logger.warn(`Rate limited by Yahoo Finance for ${ticker}. All retries exhausted.`);
				throw new Error("Yahoo Finance rate limit exceeded. Please wait a few minutes before retrying.");
			}

			this.logger.error(`Failed to sync ${ticker}`, error);
			throw error;
		}
	}

	/**
	 * Adaptive Bisection Strategy:
	 * If a large window fetch returns empty or fails, splits it into smaller parts
	 * to bypass provider-side density rejections or timeouts.
	 */
	private async fetchWithAdaptiveBisection(
		provider: any,
		ticker: string,
		options: any,
		originalTicker: string,
		depth = 0,
	): Promise<UnifiedCandle[]> {
		const MAX_DEPTH = 2; // Split up to 4 parts (2^2)

		try {
			const result = (await this.rateLimiter.execute(
				() => provider.fetchChart(ticker, options),
				`chart:${originalTicker}`,
			)) as UnifiedCandle[];

			// If we got data, or we are not in a mode that needs bisection (no range specified)
			if (result.length > 0 || !options.period1 || !options.period2 || depth >= MAX_DEPTH) {
				return result;
			}

			// If empty but we have a large window, try bisection
			const diffMs = options.period2.getTime() - options.period1.getTime();
			const intervalMs = this.getIntervalMs(options.interval);

			// Only bisect if the window is significantly larger than the interval (at least 10x)
			if (diffMs > intervalMs * 10) {
				this.logger.warn(`[SyncService] Empty result for ${originalTicker} at depth ${depth}. Trying Bisection...`);

				const mid = new Date(options.period1.getTime() + diffMs / 2);

				const [part1, part2] = await Promise.all([
					this.fetchWithAdaptiveBisection(provider, ticker, { ...options, period2: mid }, originalTicker, depth + 1),
					this.fetchWithAdaptiveBisection(provider, ticker, { ...options, period1: mid }, originalTicker, depth + 1),
				]);

				return [...part1, ...part2];
			}

			return result;
		} catch (error: any) {
			// If it's a timeout or rate limit, and we haven't reached max depth, try bisecting immediately
			const isRetryable = error.message?.includes("Timeout") || this.isRateLimitError(error);

			if (isRetryable && options.period1 && options.period2 && depth < MAX_DEPTH) {
				this.logger.warn(`[SyncService] Fetch failed (${error.message}) for ${originalTicker}. Bisecting window...`);
				const diffMs = options.period2.getTime() - options.period1.getTime();
				const mid = new Date(options.period1.getTime() + diffMs / 2);

				const [part1, part2] = await Promise.all([
					this.fetchWithAdaptiveBisection(provider, ticker, { ...options, period2: mid }, originalTicker, depth + 1),
					this.fetchWithAdaptiveBisection(provider, ticker, { ...options, period1: mid }, originalTicker, depth + 1),
				]);

				return [...part1, ...part2];
			}
			throw error;
		}
	}

	private isRateLimitError(error: any): boolean {
		return (
			error?.code === 429 ||
			error?.status === 429 ||
			error?.response?.status === 429 ||
			error?.message?.includes("429") ||
			error?.message?.toLowerCase().includes("rate limit") ||
			error?.message?.includes("Circuit Breaker") ||
			error?.message?.toLowerCase().includes("timeout")
		);
	}

	private validateAndCleanCandlesEnhanced(
		candles: UnifiedCandle[],
		symbolId: number,
		interval: string,
		isCrypto: boolean,
		ticker: string,
		source: string,
		lotSize: number,
	): { values: any[]; rejected: number } {
		let rejected = 0;
		// Deduplicate by timestamp. Intraday keeps raw timestamp, macroscopic intervals are normalized.
		const candleMap = new Map<number, any>();
		const isMacroscopic = ["1d", "1wk", "1mo"].includes(interval);

		candles.forEach((candle: any) => {
			// Basic null check
			if (candle.open === null || candle.close === null || candle.high === null || candle.low === null) {
				rejected++;
				return;
			}

			const finalDate = new Date(candle.timestamp);

			// Industry Standard: floor(timestamp, interval) normalization (ADR-0016)
			const ts = finalDate.getTime();
			let normalizedTs = ts;

			if (interval === "1m") normalizedTs = Math.floor(ts / 60000) * 60000;
			else if (interval === "5m") normalizedTs = Math.floor(ts / 300000) * 300000;
			else if (interval === "15m") normalizedTs = Math.floor(ts / 900000) * 900000;
			else if (interval === "1h") normalizedTs = Math.floor(ts / 3600000) * 3600000;
			else if (isMacroscopic) {
				finalDate.setUTCHours(0, 0, 0, 0);
				if (interval === "1wk") {
					const day = finalDate.getUTCDay();
					const diff = finalDate.getUTCDate() - day + (day === 0 ? -6 : 1);
					finalDate.setUTCDate(diff);
				} else if (interval === "1mo") {
					finalDate.setUTCDate(1);
				}
				normalizedTs = finalDate.getTime();
			}

			const timestamp = normalizedTs;
			finalDate.setTime(normalizedTs);
			const candleValue = {
				symbolId: symbolId,
				timestamp: finalDate,
				open: candle.open,
				high: candle.high,
				low: candle.low,
				close: candle.close,
				adj_close: candle.adjClose || candle.close,
				volume: candle.volume * lotSize,
				interval: interval,
				source: source,
			};

			// Simple dedup: if exact same timestamp exists, keep last (provider order)
			candleMap.set(timestamp, candleValue);
		});

		const values = Array.from(candleMap.values()).filter((c) => {
			// Use comprehensive validator
			const result = this.dataValidator.validateCandle(c, isCrypto);
			if (!result.isValid) {
				this.logger.debug(`[${ticker}] Rejected candle at ${c.timestamp.toISOString()}: ${result.reason}`);
				rejected++;
				return false;
			}
			return true;
		});

		return { values, rejected };
	}

	private async determineQueryOptions(
		ticker: string,
		interval: string,
		endDate?: Date,
		source: string = "YAHOO",
	): Promise<any> {
		const options: any = {};

		if (endDate) {
			// BACKFILL MODE: window must be large enough to fill one full page (limit=500).
			// 1h: 500 candles ÷ ~16 trading hours/day ≈ 31 days → use 60d for safety.
			// 1d: 500 candles ÷ 252 trading days/year ≈ 2 years → use 2y.
			const start = new Date(endDate);
			if (interval === "1h")
				start.setDate(start.getDate() - 60); // was 30 — too small for deep scroll
			else if (interval === "1d")
				start.setFullYear(start.getFullYear() - 2); // was 1y
			else if (interval === "1wk") start.setFullYear(start.getFullYear() - 5);
			else if (interval === "1mo") start.setFullYear(start.getFullYear() - 10);
			else start.setDate(start.getDate() - 60);

			options.period1 = start;
			options.period2 = endDate;
		} else {
			// FORWARD FILL — must query timestamp for the correct source!
			// Without this, a TRADINGVIEW symbol would always appear "never synced"
			// because getLastTimestamp defaults to YAHOO and finds nothing.
			const lastTimestamp = await questDbService.getLastTimestamp(ticker, interval, source);

			if (lastTimestamp) {
				options.period1 = lastTimestamp;
			} else {
				// 🚀 GREEDY BACKFILL: On first sync, pull a deep history to avoid "broken data"
				const start = new Date();
				if (interval === "1d")
					start.setFullYear(start.getFullYear() - 10); // 10 years for 1d
				else if (interval === "1wk") start.setFullYear(start.getFullYear() - 20);
				else if (interval === "1h")
					start.setMonth(start.getMonth() - 6); // 6 months for 1h
				else start.setDate(start.getDate() - 30); // 30 days for intraday
				options.period1 = start;
			}

			if (new Date(options.period1) > new Date()) {
				return { status: "uptodate" };
			}
		}
		return options;
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
			case "wk":
			case "w":
				multiplier = 7 * 24 * 60 * 60 * 1000;
				break;
			case "mo":
				multiplier = 30 * 24 * 60 * 60 * 1000;
				break;
			default:
				return 0;
		}
		return (num || 1) * multiplier;
	}
}
