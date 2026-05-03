<template>
	<f7-page name="home">
		<f7-navbar title="Home" :sliding="false">
			<template #right>
				<f7-link icon-ios="f7:bell_fill" icon-md="material:notifications"></f7-link>
			</template>
		</f7-navbar>

		<f7-fab position="right-bottom" @click="addAssetSheetOpen = true">
			<f7-icon ios="f7:plus" md="material:add"></f7-icon>
		</f7-fab>

		<UserGreeting :user-name="auth.user?.name" />

		<MarketSummaryCard />

		<DataLakeStatsCard :stats="marketStore.stats" @refresh="marketStore.fetchStats" />

		<f7-block-title class="section-title">
			<span>My Watchlists</span>
			<f7-link @click="watchlistActions.showWatchlistActions()">
				<f7-icon ios="f7:ellipsis_circle" md="material:more_horiz"></f7-icon>
			</f7-link>
		</f7-block-title>

		<WatchlistSelector :watchlists="watchlists" :selected-id="selectedWatchlistId" @select="selectWatchlist"
			@create="watchlistActions.showCreateDialog" />

		<div class="sticky-controls">
			<f7-segmented strong class="timeframe-selector">
				<f7-button small :active="sparklinePeriod === '24h'" @click="changePeriod('24h')">24H</f7-button>
				<f7-button small :active="sparklinePeriod === '7d'" @click="changePeriod('7d')">7D</f7-button>
				<f7-button small :active="sparklinePeriod === '30d'" @click="changePeriod('30d')">30D</f7-button>
			</f7-segmented>
		</div>

		<WatchlistItemList :items="currentWatchlistItems" :loaded="loaded" :watchlist-id="selectedWatchlistId"
			:period="sparklinePeriod" @item-click="openAssetDetail" @item-remove="handleRemoveAsset"
			@item-hold="onItemHold" @add-asset="addAssetSheetOpen = true" />

		<AddAssetSheet :opened="addAssetSheetOpen" :watchlist-id="selectedWatchlistId"
			@close="addAssetSheetOpen = false" @add="handleAddAsset" />
	</f7-page>
</template>

<script setup lang="ts">
import { f7 } from "framework7-vue";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { isConnected, subscribeQuotes } from "../../composables/useRealtimeQuotes";
import { useAuthStore } from "../../stores/auth";
import { useMarketStore } from "../../stores/market";
import { useWatchlistStore } from "../../stores/watchlist";
import { createLogger } from "../../utils/logger";
import AddAssetSheet from "./components/AddAssetSheet.vue";
import DataLakeStatsCard from "./components/DataLakeStatsCard.vue";
import MarketSummaryCard from "./components/MarketSummaryCard.vue";
import UserGreeting from "./components/UserGreeting.vue";
import WatchlistItemList from "./components/WatchlistItemList.vue";
import WatchlistSelector from "./components/WatchlistSelector.vue";

// Composables & Utils
import { useWatchlistActions } from "./composables/useWatchlistActions";
import { generateSparkline } from "./utils/assetFormatters";

const auth = useAuthStore();
const marketStore = useMarketStore();
const watchlistStore = useWatchlistStore();
const logger = createLogger("HomePage");

// ==================== Sparkline Cache ====================
// Cache sparklines by ticker:source to preserve array references
// This prevents SparklineChart from re-rendering when values haven't changed
const sparklineCache = new Map<string, number[]>();

// Utility: Compare two number arrays for equality
function arraysEqual(a: number[], b: number[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		// Use small epsilon for floating point comparison
		if (Math.abs(a[i] - b[i]) > 0.0001) return false;
	}
	return true;
}

const loaded = ref(false);
const addAssetSheetOpen = ref(false);
const selectedWatchlistId = ref<number | null>(null);
const sparklinePeriod = ref("7d");

// ==================== Real-Time Updates ====================

// Track unsubscribe functions
const unsubscribeFunctions: (() => void)[] = [];

