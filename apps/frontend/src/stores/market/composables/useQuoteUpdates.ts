import { type Ref, triggerRef } from "vue";
import { sqliteService } from "../../../services/sqlite";
import type { Logger } from "../../../utils/logger";
import { marketApi } from "../api/marketApi";
import type { MarketMover } from "../market.types";

export function useQuoteUpdates(
	logger: Logger,
	quotes: Ref<Map<string, MarketMover>>,
	quotesVersion: Ref<number>,
	selectedSource: Ref<string>,
) {
	// DEBOUNCED triggerRef to prevent blocking on every quote update
	let triggerTimeout: ReturnType<typeof setTimeout> | null = null;
	function debouncedTrigger() {
		if (triggerTimeout) return; // Already scheduled
		triggerTimeout = setTimeout(() => {
			triggerRef(quotes);
			triggerTimeout = null;
		}, 100); // Batch updates every 100ms
	}

	function updateQuote(key: string, update: Partial<MarketMover>) {
		const existing = quotes.value.get(key);
		if (existing) {
			quotes.value.set(key, { ...existing, ...update });
		} else {
			quotes.value.set(key, update as MarketMover);
		}
		quotesVersion.value++;
		// FIXED: Use debounced trigger instead of immediate triggerRef
		// This prevents 367ms blocking from Vue reactivity cascade
		debouncedTrigger();
	}

	async function fetchQuote(ticker: string) {
		try {
			const cacheKey = `quote_${selectedSource.value}`;
			const cached = await sqliteService.getSymbolCache(ticker, cacheKey, 1);
			if (cached) return cached;

			logger.debug(`Fetching quote for ${ticker} (source=${selectedSource.value})`);
			const response = await marketApi.fetchQuote(ticker, selectedSource.value);

			if (response.data.success) {
				await sqliteService.saveSymbolCache(ticker, cacheKey, response.data.data);
				return response.data.data;
			}
			return null;
		} catch (e) {
			logger.error(`Failed to fetch quote for ${ticker}`, e);
			return null;
		}
	}

	return {
		updateQuote,
		fetchQuote,
	};
}
