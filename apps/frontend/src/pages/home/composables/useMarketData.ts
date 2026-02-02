import { ref } from "vue";
import { api } from "../../../api/client";
import { createLogger } from "../../../utils/logger";

export interface MarketItem {
	ticker: string;
	name: string;
	changePercent: number;
}

export function useMarketData() {
	const logger = createLogger("useMarketData");
	const marketOverview = ref<MarketItem[]>([]);
	const loading = ref(false);
	const error = ref<Error | null>(null);

	async function fetchMarketOverview() {
		loading.value = true;
		error.value = null;
		try {
			const response = await api.get("/market/overview");
			if (response.data.success) {
				marketOverview.value = response.data.data;
			}
		} catch (e) {
			logger.warn("Could not fetch market overview", e);
			loading.value = false;
			error.value = e as Error;
			// Fallback to dummy data
			marketOverview.value = [
				{ ticker: "SPY", name: "S&P 500", changePercent: 1.24 },
				{ ticker: "QQQ", name: "NASDAQ", changePercent: 0.87 },
				{ ticker: "BTC-USD", name: "BTC", changePercent: -2.15 },
			];
		} finally {
			loading.value = false;
		}
	}

	return {
		marketOverview,
		loading,
		error,
		fetchMarketOverview,
	};
}
