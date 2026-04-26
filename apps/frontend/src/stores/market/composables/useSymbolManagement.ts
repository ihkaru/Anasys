import { nextTick, ref, type Ref } from "vue";
import { sqliteService } from "../../../services/sqlite";
import type { Logger } from "../../../utils/logger";
import { marketApi } from "../api/marketApi";
import type { MarketMover, Symbol as MarketSymbol } from "../market.types";

export function useSymbolManagement(
	logger: Logger,
	movers: Ref<{ gainers: MarketMover[]; losers: MarketMover[]; trending: MarketMover[] }>,
) {
	const symbols = ref<MarketSymbol[]>([]);
	const selectedSymbolData = ref<MarketSymbol | null>(null);
	const loading = ref(false);
	const syncing = ref(false);
	const error = ref<string | null>(null);
	const stats = ref<any | null>(null);

	async function fetchStats() {
		try {
			logger.debug("Fetching market stats from API...");
			const response = await marketApi.fetchStats();
			if (response.data.success) {
				stats.value = response.data.data;
				logger.info("Market stats updated", stats.value);
			}
		} catch (e) {
			logger.error("Failed to fetch market stats", e);
		}
	}

	async function fetchSymbols() {
		try {
			logger.debug("Fetching symbols...");
			loading.value = true;
			const response = await marketApi.fetchSymbols();
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
		const _startTime = Date.now();
		try {
			loading.value = true;
			const cached = await sqliteService.getSymbolCache(ticker, "symbol_details", 24 * 60);
			if (cached) {
				logger.debug(`[${ticker}] Symbol details from cache`);
				selectedSymbolData.value = cached;
				loading.value = false;

				marketApi
					.fetchSymbolDetails(ticker)
					.then((response) => {
						if (response.data.success) {
							selectedSymbolData.value = response.data.data;
							sqliteService.saveSymbolCache(ticker, "symbol_details", response.data.data);
						}
					})
					.catch(() => {});
				return;
			}

			logger.debug(`[${ticker}] Fetching symbol details from API...`);
			const response = await marketApi.fetchSymbolDetails(ticker);
			if (response.data.success) {
				selectedSymbolData.value = response.data.data;
				await sqliteService.saveSymbolCache(ticker, "symbol_details", response.data.data);
				logger.debug(`[${ticker}] Symbol details fetched & cached`);
			}
		} catch (e) {
			logger.error(`[${ticker}] Failed to fetch symbol details`, e);
		} finally {
			loading.value = false;
		}
	}

	async function syncSymbol(ticker: string, type: "STOCK" | "CRYPTO" = "STOCK") {
		try {
			logger.info("Syncing symbol:", ticker);
			syncing.value = true;
			error.value = null;
			const response = await marketApi.syncSymbol(ticker, type, "YAHOO");

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

	async function searchSymbols(query: string, limit: number = 15) {
		try {
			const response = await marketApi.searchSymbols(query, limit);
			if (response.data.success) return response.data.data;
			return [];
		} catch (e) {
			logger.error("Failed to search symbols", e);
			return [];
		}
	}

	// IN-FLIGHT TRACKING to prevent race conditions during Hard Refresh
	const inFlight = {
		movers: null as Promise<void> | null,
		trending: new Map<string, Promise<any[]>>(),
	};

	async function fetchTrending(region: string = "US", count: number = 10) {
		const key = `${region}:${count}`;
		if (inFlight.trending.has(key)) {
			logger.debug(`[fetchTrending] Request already in flight for ${key}, reusing...`);
			return inFlight.trending.get(key)!;
		}

		const promise = (async () => {
			try {
				const response = await marketApi.fetchTrending(region, count);
				if (response.data.success) {
					const data = response.data.data as any[];
					// DIAGNOSTIC: check for null/malformed tickers before storing
					const bad = data.filter((d) => !d.ticker);
					if (bad.length > 0) {
						logger.warn(`[fetchTrending] ⚠️ ${bad.length} items have NULL/EMPTY ticker!`, bad);
					}
					logger.debug(`[fetchTrending] Received ${data.length} items. Sample:`, data.slice(0, 3).map((d) => ({ ticker: d.ticker, name: d.name, changePercent: d.changePercent })));
					
					// Use nextTick to avoid rendering collisions during mount
					await nextTick();
					movers.value = {
						...movers.value,
						trending: data.filter((d) => d.ticker)
					};
					return movers.value.trending;
				}
				return [];
			} catch (e) {
				logger.error("Failed to fetch trending", e);
				return [];
			} finally {
				inFlight.trending.delete(key);
			}
		})();

		inFlight.trending.set(key, promise);
		return promise;
	}

	async function fetchMovers() {
		if (inFlight.movers) {
			logger.debug("[fetchMovers] Request already in flight, reusing...");
			return inFlight.movers;
		}

		inFlight.movers = (async () => {
			try {
				logger.debug("Fetching market movers...");
				const response = await marketApi.fetchMovers();
				if (response.data.success) {
					const raw = response.data.data as { gainers: any[]; losers: any[]; trending: any[] };
					// DIAGNOSTIC: filter and log any items with null tickers
					for (const key of ["gainers", "losers", "trending"] as const) {
						const bad = (raw[key] || []).filter((d: any) => !d.ticker);
						if (bad.length > 0) logger.warn(`[fetchMovers] ⚠️ ${key}: ${bad.length} items with NULL ticker!`, bad);
					}
					logger.debug(`[fetchMovers] gainers=${raw.gainers?.length}, losers=${raw.losers?.length}, trending=${raw.trending?.length}`);

					const newMovers = {
						gainers: (raw.gainers || []).filter((d: any) => d.ticker),
						losers: (raw.losers || []).filter((d: any) => d.ticker),
						trending: (raw.trending || []).filter((d: any) => d.ticker),
					};

					// Check if data actually changed to avoid redundant patches
					const isSame = JSON.stringify(movers.value) === JSON.stringify(newMovers);
					if (!isSame) {
						logger.debug("[fetchMovers] Data changed, updating movers.value");
						// Use nextTick to avoid rendering collisions during mount
						await nextTick();
						movers.value = newMovers;
					} else {
						logger.debug("[fetchMovers] Data unchanged, skipping update");
					}
				}
			} catch (e) {
				logger.error("Failed to fetch movers", e);
			} finally {
				inFlight.movers = null;
			}
		})();

		return inFlight.movers;
	}

	return {
		symbols,
		selectedSymbolData,
		loading,
		syncing,
		error,
		stats,
		fetchSymbols,
		fetchSymbolDetails,
		syncSymbol,
		searchSymbols,
		fetchTrending,
		fetchMovers,
		fetchStats,
	};
}
