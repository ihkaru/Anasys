import type { Ref } from "vue";
import { sqliteService } from "../../../services/sqlite";
import type { Logger } from "../../../utils/logger";
import { marketApi } from "../api/marketApi";
import { OVERVIEW_CACHE_TTL_MS } from "../market.constants";
import type { MarketMover } from "../market.types";

export function useMarketCache(logger: Logger, quotes: Ref<Map<string, MarketMover>>, quotesVersion: Ref<number>) {
	// In-memory data cache for instant switching (Key: ticker:source:period) -> Quote Data
	const overviewDataCache = new Map<string, any>();
	// Negative cache for tickers that don't exist in backend (Key: ticker:source:period)
	const overviewNotFoundCache = new Set<string>();

	// Timestamp cache for batch requests
	const overviewFetchTimestamps = new Map<string, number>();

	async function fetchOverviewBatched(itemsBySource: Map<string, string[]>, period: string): Promise<void> {
		const startTotal = performance.now();
		const p = period || "7d";

		if (itemsBySource.size === 0) return;

		logger.info(`[Perf] fetchOverviewBatched Start: ${itemsBySource.size} sources, period=${p}`);

		let allTickersAlreadyCurrent = true;
		const currentQuotes = quotes.value;

		for (const [source, tickers] of itemsBySource) {
			const requestKey = `${[...tickers].sort().join(",")}:${p}:${source}`;
			const lastFetch = overviewFetchTimestamps.get(requestKey);
			const isFresh = lastFetch && Date.now() - lastFetch < OVERVIEW_CACHE_TTL_MS;

			if (!isFresh) {
				allTickersAlreadyCurrent = false;
				break;
			}

			for (const ticker of tickers) {
				if (!currentQuotes.has(`${ticker}:${source}`)) {
					allTickersAlreadyCurrent = false;
					break;
				}
			}
			if (!allTickersAlreadyCurrent) break;
		}

		if (allTickersAlreadyCurrent) {
			logger.info(`[Perf] fetchOverviewBatched: All data current, NO-OP (0ms)`);
			return;
		}

		const batchedQuotes = new Map(currentQuotes);
		let hasAnyUpdates = false;
		const allResults: any[] = [];

		for (const [source, tickers] of itemsBySource) {
			if (tickers.length === 0) continue;

			const src = source;
			const requestKey = `${[...tickers].sort().join(",")}:${p}:${src}`;
			const lastFetch = overviewFetchTimestamps.get(requestKey);
			const now = Date.now();
			const isFresh = lastFetch && now - lastFetch < OVERVIEW_CACHE_TTL_MS;

			// Check RAM cache
			if (isFresh) {
				for (const ticker of tickers) {
					const ramKey = `${ticker}:${src}:${p}`;
					const cachedData = overviewDataCache.get(ramKey);
					if (cachedData) {
						const basePrice =
							cachedData.price != null && cachedData.change != null ? cachedData.price - cachedData.change : undefined;
						batchedQuotes.set(`${ticker}:${src}`, {
							...cachedData,
							source: src,
							period: p,
							periodBasePrice: cachedData.periodBasePrice ?? basePrice,
						});
						allResults.push(cachedData);
						hasAnyUpdates = true;
					}
				}
				continue;
			}

			// Check SQLite cache
			const sqliteCacheKey = `quote_${src}_${p}`;
			const tickersToFetch: string[] = [];

			for (const ticker of tickers) {
				const ramKey = `${ticker}:${src}:${p}`;
				if (overviewNotFoundCache.has(ramKey)) continue;

				try {
					const cached = await sqliteService.getSymbolCache(ticker, sqliteCacheKey, 5);
					if (cached) {
						overviewDataCache.set(ramKey, cached);
						const basePrice = cached.price != null && cached.change != null ? cached.price - cached.change : undefined;
						batchedQuotes.set(`${ticker}:${src}`, {
							...cached,
							source: src,
							period: p,
							periodBasePrice: basePrice,
						});
						allResults.push(cached);
						hasAnyUpdates = true;
					} else {
						tickersToFetch.push(ticker);
					}
				} catch {
					tickersToFetch.push(ticker);
				}
			}

			// Fetch from API
			if (tickersToFetch.length > 0) {
				try {
					const response = await marketApi.fetchOverview({ tickers: tickersToFetch, period: p, source: src });
					if (response.data.success) {
						const newQuotes = response.data.data || [];
						const returnedTickers = new Set<string>();

						newQuotes.forEach((q: any) => {
							const key = `${q.ticker}:${src}`;
							const basePrice = q.price != null && q.change != null ? q.price - q.change : undefined;
							batchedQuotes.set(key, {
								...q,
								source: src,
								period: p,
								periodBasePrice: basePrice,
							});
							overviewDataCache.set(`${q.ticker}:${src}:${p}`, q);
							returnedTickers.add(q.ticker);
							hasAnyUpdates = true;
							allResults.push(q);
						});

						tickersToFetch.forEach((t) => {
							if (!returnedTickers.has(t)) {
								overviewNotFoundCache.add(`${t}:${src}:${p}`);
							}
						});

						(async () => {
							for (const q of newQuotes) {
								try {
									await sqliteService.saveSymbolCache(q.ticker, sqliteCacheKey, q);
								} catch {
									/* ignore */
								}
							}
						})();
					}
				} catch (e) {
					logger.error(`API fetch failed for source ${src}`, e);
				}
			}

			overviewFetchTimestamps.set(requestKey, Date.now());
		}

		if (hasAnyUpdates) {
			const reactStart = performance.now();
			quotes.value = batchedQuotes;
			logger.info(`[Perf] Batched Reactivity Update: ${Math.round(performance.now() - reactStart)}ms`);
			quotesVersion.value++;
		}

		logger.info(
			`[Perf] fetchOverviewBatched Done: ${allResults.length} quotes. Total ${Math.round(performance.now() - startTotal)}ms`,
		);
	}

	async function fetchOverview(tickers: string[], period?: string, source?: string): Promise<any[]> {
		const _startTotal = performance.now();
		try {
			const src = source || "AUTO"; // 'AUTO' = let backend smart-route via DB, never force YAHOO
			const p = period || "7d";

			if (tickers.length === 0) return [];

			logger.info(`[Perf] fetchOverview Start: ${tickers.length} tickers (${p})`);

			// 1. Check RAM Cache
			const requestKey = `${[...tickers].sort().join(",")}:${p}:${src}`;
			const lastFetch = overviewFetchTimestamps.get(requestKey);
			const now = Date.now();
			const isFresh = lastFetch && now - lastFetch < OVERVIEW_CACHE_TTL_MS;

			let missingTickers: string[] = [...tickers];
			const ramResults: any[] = [];

			if (isFresh) {
				const ramStart = performance.now();
				missingTickers = [];
				let hasUpdates = false;
				const batchedQuotes = new Map(quotes.value);

				for (const ticker of tickers) {
					const ramKey = `${ticker}:${src}:${p}`;
					const cachedData = overviewDataCache.get(ramKey);
					const isNotFound = overviewNotFoundCache.has(ramKey);

					if (cachedData) {
						const basePrice =
							cachedData.price != null && cachedData.change != null ? cachedData.price - cachedData.change : undefined;
						batchedQuotes.set(`${ticker}:${src}`, {
							...cachedData,
							source: src,
							period: p,
							periodBasePrice: cachedData.periodBasePrice ?? basePrice,
						});
						ramResults.push(cachedData);
						hasUpdates = true;
					} else if (!isNotFound) {
						missingTickers.push(ticker);
					}
				}

				if (hasUpdates) {
					const reactStart = performance.now();
					quotes.value = batchedQuotes;
					logger.info(`[Perf] RAM Cache Apply: ${Math.round(performance.now() - reactStart)}ms`);
					quotesVersion.value++;
				}

				if (missingTickers.length === 0) {
					logger.info(`[Perf] RAM Full Hit: ${Math.round(performance.now() - ramStart)}ms`);
					return ramResults;
				}
			}

			// 2. Check SQLite
			const sqliteCacheKey = `quote_${src}_${p}`;
			const cachedResults: any[] = [...ramResults];
			let apiFetchTickers: string[] = [...missingTickers];

			try {
				if (missingTickers.length > 0) {
					const _sqliteStart = performance.now();
					const promises = missingTickers.map(async (ticker) => {
						const cached = await sqliteService.getSymbolCache(ticker, sqliteCacheKey, 5);
						if (cached) {
							overviewDataCache.set(`${ticker}:${src}:${p}`, cached);
							return cached;
						}
						return null;
					});

					const results = await Promise.all(promises);
					const found = results.filter((r) => r !== null);

					if (found.length > 0) {
						const batchedQuotes = new Map(quotes.value);
						const foundSet = new Set<string>();
						found.forEach((q: any) => {
							const key = `${q.ticker}:${src}`;
							const basePrice = q.price != null && q.change != null ? q.price - q.change : undefined;
							batchedQuotes.set(key, {
								...q,
								source: src,
								period: p,
								periodBasePrice: basePrice,
							});
							foundSet.add(q.ticker);
						});

						const reactStart = performance.now();
						quotes.value = batchedQuotes;
						logger.info(`[Perf] SQLite Reactivity Update: ${Math.round(performance.now() - reactStart)}ms`);
						quotesVersion.value++;

						cachedResults.push(...found);
						apiFetchTickers = missingTickers.filter((t) => !foundSet.has(t));

						if (apiFetchTickers.length === 0) {
							overviewFetchTimestamps.set(requestKey, Date.now());
						}
					}
				}
			} catch (cacheErr) {
				logger.warn("Cache read failed", cacheErr);
			}

			if (apiFetchTickers.length === 0) {
				return cachedResults;
			}

			// 3. API Fetch
			const response = await marketApi.fetchOverview({ tickers: apiFetchTickers, period: p, source: src });
			if (response.data.success) {
				const newQuotes = response.data.data || [];
				const batchedQuotes = new Map(quotes.value);
				const returnedTickers = new Set<string>();

			newQuotes.forEach((q: any) => {
						// Use source returned by backend (actual resolved source), not our 'AUTO' placeholder
						const resolvedSrc = q.source || src;
						const key = `${q.ticker}:${resolvedSrc}`;
						const basePrice = q.price != null && q.change != null ? q.price - q.change : undefined;
						batchedQuotes.set(key, {
							...q,
							source: resolvedSrc,
							period: p,
							periodBasePrice: basePrice,
						});
						overviewDataCache.set(`${q.ticker}:${resolvedSrc}:${p}`, q);
					returnedTickers.add(q.ticker);
				});

				quotes.value = batchedQuotes;
				quotesVersion.value++;

				apiFetchTickers.forEach((t) => {
					if (!returnedTickers.has(t)) {
						overviewNotFoundCache.add(`${t}:${src}:${p}`);
					}
				});
				overviewFetchTimestamps.set(requestKey, Date.now());

				(async () => {
					for (const q of newQuotes) {
						try {
							await sqliteService.saveSymbolCache(q.ticker, sqliteCacheKey, q);
						} catch {
							/* ignore */
						}
					}
				})();

				return [...cachedResults, ...newQuotes];
			}

			return cachedResults.length > 0 ? cachedResults : [];
		} catch (e) {
			logger.error("Failed to fetch overview", e);
			return [];
		}
	}

	return {
		fetchOverviewBatched,
		fetchOverview,
	};
}
