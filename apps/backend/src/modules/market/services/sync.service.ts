import { getDataValidator } from "../../../utils/data-validator";
import type { Logger } from "../../../utils/logger";
import { getYahooRateLimiter } from "../../../utils/rate-limiter";
import type { UnifiedCandle } from "../providers/data-provider.interface";
import type { DataProviderFactory } from "../providers/provider.factory";
import type { MarketDataRepository } from "../repositories/market-data.repository";
import type { SymbolService } from "./symbol.service";

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
		private marketDataRepo: MarketDataRepository,
		private providerFactory: DataProviderFactory,
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

			const queryOptions = await this.determineQueryOptions(symbol.id, interval, endDate);

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

			// Enable Pre/Post market data to match TradingView and fix alignment gaps
			chartOptions.includePrePost = true;

			this.logger.debug(
				`Fetching ${ticker} (${interval}) range: ${queryOptions.period1} -> ${queryOptions.period2 || "now"}`,
			);

			// Use rate limiter with exponential backoff
			const startFetch = Date.now();
			const result = await this.rateLimiter.execute(() => provider.fetchChart(ticker, chartOptions), `chart:${ticker}`);
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
			);

			if (values.length === 0) {
				this.logger.warn(`All ${result.length} candles rejected for ${ticker}`);
				return { count: 0, status: "empty", rejected };
			}

			const startUpsert = Date.now();
			await this.marketDataRepo.upsert(values);
			this.logger.debug(`[SyncService] DB Upsert (${values.length} items) took ${Date.now() - startUpsert}ms`);

			this.logger.info(
				`Saved ${values.length} candles for ${ticker} (${interval})` +
					(rejected > 0 ? ` [${rejected} rejected as anomalies]` : ""),
			);

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
			error?.message?.toLowerCase().includes("rate limit")
		);
	}

	private validateAndCleanCandlesEnhanced(
		candles: UnifiedCandle[],
		symbolId: number,
		interval: string,
		isCrypto: boolean,
		ticker: string,
		source: string,
	): { values: any[]; rejected: number } {
		let rejected = 0;
		// Use Map to handle collisions (e.g. 14:00 pre-market and 14:30 open both mapping to 14:00)
		// Strategy: "Last Write Wins" (or merge logic could be added)
		// Since Yahoo returns sorted data, the later candle (14:30) is usually the "Main" session one
		const candleMap = new Map<number, any>();

		candles.forEach((candle: any) => {
			// Basic null check
			if (candle.open === null || candle.close === null || candle.high === null || candle.low === null) {
				rejected++;
				return;
			}

			// Normalize timestamp to interval boundary
			const rawDate = candle.timestamp;
			const normalizedDate = this.normalizeTimestamp(rawDate, interval);

			// === GUARDRAIL: Strict Time-Windowing ===
			// Enforce that 1h candles are strictly hour-aligned
			if (interval === "1h" && normalizedDate.getMinutes() !== 0) {
				this.logger.warn(
					`[Guardrail] 1h candle normalization failed for ${ticker} at ${rawDate.toISOString()} -> ${normalizedDate.toISOString()}`,
				);
				normalizedDate.setMinutes(0, 0, 0);
			}

			const timestamp = normalizedDate.getTime();
			const newCandleValue = {
				symbolId: symbolId,
				timestamp: normalizedDate,
				open: candle.open,
				high: candle.high,
				low: candle.low,
				close: candle.close,
				volume: candle.volume,
				interval: interval,
				source: source,
			};

			// Collision Resolution Strategy
			if (candleMap.has(timestamp)) {
				const existing = candleMap.get(timestamp);
				// If existing was low volume (e.g. pre-market 0 vol) and new is high volume, definitely take new
				if ((existing.volume || 0) === 0 && (newCandleValue.volume || 0) > 0) {
					this.logger.debug(
						`[${ticker}] Overwriting zero-vol candle at ${normalizedDate.toISOString()} with high-vol candle`,
					);
					candleMap.set(timestamp, newCandleValue);
				}
				// Default: Overwrite (Last Wins) - usually 14:30 overwrites 14:00
				else {
					candleMap.set(timestamp, newCandleValue);
				}
			} else {
				candleMap.set(timestamp, newCandleValue);
			}
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

	/**
	 * Normalize timestamp to interval boundary
	 * e.g., for 1h: 07:48 -> 07:00, for 1d: any time -> 00:00 UTC
	 */
	private normalizeTimestamp(date: Date, interval: string): Date {
		const normalized = new Date(date);

		switch (interval) {
			case "1m":
				normalized.setSeconds(0, 0);
				break;
			case "5m":
				normalized.setMinutes(Math.floor(normalized.getMinutes() / 5) * 5, 0, 0);
				break;
			case "15m":
				normalized.setMinutes(Math.floor(normalized.getMinutes() / 15) * 15, 0, 0);
				break;
			case "30m":
				normalized.setMinutes(Math.floor(normalized.getMinutes() / 30) * 30, 0, 0);
				break;
			case "1h":
				normalized.setMinutes(0, 0, 0);
				break;
			case "4h":
				normalized.setHours(Math.floor(normalized.getHours() / 4) * 4, 0, 0, 0);
				break;
			case "1d":
				normalized.setUTCHours(0, 0, 0, 0);
				break;
			case "1wk": {
				// Set to Monday 00:00 UTC
				const day = normalized.getUTCDay();
				const diff = normalized.getUTCDate() - day + (day === 0 ? -6 : 1);
				normalized.setUTCDate(diff);
				normalized.setUTCHours(0, 0, 0, 0);
				break;
			}
			case "1mo":
				normalized.setUTCDate(1);
				normalized.setUTCHours(0, 0, 0, 0);
				break;
			default:
				// Default: round to hour
				normalized.setMinutes(0, 0, 0);
		}

		return normalized;
	}

	private async determineQueryOptions(symbolId: number, interval: string, endDate?: Date): Promise<any> {
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
			// FORWARD FILL
			const lastTimestamp = await this.marketDataRepo.getLastTimestamp(symbolId, interval);

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
