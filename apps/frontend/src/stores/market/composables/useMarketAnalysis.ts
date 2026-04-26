import { ref } from "vue";
import { sqliteService } from "../../../services/sqlite";
import type { Logger } from "../../../utils/logger";
import { marketApi } from "../api/marketApi";
import type { Signal } from "../market.types";

export function useMarketAnalysis(logger: Logger) {
	const signals = ref<Signal[]>([]);
	const lastAnalysisTicker = ref<string | null>(null);
	const analyzing = ref(false);
	const error = ref<string | null>(null);

	async function runAnalysis(ticker: string, strategyId: string, params: Record<string, number> = {}) {
		try {
			logger.info(`Running analysis on ${ticker} with ${strategyId}`, params);
			analyzing.value = true;
			error.value = null;
			const response = await marketApi.runAnalysis(ticker, strategyId, params);

			if (response.data.success) {
				signals.value = response.data.signals;
				lastAnalysisTicker.value = ticker;
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

	async function fetchFinancials(ticker: string) {
		try {
			const cached = await sqliteService.getSymbolCache(ticker, "financials", 24 * 60);
			if (cached) return cached;

			const response = await marketApi.fetchFinancials(ticker);
			if (response.data.success) {
				await sqliteService.saveSymbolCache(ticker, "financials", response.data.data);
				return response.data.data;
			}
			return null;
		} catch (e) {
			logger.error(`Failed to fetch financials for ${ticker}`, e);
			return null;
		}
	}

	async function fetchEarnings(ticker: string) {
		try {
			const cached = await sqliteService.getSymbolCache(ticker, "earnings", 24 * 60);
			if (cached) return cached;

			const response = await marketApi.fetchEarnings(ticker);
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

	async function fetchAnalyst(ticker: string) {
		try {
			const cached = await sqliteService.getSymbolCache(ticker, "analyst", 7 * 24 * 60);
			if (cached) return cached;

			const response = await marketApi.fetchAnalyst(ticker);
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

	async function fetchRecommendations(ticker: string) {
		try {
			const cached = await sqliteService.getSymbolCache(ticker, "recommendations", 24 * 60);
			if (cached && Array.isArray(cached) && cached.length > 0) return cached;
		} catch {}

		try {
			const response = await marketApi.fetchRecommendations(ticker);
			if (response.data.success) {
				const recs = response.data.data || [];
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

	return {
		signals,
		lastAnalysisTicker,
		analyzing,
		error,
		runAnalysis,
		fetchFinancials,
		fetchEarnings,
		fetchAnalyst,
		fetchRecommendations,
	};
}