// Handle real-time quote updates - source is passed from subscription context
function handleQuoteUpdate(
	update: { symbol: string; price: number; change: number; changePercent: number; volume?: number },
	source: string,
) {
	const key = `${update.symbol}:${source}`;

	const quotesMap = marketStore.quotes;
	const existing = quotesMap.get(key) || ({} as any);

	// Calculate period-aware change if we are in a specific timeframe context
	let change = update.change;
	let changePercent = update.changePercent;

	if (existing.period && existing.period !== "24h" && existing.period !== "1d" && existing.periodBasePrice) {
		// We are in a multi-day view (e.g. 7d, 30d).
		// Real-time update gives us current PRICE, but daily CHANGE.
		// We must recalculate change relative to the period baseline.
		if (existing.periodBasePrice > 0) {
			change = update.price - existing.periodBasePrice;
			changePercent = (change / existing.periodBasePrice) * 100;
		}
	}

	// Use store action to trigger reactivity
	marketStore.updateQuote(key, {
		ticker: update.symbol,
		price: update.price,
		change: change,
		changePercent: changePercent,
		volume: update.volume,
		source,
	});

	// // Visible console log for debugging
	// console.log(`%c[HomePage RT] 💰 ${update.symbol}: $${update.price} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`,
	// 	`color: ${changePercent >= 0 ? '#4CAF50' : '#F44336'}; font-weight: bold`);
}

// Subscribe to real-time updates when watchlist changes
watch(
	() => watchlistStore.currentWatchlist?.items,
	(items) => {
		// Cleanup previous subscriptions
		for (const unsub of unsubscribeFunctions) {
			unsub();
		}
		unsubscribeFunctions.length = 0;

		if (!items || items.length === 0) return;

		// Group items by source
		const bySource = new Map<string, string[]>();
		for (const item of items) {
			const source = item.source || "YAHOO";
			if (!bySource.has(source)) {
				bySource.set(source, []);
			}
			bySource.get(source)!.push(item.ticker);
		}

		// Subscribe per source
		for (const [source, symbols] of bySource) {
			/*
			console.log(
				`%c[HomePage] 📡 Subscribing ${symbols.length} symbols (source=${source}): ${symbols.join(", ")}`,
				"color: #2196F3",
			);
			*/
			// Wrap callback with closure to pass source
			const unsub = subscribeQuotes(symbols, (update) => handleQuoteUpdate(update, source), source);
			unsubscribeFunctions.push(unsub);
		}
	},
	{ immediate: true, deep: true },
);

// Cleanup on unmount
onUnmounted(() => {
	for (const unsub of unsubscribeFunctions) {
		unsub();
	}
});

// Log connection status
watch(isConnected, (connected) => {
	if (connected) {
		logger.info("[RT] WebSocket connected - real-time updates active");
	} else {
		logger.warn("[RT] WebSocket disconnected - falling back to polling");
	}
});

// ==================== Period Change ====================

function changePeriod(p: string) {
	if (sparklinePeriod.value === p) return;

	const start = performance.now();
	logger.info(`[Perf] changePeriod clicked: ${p}`);

	sparklinePeriod.value = p;

	if (watchlistStore.currentWatchlist?.items.length) {
		// Group items by source
		const bySource = new Map<string, string[]>();
		watchlistStore.currentWatchlist.items.forEach((item) => {
			const src = item.source || "YAHOO";
			if (!bySource.has(src)) bySource.set(src, []);
			bySource.get(src)!.push(item.ticker);
		});

		// Use batched fetch - SINGLE reactivity trigger for all sources
		marketStore.fetchOverviewBatched(bySource, sparklinePeriod.value).then(() => {
			const endDispatch = performance.now();
			logger.info(`[Perf] All cache/fetch dispatch done: ${Math.round(endDispatch - start)}ms`);

			nextTick(() => {
				const endRender = performance.now();
				logger.info(`[Perf] UI Updated (nextTick): ${Math.round(endRender - start)}ms`);
			});
		});
	}
}

const watchlists = computed(() => watchlistStore.watchlists);

const watchlistActions = useWatchlistActions(watchlistStore, selectedWatchlistId, watchlists);

// Current watchlist items with real price data
// Optimize movers lookup by creating a map once (O(N)) instead of searching array every item (O(N*M))
const allMoversMap = computed(() => {
	const map = new Map<string, any>();
	if (marketStore.movers) {
		const add = (list: any[]) => {
			list?.forEach((m) => {
				map.set(m.ticker, m);
			});
		};
		add(marketStore.movers.trending || []);
		add(marketStore.movers.gainers || []);
		add(marketStore.movers.losers || []);
	}
	return map;
});

