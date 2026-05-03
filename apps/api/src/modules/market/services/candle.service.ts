import type { Logger } from "../../../utils/logger";
import type { MarketDataRepository } from "../repositories/market-data.repository";
import { questDbService } from "./QuestDBService";
import { ohlcvLRUCache, OHLCVLRUCache } from "./OHLCVLRUCache";
import type { SymbolService } from "./symbol.service";
import type { SyncService } from "./sync.service";

export class CandleService {
	constructor(
		private symbolService: SymbolService,
		private syncService: SyncService,
		private marketDataRepo: MarketDataRepository,
		private logger: Logger,
	) {}

	/**
	 * Primary OHLCV serving path.
	 *
	 * Flow:
	 * 1. Check in-process LRU cache (30s TTL)
	 * 2. Query QuestDB (single source of truth)
	 * 3. On MISS: fetch from external provider → write to QuestDB → serve from QuestDB
	 *
	 * Postgres market_data is still written to as a safety net but not served from.
	 */
	async getOHLCV(ticker: string, interval = "1d", limit = 100, before?: string, source = "YAHOO") {
		const type = ticker.includes("-") ? "CRYPTO" : ("STOCK" as const);
		const symbol = await this.symbolService.ensureSymbol(ticker, type);
		const beforeDate = before ? new Date(before) : undefined;

		// ── Step 1: LRU in-process cache ─────────────────────────────────────
		const cacheKey = OHLCVLRUCache.makeKey(ticker, interval, source, beforeDate);
		const cached = ohlcvLRUCache.get(cacheKey);
		if (cached) {
			this.logger.debug(`[getOHLCV] LRU HIT for ${ticker}/${interval}/${source}`);
			return cached;
		}

		// ── Step 2: QuestDB query ─────────────────────────────────────────────
		let candles = await questDbService.getCandles(symbol.ticker, interval, source, limit, beforeDate);

		this.logger.info(
			`[getOHLCV] QuestDB ${candles.length > 0 ? "HIT" : "MISS"} for ${ticker} (${interval}/${source})` +
				(beforeDate ? ` before ${beforeDate.toISOString()}` : " [latest]"),
		);

		// ── Step 3a: MISS on latest data → stale check + sync ─────────────────
		if (candles.length === 0 && !beforeDate) {
			this.logger.info(`[getOHLCV] No data in QuestDB for ${ticker}/${interval}/${source}. Syncing...`);
			try {
				await this.syncService.syncSymbolData(ticker, symbol.type, interval, undefined, source);
				await this.promoteToQuestDB(symbol.id, ticker, interval, source, limit, undefined);
				candles = await questDbService.getCandles(symbol.ticker, interval, source, limit, undefined);
			} catch (e) {
				this.logger.warn(`[getOHLCV] Sync failed, returning empty`, e);
			}
		}

		// ── Step 3b: MISS on historical data (before) → backfill ──────────────
		if (candles.length === 0 && beforeDate) {
			this.logger.info(
				`[getOHLCV] No history in QuestDB for ${ticker}/${interval}/${source} before ${beforeDate.toISOString()}. Backfilling...`,
			);
			const t0 = Date.now();
			try {
				await this.syncService.syncSymbolData(ticker, symbol.type, interval, beforeDate, source);
				this.logger.info(`[getOHLCV] Backfill sync took ${Date.now() - t0}ms`);
				await this.promoteToQuestDB(symbol.id, ticker, interval, source, limit * 4, beforeDate);
				candles = await questDbService.getCandles(symbol.ticker, interval, source, limit, beforeDate);
				this.logger.info(`[getOHLCV] Post-backfill QuestDB query returned ${candles.length} candles`);
			} catch (e) {
				this.logger.error(`[getOHLCV] Backfill failed`, e);
			}
		}

		// ── Step 4: Check if existing QuestDB data is stale (latest only) ────
		if (candles.length > 0 && !beforeDate) {
			const lastTs = new Date(candles[candles.length - 1].timestamp);
			if (this.isStale(lastTs, interval)) {
				this.logger.info(`[getOHLCV] QuestDB data stale for ${ticker}/${interval}. Refreshing...`);
				try {
					await this.syncService.syncSymbolData(ticker, symbol.type, interval, undefined, source);
					await this.promoteToQuestDB(symbol.id, ticker, interval, source, limit, undefined);
					// Re-query to get fresh data
					const fresh = await questDbService.getCandles(symbol.ticker, interval, source, limit, undefined);
					if (fresh.length > 0) candles = fresh;
				} catch (e) {
					this.logger.warn(`[getOHLCV] Refresh failed, returning existing data`, e);
				}
			}
		}

		const result = candles.map((c) => ({
			timestamp: c.timestamp,
			open: Number(c.open),
			high: Number(c.high),
			low: Number(c.low),
			close: Number(c.close),
			volume: Number(c.volume),
		}));

		// Populate LRU cache for subsequent rapid requests
		if (result.length > 0) {
			ohlcvLRUCache.set(cacheKey, result);
		}

		return result;
	}

	/**
	 * Promote candles from Postgres (staging) to QuestDB (source of truth).
	 * Uses a generous limit to ensure we capture all backfilled data.
	 */
	private async promoteToQuestDB(
		symbolId: number,
		ticker: string,
		interval: string,
		source: string,
		limit: number,
		before?: Date,
	): Promise<void> {
		try {
			const pgCandles = await this.marketDataRepo.getRawCandles(symbolId, interval, limit, before, source);
			if (pgCandles.length === 0) return;

			const toWrite = pgCandles.map((c) => ({
				timestamp: new Date(c.timestamp),
				open: Number(c.open),
				high: Number(c.high),
				low: Number(c.low),
				close: Number(c.close),
				volume: Number(c.volume),
			}));

			await questDbService.writeCandles(toWrite, ticker, interval, source);
			this.logger.info(`[promoteToQuestDB] Promoted ${toWrite.length} candles for ${ticker}/${interval}/${source}`);
		} catch (err) {
			this.logger.error(`[promoteToQuestDB] Failed for ${ticker}/${interval}/${source}`, err);
			// Non-fatal: Postgres still has the data as fallback
		}
	}

	private isStale(lastDate: Date | null, interval: string): boolean {
		if (!lastDate) return true;

		const diffMinutes = (Date.now() - lastDate.getTime()) / (1000 * 60);

		switch (interval) {
			case "1m":
				return diffMinutes > 5;
			case "5m":
				return diffMinutes > 10;
			case "15m":
				return diffMinutes > 20;
			case "30m":
				return diffMinutes > 40;
			case "1h":
				return diffMinutes > 75;
			case "4h":
				return diffMinutes > 260;
			case "1d":
				return diffMinutes > 1600; // ~26 hours
			case "1wk":
				return diffMinutes > 10080 + 1440;
			default:
				return diffMinutes > 60;
		}
	}

	async getDownsampledCandles(ticker: string, resolution = "1 day", limit = 1000) {
		const type = ticker.includes("-") ? "CRYPTO" : ("STOCK" as const);
		const symbol = await this.symbolService.ensureSymbol(ticker, type);

		const result = await this.marketDataRepo.getDownsampled(symbol.id, resolution, limit);

		return result.reverse().map((row: any) => ({
			timestamp: new Date(row.bucket),
			open: row.open,
			high: row.high,
			low: row.low,
			close: row.close,
			volume: Number(row.volume),
		}));
	}
}
