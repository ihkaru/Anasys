import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/client";
import { createLogger } from "../utils/logger";

const logger = createLogger("WatchlistStore");

export interface Watchlist {
	id: number;
	name: string;
	isDefault: boolean;
	createdAt?: string;
	updatedAt?: string;
}

export interface WatchlistItem {
	ticker: string;
	name: string | null;
	type: string;
	source: string;
	addedAt: string;
	// Logo support
	website?: string | null;
	iconUrl?: string | null;
	currency?: string;
	exchange?: string;
	// Extended with market data (client-side enrichment)
	price?: number;
	changePercent?: number;
	sparkline?: number[];
}

export interface WatchlistWithItems extends Watchlist {
	items: WatchlistItem[];
}

export const useWatchlistStore = defineStore("watchlist", () => {
	const watchlists = ref<Watchlist[]>([]);
	const currentWatchlist = ref<WatchlistWithItems | null>(null);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// Computed
	const defaultWatchlist = computed(() => watchlists.value.find((w) => w.isDefault) || watchlists.value[0]);

	// Actions
	async function fetchWatchlists() {
		try {
			logger.debug("Fetching watchlists...");
			loading.value = true;
			error.value = null;

			const response = await api.get("/watchlists");
			if (response.data.success) {
				watchlists.value = response.data.data;
				logger.info(`Loaded ${watchlists.value.length} watchlists`);
			} else {
				throw new Error(response.data.error);
			}
		} catch (e) {
			logger.error("Failed to fetch watchlists", e);
			error.value = (e as Error).message;
		} finally {
			loading.value = false;
		}
	}

	async function fetchWatchlistWithItems(watchlistId: number) {
		try {
			logger.debug(`Fetching watchlist ${watchlistId} with items`);
			loading.value = true;
			error.value = null;

			const response = await api.get(`/watchlists/${watchlistId}`);
			if (response.data.success) {
				currentWatchlist.value = response.data.data;
				logger.debug(`Loaded ${currentWatchlist.value?.items.length || 0} items`);
			} else {
				throw new Error(response.data.error);
			}
		} catch (e) {
			logger.error("Failed to fetch watchlist", e);
			error.value = (e as Error).message;
		} finally {
			loading.value = false;
		}
	}

	async function createWatchlist(name: string, isDefault = false) {
		try {
			logger.info(`Creating watchlist: ${name}`);
			const response = await api.post("/watchlists", { name, isDefault });
			if (response.data.success) {
				watchlists.value.push(response.data.data);
				return response.data.data;
			} else {
				throw new Error(response.data.error);
			}
		} catch (e) {
			logger.error("Failed to create watchlist", e);
			throw e;
		}
	}

	async function updateWatchlist(watchlistId: number, updates: { name?: string; isDefault?: boolean }) {
		try {
			logger.info(`Updating watchlist ${watchlistId}`);
			const response = await api.patch(`/watchlists/${watchlistId}`, updates);
			if (response.data.success) {
				const index = watchlists.value.findIndex((w) => w.id === watchlistId);
				if (index !== -1) {
					watchlists.value[index] = response.data.data;
				}
				return response.data.data;
			} else {
				throw new Error(response.data.error);
			}
		} catch (e) {
			logger.error("Failed to update watchlist", e);
			throw e;
		}
	}

	async function deleteWatchlist(watchlistId: number) {
		try {
			logger.info(`Deleting watchlist ${watchlistId}`);
			const response = await api.delete(`/watchlists/${watchlistId}`);
			if (response.data.success) {
				watchlists.value = watchlists.value.filter((w) => w.id !== watchlistId);
			} else {
				throw new Error(response.data.error);
			}
		} catch (e) {
			logger.error("Failed to delete watchlist", e);
			throw e;
		}
	}

	async function addSymbolToWatchlist(watchlistId: number, ticker: string, type?: string, source?: string) {
		try {
			logger.info(`Adding ${ticker} (${source}) to watchlist ${watchlistId}`);
			const response = await api.post(`/watchlists/${watchlistId}/symbols`, { ticker, type, source });
			if (!response.data.success) {
				throw new Error(response.data.error);
			}
			// Refresh current watchlist if it's the one we modified
			if (currentWatchlist.value?.id === watchlistId) {
				await fetchWatchlistWithItems(watchlistId);
			}
		} catch (e) {
			logger.error("Failed to add symbol", e);
			throw e;
		}
	}

	async function removeSymbolFromWatchlist(watchlistId: number, ticker: string) {
		try {
			logger.info(`Removing ${ticker} from watchlist ${watchlistId}`);
			const response = await api.delete(`/watchlists/${watchlistId}/symbols/${ticker}`);
			if (!response.data.success) {
				throw new Error(response.data.error);
			}
			// Update local state
			if (currentWatchlist.value?.id === watchlistId) {
				currentWatchlist.value.items = currentWatchlist.value.items.filter((item) => item.ticker !== ticker);
			}
		} catch (e) {
			logger.error("Failed to remove symbol", e);
			throw e;
		}
	}

	return {
		// State
		watchlists,
		currentWatchlist,
		loading,
		error,

		// Computed
		defaultWatchlist,

		// Actions
		fetchWatchlists,
		fetchWatchlistWithItems,
		createWatchlist,
		updateWatchlist,
		deleteWatchlist,
		addSymbolToWatchlist,
		removeSymbolFromWatchlist,
	};
});