// Current watchlist items with real price data
// Optimized: Extract reactive state access ONCE outside the loop to minimize reactivity overhead
const currentWatchlistItems = computed(() => {
	const watchlist = watchlistStore.currentWatchlist;
	if (!watchlist) return [];

	// Access version to create reactivity dependency when quotes update
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const _version = marketStore.quotesVersion;

	// console.log(`%c[HomePage] currentWatchlistItems RE-COMPUTING! quotesVersion=${_version}`, 'color: #2196F3; font-weight: bold');

	// Single reactive access - get the raw Map reference
	const quotesMap = marketStore.quotes;
	const moversMap = allMoversMap.value;

	// Now all Map.get() calls are plain JS operations, not reactive accesses
	return watchlist.items.map((item) => {
		const src = item.source || "YAHOO";
		const quoteKey = `${item.ticker}:${src}`;

		// Plain Map.get - no reactivity overhead per item
		let quote = quotesMap.get(quoteKey);
		if (!quote) {
			quote = moversMap.get(item.ticker);
		}

		// console.log(`%c[HomePage] Mapping ${item.ticker}: key=${quoteKey}, found=${!!quote}, price=${quote?.price || 'N/A'}`, 'color: #FF5722; font-weight: bold');

		if (quote) {
			// SPARKLINE LOGIC (Fixed: cache-first to prevent random regeneration)
			// 1. Check if quote has real sparkline data from backend
			const hasRealSparkline = quote.sparkline && quote.sparkline.length > 0;

			// 2. Check cache first
			const cachedSparkline = sparklineCache.get(quoteKey);

			let sparkline: number[];

			if (hasRealSparkline) {
				// Quote has real data from backend (sparkline is guaranteed to exist here)
				const realSparkline = quote.sparkline!;
				if (cachedSparkline && arraysEqual(cachedSparkline, realSparkline)) {
					// Real data matches cache - use cached reference
					sparkline = cachedSparkline;
				} else {
					// Real data is new/changed - update cache
					sparklineCache.set(quoteKey, [...realSparkline]);
					sparkline = sparklineCache.get(quoteKey)!;
				}
			} else {
				// No real sparkline from backend
				if (cachedSparkline) {
					// Use existing cached (even if generated) - DON'T regenerate!
					sparkline = cachedSparkline;
				} else {
					// No cache exists - generate once and cache
					const generated = generateSparkline(quote.changePercent >= 0);
					sparklineCache.set(quoteKey, generated);
					sparkline = sparklineCache.get(quoteKey)!;
				}
			}

			return {
				...item,
				price: quote.price,
				change: quote.change,
				changePercent: quote.changePercent,
				sparkline,
				marketState: quote.marketState,
				preMarketPrice: quote.preMarketPrice,
				preMarketChange: quote.preMarketChange,
				preMarketChangePercent: quote.preMarketChangePercent,
				postMarketPrice: quote.postMarketPrice,
				postMarketChange: quote.postMarketChange,
				postMarketChangePercent: quote.postMarketChangePercent,
			};
		}

		return {
			...item,
			sparkline: item.sparkline || [],
			price: item.price || 0,
			changePercent: item.changePercent || 0,
		};
	});
});

async function selectWatchlist(id: number) {
	selectedWatchlistId.value = id;
}

// Flag to prevent double fetch during initial load
const initialLoadComplete = ref(false);

watch(selectedWatchlistId, async (newId) => {
	// Skip during initial load - onMounted handles it
	if (!initialLoadComplete.value) return;

	if (newId) {
		await watchlistStore.fetchWatchlistWithItems(newId);
		// Fetch fresh prices for this watchlist, grouped by source
		if (watchlistStore.currentWatchlist?.items.length) {
			// Group items by source
			const bySource = new Map<string, string[]>();
			watchlistStore.currentWatchlist.items.forEach((item) => {
				const src = item.source || "YAHOO";
				if (!bySource.has(src)) bySource.set(src, []);
				bySource.get(src)!.push(item.ticker);
			});
			marketStore.fetchOverviewBatched(bySource, sparklinePeriod.value);
		}
	}
});

