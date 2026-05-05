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
			this.logger.info(
				`Sync started for ${ticker} (${interval}) via ${source}${endDate ? ` until ${endDate.toISOString()}` : ""}`,
			);
			const symbol = await this.symbolService.ensureSymbol(ticker, type);
			const provider = this.providerFactory.getProvider(source);

			const queryOptions = await this.determineQueryOptions(symbol.id, interval, endDate, source);

			if (queryOptions.status === "uptodate") {
				return { count: 0, status: "uptodate" };
			}

			const chartOptions: any = {
				period1: queryOptions.period1,
				interval: interval as any,
				exchange: symbol.exchange,
			};
			if (queryOptions.period2) {
				chartOptions.period2 = queryOptions.period2;
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

			// Use rate limiter with exponential backoff
			const startFetch = Date.now();
			const result = await this.rateLimiter.execute(
				() => provider.fetchChart(effectiveTicker, chartOptions),
				`chart:${ticker}`,
			);
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

	private isRateLimitError(error: any): boolean {
		return (
			error?.code === 429 ||
			error?.status === 429 ||
			error?.response?.status === 429 ||
			error?.message?.includes("429") ||
			error?.message?.toLowerCase().includes("rate limit") ||
			error?.message?.includes("Circuit Breaker")
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
				adjClose: candle.adjClose,
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
		symbolId: number,
		interval: string,
		endDate?: Date,
		source: string = "YAHOO",
	): Promise<any> {
		const options: any = {};

		if (endDate) {
			// BACKFILL MODE
			const start = new Date(endDate);
			if (interval === "1h") start.setDate(start.getDate() - 30);
			else if (interval === "1d") start.setFullYear(start.getFullYear() - 1);
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
				const start = new Date();
				if (interval === "1d") start.setFullYear(start.getFullYear() - 1);
				else if (interval === "1h") start.setMonth(start.getMonth() - 2);
				else start.setDate(start.getDate() - 7);
				options.period1 = start;
			}

			if (new Date(options.period1) > new Date()) {
				return { status: "uptodate" };
			}
		}
		return options;
	}
}
