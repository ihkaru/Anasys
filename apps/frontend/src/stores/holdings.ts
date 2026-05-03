import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/client";
import { createLogger } from "../utils/logger";

const logger = createLogger("HoldingsStore");

export interface Holding {
	id: number;
	ticker: string;
	name: string | null;
	type: string;
	source: string;
	shares: number;
	avgCost: number;
	currentPrice: number;
	currentValue: number;
	pnl: number;
	pnlPercent: number;
	website?: string | null;
	iconUrl?: string | null;
	sparkline?: number[];
}

export interface PortfolioSummary {
	totalValue: number;
	totalCost: number;
	totalPnl: number;
	totalPnlPercent: number;
	holdingsCount: number;
	allocation: {
		ticker: string;
		name: string | null;
		value: number;
		percent: number;
	}[];
}

export const useHoldingsStore = defineStore("holdings", () => {
	const holdings = ref<Holding[]>([]);
	const summary = ref<PortfolioSummary | null>(null);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// Computed
	const totalValue = computed(() => summary.value?.totalValue || 0);
	const totalPnl = computed(() => summary.value?.totalPnl || 0);
	const totalPnlPercent = computed(() => summary.value?.totalPnlPercent || 0);
	const allocation = computed(() => summary.value?.allocation || []);
	const totalCost = computed(() => summary.value?.totalCost || 0);

	// Actions
	async function fetchHoldings() {
		try {
			logger.debug("Fetching holdings...");
			loading.value = true;
			error.value = null;

			const response = await api.get("/holdings");
			if (response.data.success) {
				holdings.value = response.data.data;
				logger.info(`Loaded ${holdings.value.length} holdings`);
			} else {
				throw new Error(response.data.error);
			}
		} catch (e) {
			logger.error("Failed to fetch holdings", e);
			error.value = (e as Error).message;
		} finally {
			loading.value = false;
		}
	}

	async function fetchSummary() {
		try {
			logger.debug("Fetching portfolio summary...");
			const response = await api.get("/holdings/summary");
			if (response.data.success) {
				summary.value = response.data.data;
			} else {
				throw new Error(response.data.error);
			}
		} catch (e) {
			logger.error("Failed to fetch summary", e);
		}
	}

	async function addHolding(ticker: string, shares: number, avgCost: number, source?: string) {
		try {
			logger.info(`Adding holding: ${ticker} (${source})`);
			const response = await api.post("/holdings", { ticker, shares, avgCost, source });
			if (response.data.success) {
				// Refresh data
				await fetchHoldings();
				await fetchSummary();
				return { success: true };
			} else {
				throw new Error(response.data.error);
			}
		} catch (e) {
			logger.error("Failed to add holding", e);
			return { success: false, error: (e as Error).message };
		}
	}

	async function updateHolding(holdingId: number, updates: { shares?: number; avgCost?: number }) {
		try {
			logger.info(`Updating holding ${holdingId}`);
			const response = await api.patch(`/holdings/${holdingId}`, updates);
			if (response.data.success) {
				// Refresh data
				await fetchHoldings();
				await fetchSummary();
				return { success: true };
			} else {
				throw new Error(response.data.error);
			}
		} catch (e) {
			logger.error("Failed to update holding", e);
			return { success: false, error: (e as Error).message };
		}
	}

	async function deleteHolding(holdingId: number) {
		try {
			logger.info(`Deleting holding ${holdingId}`);
			const response = await api.delete(`/holdings/${holdingId}`);
			if (response.data.success) {
				// Remove from local state
				holdings.value = holdings.value.filter((h) => h.id !== holdingId);
				// Refresh summary
				await fetchSummary();
				return { success: true };
			} else {
				throw new Error(response.data.error);
			}
		} catch (e) {
			logger.error("Failed to delete holding", e);
			return { success: false, error: (e as Error).message };
		}
	}

	// Initialize data
	async function initialize() {
		await Promise.all([fetchHoldings(), fetchSummary()]);
	}

	return {
		// State
		holdings,
		summary,
		loading,
		error,

		// Computed
		totalValue,
		totalPnl,
		totalPnlPercent,
		allocation,
		totalCost,

		// Actions
		fetchHoldings,
		fetchSummary,
		addHolding,
		updateHolding,
		deleteHolding,
		initialize,
	};
});
