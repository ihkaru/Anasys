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
			// (e.g., BTCUSD:1d:TRADINGVIEW vs BTCUSD:1d:YAHOO must be separate entries)
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

			// 1. Try SQLite Cache
			// console.time('[FetchHistory] SQLite getOHLCV');
			let cachedData: any[] = [];
			try {
				const beforeTs = before ? new Date(before).getTime() : undefined;
				cachedData = await sqliteService.getOHLCV(ticker, interval, limit, beforeTs, source);
			} catch (err) {
				logger.warn("SQLite Cache Read Failed", err);
			}
			// console.timeEnd('[FetchHistory] SQLite getOHLCV');
			// console.log(`[FetchHistory] SQLite returned ${cachedData.length} rows`);

			if (cachedData.length > 0) {
				if (before) {
					if (cachedData.length >= limit) {
						if (cachedData.length >= limit) {
							const newData = mergeOHLCVData(ohlcvData.value, cachedData, true);

							// OPTIMIZATION: Defer assignment to next frame to break up long task
							// This allows browser to respond to user input before reactivity cascade
							requestAnimationFrame(() => {
								ohlcvData.value = newData;
							});

							return cachedData;
						}
					}
				} else {
					ohlcvData.value = cachedData;
					if (!before) ohlcvCache.value.set(cacheKey, cachedData);
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
						source, // Pass source if explicitly provided
					});

					if (response.data.success) {
						const newData = response.data.data || [];

						// Save to Cache
						const dataToSave = newData.map((d: any) => ({ ...d }));
						sqliteService.saveOHLCV(ticker, interval, dataToSave).catch((e) => logger.error("Cache Save Failed", e));

						if (before) {
							if (newData.length > 0) {
								const merged = mergeOHLCVData(ohlcvData.value, newData, true);
								ohlcvData.value = merged;
								return newData;
							}
							return newData;
						} else {
							// Initial/Latest Fetch
							const current = ohlcvData.value;
							// Check deduplication handled in merge
							const merged = mergeOHLCVData(current, newData, false);
							ohlcvData.value = merged;
							if (!before) ohlcvCache.value.set(cacheKey, merged);
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
