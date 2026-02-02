import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, shallowRef, triggerRef } from "vue";
import { api } from "../api/client";

import { sqliteService } from "../services/sqlite";
import { createLogger } from "../utils/logger";

export interface Symbol {
	id: number;
	ticker: string;
	name: string;
	type: "STOCK" | "CRYPTO";
	description?: string;
	sector?: string;
	industry?: string;
	website?: string;
	country?: string;
	iconUrl?: string;
}
export interface OHLCV {
	timestamp: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface Signal {
	timestamp: string;
	type: "BUY" | "SELL" | "HOLD";
	price: number;
	reason: string;
}

export interface Strategy {
	id: string;
	name: string;
	description: string;
	params: { key: string; label: string; default: number }[];
}

export const STRATEGIES: Strategy[] = [
	{
		id: "SMA_CROSSOVER",
		name: "SMA Crossover",
		description: "Golden Cross / Death Cross using Simple Moving Averages",
		params: [
			{ key: "shortPeriod", label: "Short Period", default: 9 },
			{ key: "longPeriod", label: "Long Period", default: 21 },
		],
	},
	// Future strategies can be added here
];
export interface MarketMover extends Symbol {
	price: number;
	change?: number;
	changePercent: number;
	volume?: number;
	sparkline?: number[];
	marketState?: "PRE" | "REGULAR" | "POST" | "POSTPOST" | "CLOSED";
	preMarketPrice?: number;
	preMarketChange?: number;
	preMarketChangePercent?: number;
	postMarketPrice?: number;
	postMarketChange?: number;
	postMarketChangePercent?: number;
	source?: string;
	period?: string;
	periodBasePrice?: number;
}

export const useMarketStore = defineStore("market", () => {
	const logger = createLogger("MarketStore");
	const symbols = ref<Symbol[]>([]);
	const movers = ref<{ gainers: MarketMover[]; losers: MarketMover[]; trending: MarketMover[] }>({
		gainers: [],
		losers: [],
		trending: [],
	});

	// Optimization: Use shallowRef for performance. Map contents are not deeply reactive.
	// We trigger updates by replacing the entire Map (batch updates).
	const quotes = shallowRef<Map<string, MarketMover>>(new Map());

	const selectedSymbol = useLocalStorage<string>("selected_symbol", "AAPL");
	const selectedSource = useLocalStorage<string>("selected_source", "YAHOO");
	const selectedStrategy = useLocalStorage<string>("selected_strategy", "SMA_CROSSOVER");

	const loading = ref(false);
	const historyLoading = ref(false);
	const syncing = ref(false);
	const analyzing = ref(false);

	const ohlcvData = shallowRef<OHLCV[]>([]);
	const ohlcvCache = shallowRef<Map<string, OHLCV[]>>(new Map()); // RAM Cache

	// Version counter to force computed reactivity when quotes shallowRef is updated
	const quotesVersion = ref(0);

	const signals = ref<Signal[]>([]);
	const lastAnalysisTicker = ref<string | null>(null);
	const selectedSymbolData = ref<Symbol | null>(null);
	const error = ref<string | null>(null);

	// Computed
	const currentStrategy = computed(() => STRATEGIES.find((s) => s.id === selectedStrategy.value) || STRATEGIES[0]);

	// Actions
	async function fetchMovers() {
		try {
			logger.debug("Fetching market movers...");
			const response = await api.get("/market/movers");
			if (response.data.success) {
				movers.value = response.data.data;
			}
		} catch (e) {
			logger.error("Failed to fetch movers", e);
		}
	}

	// In-memory data cache for instant switching (Key: ticker:source:period) -> Quote Data
	const overviewDataCache = new Map<string, any>();
	// Negative cache for tickers that don't exist in backend (Key: ticker:source:period)
	const overviewNotFoundCache = new Set<string>();

	// Timestamp cache for batch requests
	const overviewFetchTimestamps = new Map<string, number>();
	const OVERVIEW_CACHE_TTL_MS = 30 * 1000; // 30 seconds

	/**
	 * Fetch overview for multiple sources in a batched manner.
	 * This triggers Vue reactivity ONLY ONCE at the end, instead of per-source.
	 */
	async function fetchOverviewBatched(itemsBySource: Map<string, string[]>, period: string): Promise<void> {
		const startTotal = performance.now();
		const p = period || "7d";

		if (itemsBySource.size === 0) return;

		logger.info(`[Perf] fetchOverviewBatched Start: ${itemsBySource.size} sources, period=${p}`);

		// Quick check: if ALL sources are fresh AND all tickers already in quotes, skip entirely
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

			// Check if all tickers are already in current quotes
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

		// Collect all updates into a single batch
		const batchedQuotes = new Map(currentQuotes);
		let hasAnyUpdates = false;
		const allResults: any[] = [];

		// Process each source
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
						// Ensure base price logic is applied even for cached data if missing
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
				continue; // Skip API for this source
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

			// Fetch from API if needed
			if (tickersToFetch.length > 0) {
				try {
					const response = await api.post("/market/overview", { tickers: tickersToFetch, period: p, source: src });
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

						// Update negative cache
						tickersToFetch.forEach((t) => {
							if (!returnedTickers.has(t)) {
								overviewNotFoundCache.add(`${t}:${src}:${p}`);
							}
						});

						// Background save
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

		// SINGLE reactivity trigger for ALL sources
		if (hasAnyUpdates) {
			const reactStart = performance.now();
			quotes.value = batchedQuotes;
			logger.info(`[Perf] Batched Reactivity Update: ${Math.round(performance.now() - reactStart)}ms`);
		}

		logger.info(
			`[Perf] fetchOverviewBatched Done: ${allResults.length} quotes. Total ${Math.round(performance.now() - startTotal)}ms`,
		);
	}

	async function fetchOverview(tickers: string[], period?: string, source?: string): Promise<any[]> {
		const startTotal = performance.now();
		try {
			const src = source || "YAHOO";
			const p = period || "7d";

			if (tickers.length === 0) return [];

			logger.info(`[Perf] fetchOverview Start: ${tickers.length} tickers (${p})`);

			// 1. Check RAM Cache First (Synchronous & Instant)
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
					} else if (isNotFound) {
						// Ignored (Negative Cache)
					} else {
						missingTickers.push(ticker);
					}
				}

				if (hasUpdates) {
					const reactStart = performance.now();
					quotes.value = batchedQuotes; // Instant Partial Update
					logger.info(`[Perf] RAM Cache Apply: ${Math.round(performance.now() - reactStart)}ms`);
				}

				if (missingTickers.length === 0) {
					logger.info(`[Perf] RAM Full Hit: ${Math.round(performance.now() - ramStart)}ms`);
					return ramResults;
				}
				logger.info(
					`[Perf] RAM Partial Hit: Found ${ramResults.length}, Missing ${missingTickers.length}. Took ${Math.round(performance.now() - ramStart)}ms`,
				);
			} else {
				logger.info(`[Perf] RAM Skip (Stale/New): ${isFresh ? "Fresh" : "Stale"}`);
			}

			// 2. SWR Pattern: Check SQLite cache
			const sqliteCacheKey = `quote_${src}_${p}`;
			const cachedResults: any[] = [...ramResults];
			let apiFetchTickers: string[] = [...missingTickers];

			try {
				if (missingTickers.length > 0) {
					const sqliteStart = performance.now();
					// logger.debug(`Checking SQLite for ${missingTickers.length} missing tickers...`);

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
								period: p, // Track period for reactivity context
								periodBasePrice: basePrice,
							});
							foundSet.add(q.ticker);
						});

						const reactStart = performance.now();
						quotes.value = batchedQuotes;
						logger.info(`[Perf] SQLite Reactivity Update: ${Math.round(performance.now() - reactStart)}ms`);

						cachedResults.push(...found);
						apiFetchTickers = missingTickers.filter((t) => !foundSet.has(t));

						// Fix: If we fulfilled everything from SQLite, mark this batch as fresh in RAM
						if (apiFetchTickers.length === 0) {
							overviewFetchTimestamps.set(requestKey, Date.now());
						}
					}
					logger.info(
						`[Perf] SQLite Check: Found ${found.length}, Missing ${apiFetchTickers.length}. Took ${Math.round(performance.now() - sqliteStart)}ms`,
					);
				}
			} catch (cacheErr) {
				logger.warn("Cache read failed", cacheErr);
			}

			if (apiFetchTickers.length === 0) {
				logger.info(`[Perf] Fetch Done (RAM+SQLite): Total ${Math.round(performance.now() - startTotal)}ms`);
				return cachedResults;
			}

			// 3. Fetch fresh data from API
			const apiStart = performance.now();
			logger.info(`[Perf] API Fetching ${apiFetchTickers.length} items...`);

			const response = await api.post("/market/overview", { tickers: apiFetchTickers, period: p, source: src });
			if (response.data.success) {
				const newQuotes = response.data.data || [];

				const batchedQuotes = new Map(quotes.value);
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
				});

				const reactStart = performance.now();
				quotes.value = batchedQuotes; // Single trigger
				logger.info(`[Perf] API Reactivity Update: ${Math.round(performance.now() - reactStart)}ms`);

				// Update Negative Cache
				apiFetchTickers.forEach((t) => {
					if (!returnedTickers.has(t)) {
						overviewNotFoundCache.add(`${t}:${src}:${p}`);
					}
				});

				overviewFetchTimestamps.set(requestKey, Date.now());

				// Background Save
				(async () => {
					for (const q of newQuotes) {
						try {
							await sqliteService.saveSymbolCache(q.ticker, sqliteCacheKey, q);
						} catch {
							/* ignore */
						}
					}
				})();

				logger.info(
					`[Perf] API Done: Got ${newQuotes.length}. Total Fetch time ${Math.round(performance.now() - startTotal)}ms`,
				);
				return [...cachedResults, ...newQuotes];
			}
			return cachedResults.length > 0 ? cachedResults : [];
		} catch (e) {
			logger.error("Failed to fetch overview", e);
			return [];
		}
	}

	// Actions
	async function fetchSymbols() {
		try {
			logger.debug("Fetching symbols...");
			loading.value = true;
			const response = await api.get("/market/symbols");
			if (response.data.success) {
				symbols.value = response.data.data;
				logger.info("Symbols loaded:", symbols.value.length);
			}
		} catch (e) {
			logger.error("Failed to fetch symbols", e);
			error.value = (e as Error).message;
		} finally {
			loading.value = false;
		}
	}

	async function fetchSymbolDetails(ticker: string) {
		const startTime = Date.now();
		try {
			loading.value = true;

			// Check SQLite cache first (TTL 24 hours)
			const cached = await sqliteService.getSymbolCache(ticker, "symbol_details", 24 * 60);
			if (cached) {
				logger.debug(`[${ticker}] Symbol details from cache (${Date.now() - startTime}ms)`);
				selectedSymbolData.value = cached;
				loading.value = false;

				// Background refresh if needed (non-blocking)
				api
					.get(`/market/symbols/${ticker}?enrich=true`)
					.then((response) => {
						if (response.data.success) {
							selectedSymbolData.value = response.data.data;
							sqliteService.saveSymbolCache(ticker, "symbol_details", response.data.data);
						}
					})
					.catch(() => {}); // Ignore background refresh errors

				return;
			}

			logger.debug(`[${ticker}] Fetching symbol details from API...`);
			const response = await api.get(`/market/symbols/${ticker}?enrich=true`);
			if (response.data.success) {
				selectedSymbolData.value = response.data.data;
				// Save to cache
				await sqliteService.saveSymbolCache(ticker, "symbol_details", response.data.data);
				logger.debug(`[${ticker}] Symbol details fetched & cached (${Date.now() - startTime}ms)`);
			}
		} catch (e) {
			logger.error(`[${ticker}] Failed to fetch symbol details (${Date.now() - startTime}ms)`, e);
		} finally {
			loading.value = false;
		}
	}

	async function syncSymbol(ticker: string, type: "STOCK" | "CRYPTO" = "STOCK") {
		try {
			logger.info("Syncing symbol:", ticker);
			syncing.value = true;
			error.value = null;
			const response = await api.post("/market/sync", {
				ticker,
				type,
				source: selectedSource.value,
			});
			if (!response.data.success) {
				throw new Error(response.data.error);
			}
			logger.info("Symbol synced successfully");
			return response.data;
		} catch (e) {
			logger.error("Sync failed", e);
			error.value = (e as Error).message;
			throw e;
		} finally {
			syncing.value = false;
		}
	}

	async function fetchHistory(ticker: string, interval = "1h", limit = 500, before?: string) {
		try {
			logger.debug(`Fetching history for ${ticker} (interval=${interval}, limit=${limit}, before=${before})`);
			const cacheKey = `${ticker}:${interval}:${selectedSource.value}`;

			// 0. RAM Cache Check (Instant Switch)
			if (!before) {
				const ramData = ohlcvCache.value.get(cacheKey);
				if (ramData && ramData.length > 0) {
					logger.debug(`[Cache] RAM Hit for ${cacheKey} (${ramData.length} items)`);
					ohlcvData.value = ramData;
					// Continue to SWR (Stale-While-Revalidate) with SQLite/Network
				} else {
					// No RAM cache: Clear data to show loading state (prevents mixing intervals)
					ohlcvData.value = [];
					historyLoading.value = true;
				}
			}

			// === DEBUG: Log interval explicitly ===
			logger.info(`🔍 [DEBUG] fetchHistory called with interval="${interval}"`);

			// 1. Try Cache First
			let cachedData: any[] = [];
			try {
				const beforeTs = before ? new Date(before).getTime() : undefined;
				cachedData = await sqliteService.getOHLCV(ticker, interval, limit, beforeTs, selectedSource.value);

				// === DEBUG: Check cache data timestamps ===
				if (cachedData.length > 0) {
					logger.info(`🔍 [DEBUG] Cache returned ${cachedData.length} candles for interval="${interval}"`);
					const sample = cachedData.slice(0, 3);
					sample.forEach((c, i) => {
						const ts = new Date(c.timestamp);
						logger.info(`   Cache[${i}]: ${c.timestamp} minute=${ts.getMinutes()}`);
					});
				}
			} catch (err) {
				logger.warn("SQLite Cache Read Failed", err);
			}

			if (cachedData.length > 0) {
				logger.debug(`Loaded ${cachedData.length} candles from Cache`);
				if (before) {
					// For history, if we found enough data, we might not need to hit API?
					// But for now, let's just use it as "instant load" and then fetch more if needed?
					// Actually, if we have local history, use it.
					// Only if cache is empty or small, go to API?
					// Let's stick to: Use Cache -> Render -> Fetch API if needed (or if cache was partial).
					// But if pagination, duplicating data is tricky.
					// Simplest:
					// Return cache immediately.
					// If cache size < limit, FETCH API to backfill.

					if (cachedData.length >= limit) {
						const currentOldest = ohlcvData.value[0]?.timestamp || Infinity;
						const currentOldestTime = new Date(currentOldest).getTime();

						// Debug overlaps
						const firstNew = cachedData[0];
						const lastNew = cachedData[cachedData.length - 1];

						// Filter data to ensure we only prepend strictly older data
						const newData = cachedData.filter((d) => new Date(d.timestamp).getTime() < currentOldestTime);

						if (newData.length === 0) {
							logger.debug(
								`[MarketStore] Cache overlap. Oldest: ${currentOldest}, New Range: ${firstNew?.timestamp} - ${lastNew?.timestamp}`,
							);
							return [];
						}

						console.time("OHLCV_Append_Cache");
						console.log(
							`[MarketStore] Appending ${newData.length} candles from cache. Range: ${newData[0].timestamp} - ${newData[newData.length - 1].timestamp} < ${currentOldest}`,
						);
						ohlcvData.value = [...newData, ...ohlcvData.value];
						console.timeEnd("OHLCV_Append_Cache");
						return newData;
					}
				} else {
					// Initial Load: Show Cache immediately
					const _current = ohlcvData.value;
					// If we already have data and this is strictly a replace (not append), careful.
					// But usually !before means initial load.

					console.time("OHLCV_Set_Cache");
					ohlcvData.value = cachedData;
					if (!before) ohlcvCache.value.set(cacheKey, cachedData); // Update RAM Cache
					console.timeEnd("OHLCV_Set_Cache");
					console.log(`[MarketStore] Set ${cachedData.length} candles from cache`);
					historyLoading.value = false; // Don't show loading spinner if we have cache
				}
			} else {
				// If no cache and initial load, show loading
				if (!before) historyLoading.value = true;
			}

			// 2. Network Fetch (SWR if cache exists)
			const networkPromise = (async () => {
				try {
					error.value = null;
					const response = await api.get(`/market/history/${ticker}`, {
						params: {
							limit: String(limit),
							interval: interval,
							before: before,
							source: selectedSource.value,
						},
					});

					if (response.data.success) {
						const newData = response.data.data || [];

						// === DEBUG: Check network data timestamps ===
						if (newData.length > 0) {
							logger.info(`🔍 [DEBUG] Network returned ${newData.length} candles for interval="${interval}"`);
							const sample = newData.slice(0, 3);
							sample.forEach((c: any, i: number) => {
								const ts = new Date(c.timestamp);
								logger.info(`   Network[${i}]: ${c.timestamp} minute=${ts.getMinutes()}`);
							});
						}

						// Save to Cache (Fire and Forget)
						// Inject source into data for SQLite storage
						const dataToSave = newData.map((d: any) => ({ ...d, source: selectedSource.value }));
						sqliteService.saveOHLCV(ticker, interval, dataToSave).catch((e) => logger.error("Cache Save Failed", e));

						if (before) {
							if (newData.length > 0) {
								const currentOldest = ohlcvData.value[0]?.timestamp || Infinity;
								const uniqueData = newData.filter(
									(d: any) => new Date(d.timestamp).getTime() < new Date(currentOldest).getTime(),
								);

								if (uniqueData.length === 0) {
									return [];
								}
								ohlcvData.value = [...uniqueData, ...ohlcvData.value];
								return uniqueData;
							}
							return newData;
						} else {
							// Initial/Latest Fetch returned
							const current = ohlcvData.value;

							// Check for identical data to avoid unnecessary reactivity
							if (
								current.length > 0 &&
								newData.length > 0 &&
								current.length === newData.length &&
								current[current.length - 1].timestamp === newData[newData.length - 1].timestamp &&
								current[0].timestamp === newData[0].timestamp
							) {
								return newData;
							}

							// Smart Merge: Preserve history if we have loaded older data while waiting for network
							if (current.length > 0 && newData.length > 0) {
								const newStartTs = new Date(newData[0].timestamp).getTime();
								// Keep timestamps strictly older than the new batch start
								const olderData = current.filter((d) => new Date(d.timestamp).getTime() < newStartTs);

								if (olderData.length > 0) {
									logger.debug(
										`[MarketStore] Merging network data. Preserving ${olderData.length} historical candles.`,
									);
									console.time("OHLCV_Merge_Network");
									const merged = [...olderData, ...newData];
									ohlcvData.value = merged;
									if (!before) ohlcvCache.value.set(cacheKey, merged); // Update RAM Cache
									console.timeEnd("OHLCV_Merge_Network");
									return ohlcvData.value;
								}
							}

							console.time("OHLCV_Set_Network");
							ohlcvData.value = newData;
							if (!before) ohlcvCache.value.set(cacheKey, newData); // Update RAM Cache

							console.timeEnd("OHLCV_Set_Network");
							logger.debug(`History loaded (Network): ${ohlcvData.value.length} candles`);
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
					throw e; // Re-throw for awaiter if needed
				} finally {
					// Only unset loading if we were the ones setting it
					if (!before && ohlcvData.value.length === 0) historyLoading.value = false;
					// If we had cache, loading was already false.
				}
			})();

			if (cachedData.length > 0 && !before) {
				// Return cache immediately, let network run in background
				networkPromise.catch((e) => logger.warn("Background fetch failed", e));
				return cachedData;
			} else {
				// Await network if no cache or if paging
				const res = await networkPromise;
				return res;
			}
		} catch (e) {
			logger.error("Fetch history failed", e);
			error.value = (e as Error).message;
			if (!before && ohlcvData.value.length === 0) ohlcvData.value = [];
		} finally {
			// Ensure loading is false if we awaited
			historyLoading.value = false;
		}
	}

	async function runAnalysis(ticker: string, strategyId: string, params: Record<string, number> = {}) {
		try {
			logger.info(`Running analysis on ${ticker} with ${strategyId}`, params);
			analyzing.value = true;
			error.value = null;
			const response = await api.post("/analysis/run", {
				ticker,
				strategy: strategyId,
				...params,
			});
			if (response.data.success) {
				signals.value = response.data.signals;
				lastAnalysisTicker.value = ticker;
				logger.info(`Analysis complete: ${signals.value.length} signals generated`);
				return response.data;
			} else {
				throw new Error(response.data.error);
			}
		} catch (e) {
			logger.error("Analysis failed", e);
			error.value = (e as Error).message;
			signals.value = [];
			throw e;
		} finally {
			analyzing.value = false;
		}
	}

	function selectSymbol(ticker: string) {
		selectedSymbol.value = ticker;
	}

	function selectStrategy(strategyId: string) {
		selectedStrategy.value = strategyId;
	}

	function selectSource(source: string) {
		selectedSource.value = source;
		// Clear data to trigger refresh
		ohlcvData.value = [];
	}

	// ===== NEW: Search, Trending, Recommendations =====

	async function searchSymbols(query: string, limit: number = 15) {
		try {
			logger.debug(`Searching symbols: ${query}`);
			const response = await api.get("/market/search", {
				params: { q: query, limit: String(limit) },
			});
			if (response.data.success) {
				return response.data.data;
			}
			return [];
		} catch (e) {
			logger.error("Failed to search symbols", e);
			return [];
		}
	}

	async function fetchTrending(region: string = "US", count: number = 10) {
		try {
			logger.debug(`Fetching trending symbols for ${region}`);
			const response = await api.get("/market/trending", {
				params: { region, count: String(count) },
			});
			if (response.data.success) {
				// Update movers.trending with fresh data
				movers.value.trending = response.data.data;
				return response.data.data;
			}
			return [];
		} catch (e) {
			logger.error("Failed to fetch trending", e);
			return [];
		}
	}

	/**
	 * Fetch financial metrics for a stock (PE, margins, etc)
	 */
	async function fetchFinancials(ticker: string) {
		try {
			// Check SQLite Cache (TTL 24 hours for financials)
			const cached = await sqliteService.getSymbolCache(ticker, "financials", 24 * 60);
			if (cached) {
				logger.debug(`Loaded financials for ${ticker} from SQLite`);
				return cached;
			}

			logger.debug(`Fetching financials for ${ticker} from API`);
			const response = await api.get(`/market/financials/${ticker}`);
			if (response.data.success) {
				// Save to SQLite
				await sqliteService.saveSymbolCache(ticker, "financials", response.data.data);
				return response.data.data;
			}
			return null;
		} catch (e) {
			logger.error(`Failed to fetch financials for ${ticker}`, e);
			return null;
		}
	}

	/**
	 * Fetch earnings data for a stock (history, calendar, trend)
	 */
	async function fetchEarnings(ticker: string) {
		try {
			// Check SQLite Cache (TTL 24 hours for earnings)
			const cached = await sqliteService.getSymbolCache(ticker, "earnings", 24 * 60);
			if (cached) return cached;

			logger.debug(`Fetching earnings for ${ticker}`);
			const response = await api.get(`/market/earnings/${ticker}`);
			if (response.data.success) {
				await sqliteService.saveSymbolCache(ticker, "earnings", response.data.data);
				return response.data.data;
			}
			return null;
		} catch (e) {
			logger.error(`Failed to fetch earnings for ${ticker}`, e);
			return null;
		}
	}

	/**
	 * Fetch analyst ratings for a stock (buy/hold/sell breakdown)
	 */
	async function fetchAnalyst(ticker: string) {
		try {
			// Check SQLite Cache (TTL 7 days for analyst as it changes slowly)
			const cached = await sqliteService.getSymbolCache(ticker, "analyst", 7 * 24 * 60);
			if (cached) return cached;

			logger.debug(`Fetching analyst ratings for ${ticker}`);
			const response = await api.get(`/market/analyst/${ticker}`);
			if (response.data.success) {
				await sqliteService.saveSymbolCache(ticker, "analyst", response.data.data);
				return response.data.data;
			}
			return null;
		} catch (e) {
			logger.error(`Failed to fetch analyst for ${ticker}`, e);
			return null;
		}
	}

	/**
	 * Fetch single real-time quote for a ticker
	 */
	async function fetchQuote(ticker: string) {
		try {
			// Short Cache for Quote (1 min) - keep short for accurate marketState
			const cacheKey = `quote_${selectedSource.value}`;
			const cached = await sqliteService.getSymbolCache(ticker, cacheKey, 1);
			if (cached) return cached;

			logger.debug(`Fetching quote for ${ticker} (source=${selectedSource.value})`);
			const response = await api.get(`/market/quote/${ticker}`, {
				params: { source: selectedSource.value },
			});
			if (response.data.success) {
				await sqliteService.saveSymbolCache(ticker, cacheKey, response.data.data);
				return response.data.data;
			}
			return null;
		} catch (e) {
			logger.error(`Failed to fetch quote for ${ticker}`, e);
			return null;
		}
	}

	async function fetchRecommendations(ticker: string) {
		// Recommendations don't change often, cache for 1 day
		try {
			const cached = await sqliteService.getSymbolCache(ticker, "recommendations", 24 * 60);
			if (cached && Array.isArray(cached) && cached.length > 0) return cached;
		} catch (_e) {
			// Ignore cache errors
		}

		try {
			const response = await api.get(`/market/recommendations/${ticker}`);
			if (response.data.success) {
				const recs = response.data.data || [];
				// Backend already returns full quote objects, just cache and return
				if (recs.length > 0) {
					await sqliteService.saveSymbolCache(ticker, "recommendations", recs);
				}
				return recs;
			}
			return [];
		} catch (e) {
			logger.error("Failed to fetch recommendations", e);
			return [];
		}
	}

	function updateQuote(key: string, update: Partial<MarketMover>) {
		const existing = quotes.value.get(key);
		// console.log(`%c[MarketStore] updateQuote: key=${key}, existing=${!!existing}, price=${update.price}`, 'color: #9C27B0; font-weight: bold');

		if (existing) {
			// Update existing entry
			quotes.value.set(key, { ...existing, ...update });
			// console.log(`%c[MarketStore] Updated existing, quotesVersion will be ${quotesVersion.value + 1}`, 'color: #4CAF50');
		} else {
			// Create new entry with minimal data (will be enriched by next fetch)
			quotes.value.set(key, update as MarketMover);
			console.log(`%c[MarketStore] Created new entry for ${key}`, "color: #FF9800");
		}

		quotesVersion.value++;
		triggerRef(quotes);
	}

	return {
		// State
		symbols,
		movers,
		quotes,
		quotesVersion, // Expose to computed dependencies
		selectedSymbol,
		selectedSource,
		selectedStrategy,
		loading,
		historyLoading,
		syncing,
		analyzing,
		ohlcvData,
		signals,
		lastAnalysisTicker,
		error,

		// Computed
		currentStrategy,

		// Actions
		fetchSymbols,
		fetchMovers,
		fetchOverview,
		fetchOverviewBatched,
		fetchTrending,
		searchSymbols,
		fetchRecommendations,
		syncSymbol,
		fetchHistory,
		runAnalysis,
		selectSymbol,
		fetchSymbolDetails,
		selectStrategy,
		selectSource,
		selectedSymbolData,

		// NEW: Financial data actions
		fetchFinancials,
		fetchEarnings,
		fetchAnalyst,
		fetchQuote,
		updateQuote,
	};
});
