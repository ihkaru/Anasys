import type { Logger } from "../../../utils/logger";
import type Redis from "ioredis";
import { questDbService } from "./QuestDBService";
import { ohlcvLRUCache, OHLCVLRUCache } from "./OHLCVLRUCache";
import type { SymbolService } from "./symbol.service";
import type { SyncService } from "./sync.service";

export class CandleService {
	constructor(
		private symbolService: SymbolService,
		private syncService: SyncService,
		_redis: Redis,
		private logger: Logger,
	) {}

	private activeSyncs = new Set<string>();

	/**
	 * Primary OHLCV serving path.
	 *
	 * Flow:
	 * 1. Check in-process LRU cache (30s TTL)
	 * 2. Query QuestDB (single source of truth)
	 * 3. On MISS or STALE: trigger background sync → return available data immediately
	 *
	 * This ensures <200ms response times even for "cold" symbols,
	 * shifting the data arrival to real-time updates or client-side polling.
	 */
	async getOHLCV(ticker: string, interval = "1d", limit = 100, before?: string, source = "YAHOO") {
		const startTime = performance.now();
		this.logger.debug(`[getOHLCV] Request started for ${ticker} (${interval})`);

		// Safe fallback heuristic for brand new symbols only (existing symbols use DB type)
		let guessedType: "STOCK" | "CRYPTO" = "STOCK";
		const upperTicker = ticker.toUpperCase();
		if (upperTicker.includes("USD") || upperTicker.startsWith("BINANCE:") || upperTicker.includes("/")) {
			guessedType = "CRYPTO";
		}

		const symbol = await this.symbolService.ensureSymbol(ticker, guessedType);
		const t1 = performance.now();
		this.logger.debug(`[getOHLCV] ensureSymbol took ${(t1 - startTime).toFixed(2)}ms`);

		const beforeDate = before ? new Date(before) : undefined;

		// ── Step 1: LRU in-process cache ─────────────────────────────────────
		const cacheKey = OHLCVLRUCache.makeKey(ticker, interval, source, beforeDate);
		const cached = ohlcvLRUCache.get(cacheKey);
		if (cached) {
			this.logger.debug(
				`[getOHLCV] LRU HIT for ${ticker}/${interval}/${source} in ${(performance.now() - t1).toFixed(2)}ms`,
			);
			return cached;
		}

		// ── Step 2: QuestDB query ─────────────────────────────────────────────
		const candles = await questDbService.getCandles(symbol.ticker, interval, source, limit, beforeDate);
		const t2 = performance.now();
		this.logger.debug(`[getOHLCV] QuestDB query for ${candles.length} items took ${(t2 - t1).toFixed(2)}ms`);

		// ── Step 3: Background Sync Trigger (Non-blocking) ────────────────────
		const syncKey = `${ticker}:${interval}:${source}:${beforeDate ? "history" : "latest"}`;

		const triggerSync = () => {
			if (this.activeSyncs.has(syncKey)) return;

			this.activeSyncs.add(syncKey);
			this.logger.info(`[getOHLCV] Triggering BACKGROUND sync for ${syncKey}`);

			// Fire and forget, but handle errors to avoid unhandled rejections
			this.syncService
				.syncSymbolData(ticker, symbol.type, interval, beforeDate, source)
				.then((result) => {
					this.logger.info(`[getOHLCV] Background sync COMPLETED for ${syncKey}: ${result.count} items`);
				})
				.catch((err) => {
					this.logger.error(`[getOHLCV] Background sync FAILED for ${syncKey}`, err);
				})
				.finally(() => {
					this.activeSyncs.delete(syncKey);
				});
		};

		// Case A: MISS (No data at all)
		if (candles.length === 0) {
			triggerSync();
		}
		// Case B: STALE (Data exists but is old, only for latest request)
		else if (!beforeDate) {
			const lastTs = new Date(candles[candles.length - 1].timestamp);
			if (this.isStale(lastTs, interval)) {
				this.logger.info(`[getOHLCV] Data stale for ${ticker}/${interval}. Triggering background refresh...`);
				triggerSync();
			}
		}
		const t3 = performance.now();
		this.logger.debug(`[getOHLCV] Logic checks took ${(t3 - t2).toFixed(2)}ms`);

		// ── Step 4: Return available data immediately ────────────────────────
		const result = candles.map((c) => ({
			timestamp: c.timestamp,
			open: Number(c.open),
			high: Number(c.high),
			low: Number(c.low),
			close: Number(c.adj_close || c.close),
			adj_close: Number(c.adj_close || c.close),
			volume: Number(c.volume),
		}));

		// Populate LRU cache for subsequent rapid requests
		if (result.length > 0) {
			ohlcvLRUCache.set(cacheKey, result);
		}
		const tEnd = performance.now();
		this.logger.info(`[getOHLCV] TOTAL for ${ticker}: ${(tEnd - startTime).toFixed(2)}ms`);

		return result;
	}

	private isStale(lastDate: Date | null, interval: string): boolean {
		if (!lastDate) return true;

		const diffMinutes = (Date.now() - lastDate.getTime()) / (1000 * 60);

		switch (interval) {
			case "1m":
				return diffMinutes > 3; // Reduced for faster reactivity
			case "5m":
				return diffMinutes > 8;
			case "15m":
				return diffMinutes > 18;
			case "30m":
				return diffMinutes > 35;
			case "1h":
				return diffMinutes > 65;
			case "4h":
				return diffMinutes > 250;
			case "1d":
				return diffMinutes > 1440; // 24 hours
			default:
				return diffMinutes > 60;
		}
	}
}