// Watch for items changes ONLY after initial load (for add/remove operations)
watch(
	() => watchlistStore.currentWatchlist?.items?.length,
	(newLen, oldLen) => {
		// Skip if same length (no add/remove) or during initial load
		if (!initialLoadComplete.value || newLen === oldLen) return;

		const items = watchlistStore.currentWatchlist?.items;
		if (items && items.length > 0) {
			const bySource = new Map<string, string[]>();
			items.forEach((item) => {
				const src = item.source || "YAHOO";
				if (!bySource.has(src)) bySource.set(src, []);
				bySource.get(src)!.push(item.ticker);
			});
			marketStore.fetchOverviewBatched(bySource, sparklinePeriod.value);
		}
	},
);

function openAssetDetail(item: any) {
	// Passing the whole item as symbolData prevents context loss (source, exchange, etc)
	marketStore.selectSymbol(item.ticker, item);
	f7.views.main.router.navigate("/chart/", { props: { ticker: item.ticker } });
}

async function handleAddAsset(asset: any) {
	try {
		let targetId = selectedWatchlistId.value;

		// If no watchlist exists (common after a reset), create a default one first
		if (!targetId) {
			logger.info("No active watchlist found. Creating default watchlist...");
			const newWatchlist = await watchlistStore.createWatchlist("My Assets", true);
			targetId = newWatchlist.id;
			selectedWatchlistId.value = targetId;
		}

		logger.info(`Adding ${asset.ticker} to watchlist ${targetId}`);
		await watchlistStore.addSymbolToWatchlist(targetId!, asset.ticker, asset.type, asset.source, asset.exchange);
		addAssetSheetOpen.value = false;
		f7.toast.show({ text: `Added ${asset.ticker}`, closeTimeout: 2000 });
	} catch (e) {
		logger.error("Failed to add asset", e);
		f7.toast.show({ text: (e as Error).message || "Failed to add", closeTimeout: 2000 });
	}
}

async function handleRemoveAsset(item: { ticker: string; source?: string }) {
	if (!selectedWatchlistId.value) return;
	try {
		await watchlistStore.removeSymbolFromWatchlist(selectedWatchlistId.value, item.ticker, item.source);
		f7.toast.show({ text: `Removed ${item.ticker}`, closeTimeout: 2000 });
	} catch (_e) {
		f7.toast.show({ text: "Failed to remove", closeTimeout: 2000 });
	}
}

function onItemHold(item: any) {
	if (!selectedWatchlistId.value) return;

	f7.dialog
		.create({
			title: "Remove Asset",
			text: `Remove ${item.ticker} from watchlist?`,
			buttons: [
				{ text: "Cancel", color: "gray" },
				{
					text: "Remove",
					color: "red",
					onClick: () => handleRemoveAsset(item),
				},
			],
		})
		.open();
}

onMounted(async () => {
	logger.debug("HomePage Mounted");

	// Fetch stats first as it's small and important for the dashboard
	marketStore.fetchStats();

	await Promise.all([
		marketStore.fetchSymbols(),
		marketStore.fetchMovers(), // Fetch movers for trending/summary
		watchlistStore.fetchWatchlists(),
	]);

	// Load default watchlist items BEFORE setting loaded=true
	if (watchlistStore.defaultWatchlist) {
		selectedWatchlistId.value = watchlistStore.defaultWatchlist.id;
		// Explicitly await items fetch (don't rely on watch for initial load)
		await watchlistStore.fetchWatchlistWithItems(watchlistStore.defaultWatchlist.id);
	}

	// Initial fetch for overview if we have a watchlist loaded
	if (selectedWatchlistId.value && watchlistStore.currentWatchlist) {
		const items = watchlistStore.currentWatchlist.items;
		if (items.length) {
			const bySource = new Map<string, string[]>();
			items.forEach((item) => {
				const src = item.source || "YAHOO";
				if (!bySource.has(src)) bySource.set(src, []);
				bySource.get(src)!.push(item.ticker);
			});
			marketStore.fetchOverviewBatched(bySource, sparklinePeriod.value);
		}
	}

	loaded.value = true;
	initialLoadComplete.value = true;
});
</script>

<style scoped>
.section-title {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.sticky-controls {
	position: sticky;
	top: 0;
	z-index: 100;
	padding: 8px 16px;
	background-color: var(--f7-page-bg-color);
	/* Add subtle shadow when scrolling */
	border-bottom: 1px solid var(--chart-border, rgba(0, 0, 0, 0.05));
}

.timeframe-selector {
	max-width: 400px;
	margin: 0 auto;
}
</style>
