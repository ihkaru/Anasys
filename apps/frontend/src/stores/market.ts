import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/client";

import { sqliteService } from "../services/sqlite";
import { createLogger } from "../utils/logger";

export interface Symbol {
    id: number;
    ticker: string;
    name: string;
    type: 'STOCK' | 'CRYPTO';
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
    type: 'BUY' | 'SELL' | 'HOLD';
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
        id: 'SMA_CROSSOVER',
        name: 'SMA Crossover',
        description: 'Golden Cross / Death Cross using Simple Moving Averages',
        params: [
            { key: 'shortPeriod', label: 'Short Period', default: 9 },
            { key: 'longPeriod', label: 'Long Period', default: 21 },
        ]
    },
    // Future strategies can be added here
];
export interface MarketMover extends Symbol {
    price: number;
    changePercent: number;
    sparkline?: number[];
}

export const useMarketStore = defineStore("market", () => {
    const logger = createLogger('MarketStore');
    const symbols = ref<Symbol[]>([]);
    const movers = ref<{ gainers: MarketMover[]; losers: MarketMover[]; trending: MarketMover[] }>({
        gainers: [],
        losers: [],
        trending: []
    });
    
    const selectedSymbol = useLocalStorage<string>("selected_symbol", "AAPL");
    const selectedStrategy = useLocalStorage<string>("selected_strategy", "SMA_CROSSOVER");
    
    const loading = ref(false);
    const syncing = ref(false);
    const analyzing = ref(false);
    
    const ohlcvData = ref<OHLCV[]>([]);
    const signals = ref<Signal[]>([]);
    const lastAnalysisTicker = ref<string | null>(null);
    const selectedSymbolData = ref<Symbol | null>(null);
    const error = ref<string | null>(null);

    // Computed
    const currentStrategy = computed(() => 
        STRATEGIES.find(s => s.id === selectedStrategy.value) || STRATEGIES[0]
    );

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
        try {
            loading.value = true;
            logger.debug(`Fetching details for ${ticker}`);
            // Request enrichment (description, sector, etc) if missing
            const response = await api.get(`/market/symbols/${ticker}?enrich=true`);
            if (response.data.success) {
                selectedSymbolData.value = response.data.data;
            }
        } catch (e) {
            logger.error("Failed to fetch symbol details", e);
        } finally {
            loading.value = false;
        }
    }

    async function syncSymbol(ticker: string, type: 'STOCK' | 'CRYPTO' = 'STOCK') {
        try {
            logger.info("Syncing symbol:", ticker);
            syncing.value = true;
            error.value = null;
            const response = await api.post("/market/sync", { ticker, type });
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

    async function fetchHistory(ticker: string, interval = '1h', limit = 500, before?: string) {
        try {
            logger.debug(`Fetching history for ${ticker} (interval=${interval}, limit=${limit}, before=${before})`);
            
            // 1. Try Cache First
            let cachedData: any[] = [];
            try {
                const beforeTs = before ? new Date(before).getTime() : undefined;
                cachedData = await sqliteService.getOHLCV(ticker, interval, limit, beforeTs);
            } catch (err) {
                logger.warn('SQLite Cache Read Failed', err);
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
                         // We have enough history locally
                         const newData = cachedData;
                         ohlcvData.value = [...newData, ...ohlcvData.value];
                         return newData;
                     }
                 } else {
                     // Initial Load: Show Cache immediately
                     ohlcvData.value = cachedData;
                     loading.value = false; // Don't show loading spinner if we have cache
                 }
            } else {
                // If no cache and initial load, show loading
                if (!before) loading.value = true;
            }
            
            // 2. Network Fetch (SWR if cache exists)
            const networkPromise = (async () => {
                try {
                    error.value = null;
                    const response = await api.get(`/market/history/${ticker}`, {
                        params: { 
                            limit: String(limit),
                            interval: interval,
                            before: before
                        }
                    });
                    
                    if (response.data.success) {
                        const newData = response.data.data || [];
                        
                         // Save to Cache (Fire and Forget)
                        sqliteService.saveOHLCV(ticker, interval, newData).catch(e => logger.error('Cache Save Failed', e));

                        if (before) {
                            if (newData.length > 0) {
                                ohlcvData.value = [...newData, ...ohlcvData.value];
                            }
                            return newData;
                        } else {
                            // Replace data (Latest)
                            // CHECK FOR DUPLICATES/NO-CHANGE
                            // If length is same and last timestmap is same, skip update
                            const current = ohlcvData.value;
                            if (current.length > 0 && newData.length > 0 && 
                                current.length === newData.length && 
                                current[current.length-1].timestamp === newData[newData.length-1].timestamp &&
                                current[0].timestamp === newData[0].timestamp) {
                                logger.debug("Skipping update, data identical to cache");
                                return newData;
                            }

                            ohlcvData.value = newData;
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
                    if (!before && ohlcvData.value.length === 0) loading.value = false;
                    // If we had cache, loading was already false.
                }
            })();

            if (cachedData.length > 0 && !before) {
                // Return cache immediately, let network run in background
                networkPromise.catch(e => logger.warn("Background fetch failed", e)); 
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
            loading.value = false;
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
                ...params
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

    return {
        // State
        symbols,
        movers,
        selectedSymbol,
        selectedStrategy,
        loading,
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
        syncSymbol,
        fetchHistory,
        runAnalysis,
        selectSymbol,
        fetchSymbolDetails,
        selectStrategy,
        selectedSymbolData,
    };
});
