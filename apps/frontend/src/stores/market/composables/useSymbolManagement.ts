import { ref, type Ref } from "vue";
import { sqliteService } from "../../../services/sqlite";
import type { Logger } from "../../../utils/logger";
import { marketApi } from "../api/marketApi";
import type { MarketMover } from "../market.types";

export function useSymbolManagement(
	logger: Logger,
	selectedSource: Ref<string>,
	movers: Ref<{ gainers: MarketMover[]; losers: MarketMover[]; trending: MarketMover[] }>,
) {
	const symbols = ref<Symbol[]>([]);
	const selectedSymbolData = ref<Symbol | null>(null);
	const loading = ref(false);
	const syncing = ref(false);
	const error = ref<string | null>(null);

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
			const response = await marketApi.syncSymbol(ticker, type, selectedSource.value);

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

	async function fetchTrending(region: string = "US", count: number = 10) {
		try {
			const response = await marketApi.fetchTrending(region, count);
			if (response.data.success) {
				movers.value.trending = response.data.data;
				return response.data.data;
			}
			return [];
		} catch (e) {
			logger.error("Failed to fetch trending", e);
			return [];
		}
	}

	async function fetchMovers() {
		try {
			logger.debug("Fetching market movers...");
			const response = await marketApi.fetchMovers();
			if (response.data.success) {
				movers.value = response.data.data;
			}
		} catch (e) {
			logger.error("Failed to fetch movers", e);
		}
	}

	return {
		symbols,
		selectedSymbolData,
		loading,
		syncing,
		error,
		fetchSymbols,
		fetchSymbolDetails,
		syncSymbol,
		searchSymbols,
		fetchTrending,
		fetchMovers,
	};
}
