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
      @item-click="openAssetDetail" @item-remove="handleRemoveAsset" @item-hold="onItemHold"
      @add-asset="addAssetSheetOpen = true" />

    <AddAssetSheet :opened="addAssetSheetOpen" :watchlist-id="selectedWatchlistId" @close="addAssetSheetOpen = false"
      @add="handleAddAsset" />
  </f7-page>
</template>

<script setup lang="ts">
import { f7 } from 'framework7-vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useMarketStore } from '../../stores/market';
import { useWatchlistStore } from '../../stores/watchlist';
import { createLogger } from '../../utils/logger';

// Components
import AddAssetSheet from './components/AddAssetSheet.vue';
import MarketSummaryCard from './components/MarketSummaryCard.vue';
import UserGreeting from './components/UserGreeting.vue';
import WatchlistItemList from './components/WatchlistItemList.vue';
import WatchlistSelector from './components/WatchlistSelector.vue';

// Composables & Utils
import { useWatchlistActions } from './composables/useWatchlistActions';
import { generateSparkline } from './utils/assetFormatters';

const auth = useAuthStore();
const marketStore = useMarketStore();
const watchlistStore = useWatchlistStore();
const logger = createLogger('HomePage');

const loaded = ref(false);
const addAssetSheetOpen = ref(false);
const selectedWatchlistId = ref<number | null>(null);
const sparklinePeriod = ref('7d');

function changePeriod(p: string) {
  if (sparklinePeriod.value === p) return;
  sparklinePeriod.value = p;
  if (watchlistStore.currentWatchlist?.items.length) {
    const tickers = watchlistStore.currentWatchlist.items.map(i => i.ticker);
    marketStore.fetchOverview(tickers, sparklinePeriod.value);
  }
}

const watchlists = computed(() => watchlistStore.watchlists);

const watchlistActions = useWatchlistActions(watchlistStore, selectedWatchlistId, watchlists);

// Current watchlist items with real price data
const currentWatchlistItems = computed(() => {
  if (!watchlistStore.currentWatchlist) return [];

  return watchlistStore.currentWatchlist.items.map(item => {
    // Try to get price from market store quotes or movers
    const quote = marketStore.quotes.get(item.ticker) ||
      [...marketStore.movers.trending, ...marketStore.movers.gainers, ...marketStore.movers.losers]
        .find(m => m.ticker === item.ticker);

    if (quote) {
      return {
        ...item,
        price: quote.price,
        changePercent: quote.changePercent,
        sparkline: quote.sparkline && quote.sparkline.length > 0 ? quote.sparkline : generateSparkline(quote.changePercent >= 0),
      };
    }

    // Fallback if no data (yet)
    return {
      ...item,
      price: 0,
      changePercent: 0,
      sparkline: [],
    };
  });
});

async function selectWatchlist(id: number) {
  selectedWatchlistId.value = id;
}

watch(selectedWatchlistId, async (newId) => {
  if (newId) {
    await watchlistStore.fetchWatchlistWithItems(newId);
    // Fetch fresh prices for this watchlist
    if (watchlistStore.currentWatchlist?.items.length) {
      const tickers = watchlistStore.currentWatchlist.items.map(i => i.ticker);
      marketStore.fetchOverview(tickers, sparklinePeriod.value);
    }
  }
});

// Also watch for items changes to fetch new added items
watch(() => watchlistStore.currentWatchlist?.items, (newItems) => {
  if (newItems && newItems.length > 0) {
    const tickers = newItems.map(i => i.ticker);
    // optimization: filter out those we already have fresh quotes for? 
    // For now just fetch all to be safe and simple
    marketStore.fetchOverview(tickers, sparklinePeriod.value);
  }
}, { deep: true });

function openAssetDetail(item: any) {
  logger.debug('Open asset detail:', item.ticker);
  f7.views.main.router.navigate('/chart/', { props: { ticker: item.ticker } });
}

async function handleAddAsset(asset: any) {
  if (!selectedWatchlistId.value) return;

  try {
    await watchlistStore.addSymbolToWatchlist(selectedWatchlistId.value, asset.ticker);
    addAssetSheetOpen.value = false;
    f7.toast.show({ text: `Added ${asset.ticker}`, closeTimeout: 2000 });
    // Will trigger watch above
  } catch (e) {
    f7.toast.show({ text: (e as Error).message || 'Failed to add', closeTimeout: 2000 });
  }
}

async function handleRemoveAsset(ticker: string) {
  if (!selectedWatchlistId.value) return;
  try {
    await watchlistStore.removeSymbolFromWatchlist(selectedWatchlistId.value, ticker);
    f7.toast.show({ text: `Removed ${ticker}`, closeTimeout: 2000 });
  } catch (e) {
    f7.toast.show({ text: 'Failed to remove', closeTimeout: 2000 });
  }
}

function onItemHold(item: any) {
  if (!selectedWatchlistId.value) return;

  f7.dialog.create({
    title: 'Remove Asset',
    text: `Remove ${item.ticker} from watchlist?`,
    buttons: [
      { text: 'Cancel', color: 'gray' },
      {
        text: 'Remove',
        color: 'red',
        onClick: () => handleRemoveAsset(item.ticker)
      }
    ]
  }).open();
}

onMounted(async () => {
  logger.debug('HomePage Mounted');

  await Promise.all([
    marketStore.fetchSymbols(),
    marketStore.fetchMovers(), // Fetch movers for trending/summary
    watchlistStore.fetchWatchlists(),
  ]);

  if (watchlistStore.defaultWatchlist) {
    selectedWatchlistId.value = watchlistStore.defaultWatchlist.id;
  }

  // Initial fetch for overview if we have a watchlist loaded
  if (selectedWatchlistId.value && watchlistStore.currentWatchlist) {
    const tickers = watchlistStore.currentWatchlist.items.map(i => i.ticker);
    if (tickers.length) {
      marketStore.fetchOverview(tickers, sparklinePeriod.value);
    }
  }

  loaded.value = true;
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
  margin-left: -16px;
  margin-right: -16px;
  /* Add subtle shadow when scrolling */
  border-bottom: 1px solid rgba(0,0,0,0.05);
}

.timeframe-selector {
  max-width: 400px;
  margin: 0 auto;
}
</style>
