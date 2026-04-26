import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { createLogger } from "../../utils/logger";
import { STRATEGIES } from "./market.constants";
import type { MarketMover } from "./market.types";

import { useMarketAnalysis } from "./composables/useMarketAnalysis";
import { useMarketCache } from "./composables/useMarketCache";
import { useMarketHistory } from "./composables/useMarketHistory";
import { useQuoteUpdates } from "./composables/useQuoteUpdates";
import { useSymbolManagement } from "./composables/useSymbolManagement";

export const useMarketStore = defineStore("market", () => {
	const logger = createLogger("MarketStore");

	// Shared State
	const selectedSymbol = useLocalStorage<string>("selected_symbol", "AAPL");
	const selectedStrategy = useLocalStorage<string>("selected_strategy", "SMA_CROSSOVER");

	// Quotes State
	const quotes = shallowRef<Map<string, MarketMover>>(new Map());
	const quotesVersion = ref(0);

	// Movers State
	const movers = shallowRef<{ gainers: MarketMover[]; losers: MarketMover[]; trending: MarketMover[] }>({
		gainers: [],
		losers: [],
		trending: [],
	});

	// Composables — selectedSource removed, Smart Proxy handles routing on backend
	const symbolManagement = useSymbolManagement(logger, movers);
	const marketCache = useMarketCache(logger, quotes, quotesVersion);
	const marketHistory = useMarketHistory(logger);
	const marketAnalysis = useMarketAnalysis(logger);
	const quoteUpdates = useQuoteUpdates(logger, quotes, quotesVersion);

	// Computed
	const currentStrategy = computed(() => STRATEGIES.find((s) => s.id === selectedStrategy.value) || STRATEGIES[0]);

	// Aggregated Loading & Error
	const loading = computed(() => symbolManagement.loading.value);
	const error = computed({
		get: () => symbolManagement.error.value || marketHistory.error.value || marketAnalysis.error.value || null,
		set: (val) => {
			if (val === null) {
				symbolManagement.error.value = null;
				marketHistory.error.value = null;
				marketAnalysis.error.value = null;
			}
		},
	});

	// Actions
	function selectSymbol(ticker: string) {
		selectedSymbol.value = ticker;
	}

	function selectStrategy(strategyId: string) {
		selectedStrategy.value = strategyId;
	}

	return {
		// State
		selectedSymbol,
		selectedStrategy,
		currentStrategy,
		quotes,
		quotesVersion,
		movers,
		stats: symbolManagement.stats,

		// Composables State Exposed
		symbols: symbolManagement.symbols,
		selectedSymbolData: symbolManagement.selectedSymbolData,
		loading,
		syncing: symbolManagement.syncing,

		ohlcvData: marketHistory.ohlcvData,
		historyLoading: marketHistory.historyLoading,

		signals: marketAnalysis.signals,
		lastAnalysisTicker: marketAnalysis.lastAnalysisTicker,
		analyzing: marketAnalysis.analyzing,

		error,

		// Actions
		selectSymbol,
		selectStrategy,

		// Symbol Actions
		fetchSymbols: symbolManagement.fetchSymbols,
		fetchSymbolDetails: symbolManagement.fetchSymbolDetails,
		syncSymbol: symbolManagement.syncSymbol,
		searchSymbols: symbolManagement.searchSymbols,
		fetchTrending: symbolManagement.fetchTrending,
		fetchMovers: symbolManagement.fetchMovers,

		// Cache/Overview Actions
		fetchOverview: marketCache.fetchOverview,
		fetchOverviewBatched: marketCache.fetchOverviewBatched,

		// History Actions
		fetchHistory: marketHistory.fetchHistory,

		// Analysis Actions
		runAnalysis: marketAnalysis.runAnalysis,
		fetchFinancials: marketAnalysis.fetchFinancials,
		fetchEarnings: marketAnalysis.fetchEarnings,
		fetchAnalyst: marketAnalysis.fetchAnalyst,
		fetchRecommendations: marketAnalysis.fetchRecommendations,

		// Quote Actions
		updateQuote: quoteUpdates.updateQuote,
		fetchQuote: quoteUpdates.fetchQuote,
		fetchStats: symbolManagement.fetchStats,
	};
});
