import { api } from "../../../api/client";
import type { MarketMover, Symbol as MarketSymbol, OHLCV, Signal } from "../market.types";

export const marketApi = {
	async fetchStats() {
		return api.get<{ success: boolean; data: any }>("/market/internal/stats");
	},

	async fetchMovers() {
		return api.get<{
			success: boolean;
			data: { gainers: MarketMover[]; losers: MarketMover[]; trending: MarketMover[] };
		}>("/market/movers");
	},

	async fetchOverview(payload: { tickers: string[]; period?: string; source?: string }) {
		return api.post<{ success: boolean; data: MarketMover[] }>("/market/overview", payload);
	},

	async fetchSymbols() {
		return api.get<{ success: boolean; data: MarketSymbol[] }>("/market/symbols");
	},

	async fetchSymbolDetails(ticker: string) {
		return api.get<{ success: boolean; data: MarketSymbol }>(`/market/symbols/${ticker}?enrich=true`);
	},

	async syncSymbol(ticker: string, type: string, source: string) {
		return api.post<{ success: boolean; error?: string }>("/market/sync", { ticker, type, source });
	},

	async fetchHistory(ticker: string, params: { limit: string; interval: string; before?: string }) {
		return api.get<{ success: boolean; data: OHLCV[]; error?: string }>(`/market/history/${ticker}`, { params });
	},

	async runAnalysis(ticker: string, strategy: string, params: Record<string, number>) {
		return api.post<{ success: boolean; signals: Signal[]; error?: string }>("/analysis/run", {
			ticker,
			strategy,
			...params,
		});
	},

	async searchSymbols(query: string, limit: number) {
		return api.get<{ success: boolean; data: MarketSymbol[] }>("/market/search", {
			params: { q: query, limit: String(limit) },
		});
	},

	async fetchTrending(region: string, count: number) {
		return api.get<{ success: boolean; data: MarketMover[] }>("/market/trending", {
			params: { region, count: String(count) },
		});
	},

	async fetchFinancials(ticker: string) {
		return api.get<{ success: boolean; data: any }>(`/market/financials/${ticker}`);
	},

	async fetchEarnings(ticker: string) {
		return api.get<{ success: boolean; data: any }>(`/market/earnings/${ticker}`);
	},

	async fetchAnalyst(ticker: string) {
		return api.get<{ success: boolean; data: any }>(`/market/analyst/${ticker}`);
	},

	async fetchQuote(ticker: string) {
		return api.get<{ success: boolean; data: MarketMover }>(`/market/quote/${ticker}`);
	},

	async fetchRecommendations(ticker: string) {
		return api.get<{ success: boolean; data: any[] }>(`/market/recommendations/${ticker}`);
	},
};
