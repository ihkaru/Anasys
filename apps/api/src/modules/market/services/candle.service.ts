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
		const commonCrypto = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOT", "DOGE"];

		if (
			upperTicker.includes("USD") ||
			upperTicker.startsWith("BINANCE:") ||
			upperTicker.includes("/") ||
			commonCrypto.some((c) => upperTicker.startsWith(c))
		) {
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

		// ── Step 3: Sync Logic ─────────────────────────────────────────────
		const syncKey = `${ticker}:${interval}:${source}:${beforeDate ? "history" : "latest"}`;

		// Case A: MISS (No data at all)
		if (candles.length === 0) {
			const syncPromise = this.triggerSync(ticker, symbol.type, interval, beforeDate, source, syncKey);

			// 🚀 SMART WAIT: Race against a timeout (e.g., 1.5s) and the sync promise
			this.logger.info(`[getOHLCV] CACHE MISS for ${ticker}. Initiating SMART WAIT (1500ms)...`);
			try {
				await Promise.race([
					syncPromise,
					new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500)),
				]);

				// Tiny grace period for QuestDB commit visibility (must be > QDB_CAIRO_COMMIT_LAG)
				await new Promise((resolve) => setTimeout(resolve, 200));

				this.logger.info(`[getOHLCV] SMART WAIT resolved for ${symbol.ticker}. Querying fresh data...`);

				// If we reached here, sync finished! Query QuestDB again.
				const freshCandles = await questDbService.getCandles(symbol.ticker, interval, source, limit, beforeDate);
				if (freshCandles.length > 0) {
					this.logger.info(`[getOHLCV] SMART WAIT SUCCESS: Recovered ${freshCandles.length} items for ${ticker}`);
					return this.formatResult(freshCandles);
				}
			} catch (_e) {
				this.logger.warn(`[getOHLCV] SMART WAIT concluded (timeout or empty) for ${ticker}`);
			}
		}
		// Case B: STALE (Data exists but is old, only for latest request)
		else if (!beforeDate) {
			const lastTs = new Date(candles[candles.length - 1].timestamp);
			if (this.isStale(lastTs, interval)) {
				this.logger.info(`[getOHLCV] Data stale for ${ticker}/${interval}. Triggering background refresh...`);
				this.triggerSync(ticker, symbol.type, interval, beforeDate, source, syncKey);
			}
		}

		const t3 = performance.now();
		this.logger.debug(`[getOHLCV] Logic checks took ${(t3 - t2).toFixed(2)}ms`);

		// ── Step 4: Return available data immediately ────────────────────────
		const result = this.formatResult(candles);

		// Populate LRU cache for subsequent rapid requests
		if (result.length > 0) {
			ohlcvLRUCache.set(cacheKey, result);
		}
		const tEnd = performance.now();
		this.logger.info(`[getOHLCV] TOTAL for ${ticker}: ${(tEnd - startTime).toFixed(2)}ms`);

		return result;
	}

	/**
	 * Helper to trigger sync and return the promise
	 */
	private async triggerSync(
		ticker: string,
		type: "STOCK" | "CRYPTO",
		interval: string,
		beforeDate: Date | undefined,
		source: string,
		syncKey: string,
	): Promise<boolean> {
		if (this.activeSyncs.has(syncKey)) return false;

		this.activeSyncs.add(syncKey);
		this.logger.info(`[getOHLCV] Triggering sync for ${syncKey}`);

		try {
			const result = await this.syncService.syncSymbolData(ticker, type, interval, beforeDate, source);
			this.logger.info(`[getOHLCV] Sync COMPLETED for ${syncKey}: ${result.count} items`);
			return result.count > 0;
		} catch (err) {
			this.logger.error(`[getOHLCV] Sync FAILED for ${syncKey}`, err);
			return false;
		} finally {
			this.activeSyncs.delete(syncKey);
		}
	}

	private formatResult(candles: any[]) {
		return candles.map((c) => ({
			timestamp: c.timestamp,
			open: Number(c.open),
			high: Number(c.high),
			low: Number(c.low),
			close: Number(c.adj_close || c.close),
			adj_close: Number(c.adj_close || c.close),
			volume: Number(c.volume),
		}));
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
