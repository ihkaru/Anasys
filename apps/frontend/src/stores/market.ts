import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
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
    
    const quotes = ref<Map<string, MarketMover>>(new Map());
    
    const selectedSymbol = useLocalStorage<string>("selected_symbol", "AAPL");
    const selectedStrategy = useLocalStorage<string>("selected_strategy", "SMA_CROSSOVER");
    
    const loading = ref(false);
    const syncing = ref(false);
    const analyzing = ref(false);
    
    const ohlcvData = shallowRef<OHLCV[]>([]);
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

    async function fetchOverview(tickers: string[]): Promise<any[]> {
        try {
            logger.debug(`Fetching overview for ${tickers.map(t => t).join(',')}`);
            if (tickers.length === 0) return [];
            const response = await api.post("/market/overview", { tickers });
            if (response.data.success) {
                 const newQuotes = response.data.data || [];
                 newQuotes.forEach((q: any) => {
                     quotes.value.set(q.ticker, q);
                 });
                 return newQuotes;
            }
            return [];
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
            const cached = await sqliteService.getSymbolCache(ticker, 'symbol_details', 24 * 60);
            if (cached) {
                logger.debug(`[${ticker}] Symbol details from cache (${Date.now() - startTime}ms)`);
                selectedSymbolData.value = cached;
                loading.value = false;
                
                // Background refresh if needed (non-blocking)
                api.get(`/market/symbols/${ticker}?enrich=true`).then(response => {
                    if (response.data.success) {
                        selectedSymbolData.value = response.data.data;
                        sqliteService.saveSymbolCache(ticker, 'symbol_details', response.data.data);
                    }
                }).catch(() => {}); // Ignore background refresh errors
                
                return;
            }
            
            logger.debug(`[${ticker}] Fetching symbol details from API...`);
            const response = await api.get(`/market/symbols/${ticker}?enrich=true`);
            if (response.data.success) {
                selectedSymbolData.value = response.data.data;
                // Save to cache
                await sqliteService.saveSymbolCache(ticker, 'symbol_details', response.data.data);
                logger.debug(`[${ticker}] Symbol details fetched & cached (${Date.now() - startTime}ms)`);
            }
        } catch (e) {
            logger.error(`[${ticker}] Failed to fetch symbol details (${Date.now() - startTime}ms)`, e);
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
                         const currentOldest = ohlcvData.value[0]?.timestamp || Infinity;
                         const currentOldestTime = new Date(currentOldest).getTime();
                         
                         // Debug overlaps
                         const firstNew = cachedData[0];
                         const lastNew = cachedData[cachedData.length - 1];
                         
                         // Filter data to ensure we only prepend strictly older data
                         const newData = cachedData.filter(d => new Date(d.timestamp).getTime() < currentOldestTime);
                         
                         if (newData.length === 0) {
                             logger.debug(`[MarketStore] Cache overlap. Oldest: ${currentOldest}, New Range: ${firstNew?.timestamp} - ${lastNew?.timestamp}`);
                             return [];
                         }

                         console.time('OHLCV_Append_Cache');
                         console.log(`[MarketStore] Appending ${newData.length} candles from cache. Range: ${newData[0].timestamp} - ${newData[newData.length-1].timestamp} < ${currentOldest}`);
                         ohlcvData.value = [...newData, ...ohlcvData.value];
                         console.timeEnd('OHLCV_Append_Cache');
                         return newData;
                    }

                } else {
                    // Initial Load: Show Cache immediately
                    const current = ohlcvData.value;
                    // If we already have data and this is strictly a replace (not append), careful.
                    // But usually !before means initial load.
                    
                    console.time('OHLCV_Set_Cache');
                    ohlcvData.value = cachedData;
                    console.timeEnd('OHLCV_Set_Cache');
                     console.log(`[MarketStore] Set ${cachedData.length} candles from cache`);
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
                                const currentOldest = ohlcvData.value[0]?.timestamp || Infinity;
                                const uniqueData = newData.filter((d: any) => new Date(d.timestamp).getTime() < new Date(currentOldest).getTime());
                                
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
                            if (current.length > 0 && newData.length > 0 && 
                                current.length === newData.length && 
                                current[current.length-1].timestamp === newData[newData.length-1].timestamp &&
                                current[0].timestamp === newData[0].timestamp) {
                                return newData;
                            }

                            // Smart Merge: Preserve history if we have loaded older data while waiting for network
                            if (current.length > 0 && newData.length > 0) {
                                const newStartTs = new Date(newData[0].timestamp).getTime();
                                // Keep timestamps strictly older than the new batch start
                                const olderData = current.filter(d => new Date(d.timestamp).getTime() < newStartTs);
                                
                                if (olderData.length > 0) {
                                    logger.debug(`[MarketStore] Merging network data. Preserving ${olderData.length} historical candles.`);
                                    console.time('OHLCV_Merge_Network');
                                    ohlcvData.value = [...olderData, ...newData];
                                    console.timeEnd('OHLCV_Merge_Network');
                                    return ohlcvData.value;
                                }
                            }

                            console.time('OHLCV_Set_Network');
                            ohlcvData.value = newData;
                            console.timeEnd('OHLCV_Set_Network');
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

    // ===== NEW: Search, Trending, Recommendations =====
    
    async function searchSymbols(query: string, limit: number = 15) {
        try {
            logger.debug(`Searching symbols: ${query}`);
            const response = await api.get("/market/search", { 
                params: { q: query, limit: String(limit) } 
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

    async function fetchTrending(region: string = 'US', count: number = 10) {
        try {
            logger.debug(`Fetching trending symbols for ${region}`);
            const response = await api.get("/market/trending", { 
                params: { region, count: String(count) } 
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
            const cached = await sqliteService.getSymbolCache(ticker, 'financials', 24 * 60);
            if (cached) {
                logger.debug(`Loaded financials for ${ticker} from SQLite`);
                return cached;
            }

            logger.debug(`Fetching financials for ${ticker} from API`);
            const response = await api.get(`/market/financials/${ticker}`);
            if (response.data.success) {
                // Save to SQLite
                await sqliteService.saveSymbolCache(ticker, 'financials', response.data.data);
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
            const cached = await sqliteService.getSymbolCache(ticker, 'earnings', 24 * 60);
            if (cached) return cached;

            logger.debug(`Fetching earnings for ${ticker}`);
            const response = await api.get(`/market/earnings/${ticker}`);
            if (response.data.success) {
                await sqliteService.saveSymbolCache(ticker, 'earnings', response.data.data);
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
            const cached = await sqliteService.getSymbolCache(ticker, 'analyst', 7 * 24 * 60);
            if (cached) return cached;

            logger.debug(`Fetching analyst ratings for ${ticker}`);
            const response = await api.get(`/market/analyst/${ticker}`);
            if (response.data.success) {
                await sqliteService.saveSymbolCache(ticker, 'analyst', response.data.data);
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
             // Short Cache for Quote (5 mins) to allow quick switching
            const cached = await sqliteService.getSymbolCache(ticker, 'quote', 5);
            if (cached) return cached;

            logger.debug(`Fetching quote for ${ticker}`);
            const response = await api.get(`/market/quote/${ticker}`);
            if (response.data.success) {
                await sqliteService.saveSymbolCache(ticker, 'quote', response.data.data);
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
            const cached = await sqliteService.getSymbolCache(ticker, 'recommendations', 24 * 60);
            if (cached && Array.isArray(cached) && cached.length > 0) return cached;
        } catch (e) {
            // Ignore cache errors
        }

        try {
            const response = await api.get(`/market/recommendations/${ticker}`);
            if (response.data.success) {
                const recs = response.data.data || [];
                // Backend already returns full quote objects, just cache and return
                if (recs.length > 0) {
                    await sqliteService.saveSymbolCache(ticker, 'recommendations', recs);
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
        // State
        symbols,
        movers,
        quotes,
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
        fetchOverview,
        fetchTrending,
        searchSymbols,
        fetchRecommendations,
        syncSymbol,
        fetchHistory,
        runAnalysis,
        selectSymbol,
        fetchSymbolDetails,
        selectStrategy,
        selectedSymbolData,
        
        // NEW: Financial data actions
        fetchFinancials,
        fetchEarnings,
        fetchAnalyst,
        fetchQuote,
    };
});

