import { useAsyncState } from '@vueuse/core';
import { api } from '../api/client';

/**
 * Composable for Market Data Operations
 * Uses VueUse 'useAsyncState' to manage reactive state (loading, error, data) automatically.
 */
export function useMarket() {
    
    // Action: Sync Ticker
    const { 
        state: syncResult, 
        isLoading: isSyncing, 
        error: syncError, 
        execute: triggerSync
    } = useAsyncState(
        async (payload: { ticker: string, type: 'STOCK' | 'CRYPTO' }) => {
            // Using existing axios instance
            const response = await api.post('/market/sync', payload);
            if (response.data.success) {
                return response.data;
            } else {
                throw new Error(response.data.error || 'Sync failed');
            }
        },
        null, // Initial data
        { 
            immediate: false, 
            resetOnExecute: true 
        }
    );

    const syncTicker = async (ticker: string, type: 'STOCK' | 'CRYPTO') => {
        try {
            await triggerSync(0, { ticker, type }); // 0 is delay
        } catch (e) {
            // Error managed by 'syncError' reactive ref, but we can catch here for Toast/Alert
            throw e;
        }
    };

    return {
        syncResult,
        isSyncing,
        syncError,
        syncTicker
    };
}
