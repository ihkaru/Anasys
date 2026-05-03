import { ref, shallowRef } from "vue";
import { sqliteService } from "../../../services/sqlite";
import type { Logger } from "../../../utils/logger";
import { marketApi } from "../api/marketApi";
import type { OHLCV } from "../market.types";
import { mergeOHLCVData } from "../utils/marketUtils";

export function useMarketHistory(logger: Logger) {
	const ohlcvData = shallowRef<OHLCV[]>([]);
	const ohlcvCache = shallowRef<Map<string, OHLCV[]>>(new Map()); // RAM Cache
	const historyLoading = ref(false);
	const error = ref<string | null>(null);

	async function fetchHistory(ticker: string, interval = "1h", limit = 500, before?: string, source?: string) {
		const fetchStart = performance.now();
		try {
			logger.debug(
				`Fetching history for ${ticker} (interval=${interval}, limit=${limit}, before=${before}, source=${source})`,
			);
			// Cache key MUST include source to prevent cross-provider cache pollution
			const cacheKey = `${ticker}:${interval}:${source || "AUTO"}`;

			if (!before) {
				const ramData = ohlcvCache.value.get(cacheKey);
				if (ramData && ramData.length > 0) {
					ohlcvData.value = ramData;
				} else {
					ohlcvData.value = [];
					historyLoading.value = true;
				}
			}

			// 1. Try SQLite Cache (with TTL check for latest data)
			let cachedData: any[] = [];
			let sqliteExpired = false;
			try {
				const beforeTs = before ? new Date(before).getTime() : undefined;

				// TTL check: only for latest data (not backfill/before requests)
				if (!before && source) {
					sqliteExpired = await sqliteService.isCacheExpired(ticker, interval, source);
				}

				if (!sqliteExpired) {
					cachedData = await sqliteService.getOHLCV(ticker, interval, limit, beforeTs, source);
				} else {
					logger.debug(`[FetchHistory] SQLite TTL expired for ${ticker}/${interval}/${source} — skipping cache`);
				}
			} catch (err) {
				logger.warn("SQLite Cache Read Failed", err);
			}

			if (cachedData.length > 0) {
				if (before) {
					if (cachedData.length >= limit) {
						const newData = mergeOHLCVData(ohlcvData.value, cachedData, true);
						// Defer to next frame to reduce long task blocking
						requestAnimationFrame(() => {
							ohlcvData.value = newData;
						});
						return cachedData;
					}
				} else {
					ohlcvData.value = cachedData;
					ohlcvCache.value.set(cacheKey, cachedData);
					historyLoading.value = false;
				}
			} else {
				if (!before) historyLoading.value = true;
			}

			// 2. Network Fetch
			const networkPromise = (async () => {
				try {
					error.value = null;
					const response = await marketApi.fetchHistory(ticker, {
						limit: String(limit),
						interval,
						before,
						source,
					});

					if (response.data.success) {
						const newData = response.data.data || [];

						// Save to SQLite with source for accurate TTL tracking
						const resolvedSource = source || newData[0]?.source || "YAHOO";
						sqliteService
							.saveOHLCV(ticker, interval, newData, resolvedSource)
							.catch((e) => logger.error("Cache Save Failed", e));

						if (before) {
							if (newData.length > 0) {
								const merged = mergeOHLCVData(ohlcvData.value, newData, true);
								ohlcvData.value = merged;
							}
							return newData;
						} else {
							const current = ohlcvData.value;
							const merged = mergeOHLCVData(current, newData, false);
							ohlcvData.value = merged;
							ohlcvCache.value.set(cacheKey, merged);
							return newData;
						}
					} else {
						throw new Error(response.data.error);
					}
				} catch (e) {
					logger.error("Fetch history failed", e);
					if (!cachedData.length && !before) {
						error.value = (e as Error).message;
						ohlcvData.value = [];
					}
					throw e;
				} finally {
					if (!before && ohlcvData.value.length === 0) historyLoading.value = false;
				}
			})();

			if (cachedData.length > 0 && !before) {
				// Serve from cache immediately, refresh in background
				networkPromise.catch((e) => logger.warn("Background fetch failed", e));
				return cachedData;
			} else {
				const res = await networkPromise;
				return res;
			}
		} catch (e) {
			logger.error("Fetch history failed", e);
			error.value = (e as Error).message;
			if (!before && ohlcvData.value.length === 0) ohlcvData.value = [];
		} finally {
			historyLoading.value = false;
			logger.debug(`[FetchHistory] TOTAL ${Math.round(performance.now() - fetchStart)}ms`);
		}
	}

	return {
		ohlcvData,
		historyLoading,
		error,
		fetchHistory,
	};
}
