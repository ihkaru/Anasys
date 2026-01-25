<template>
  <f7-page name="home">
    <f7-navbar title="Home" :sliding="false">
      <template #right>
        <f7-link icon-ios="f7:bell_fill" icon-md="material:notifications"></f7-link>
      </template>
    </f7-navbar>

    <!-- FAB to Add Asset -->
    <f7-fab position="right-bottom" style="margin-bottom: 10px;" @click="showAddAssetSheet">
      <f7-icon ios="f7:plus" md="material:add"></f7-icon>
    </f7-fab>

    <!-- User Greeting -->
    <f7-block class="greeting-block">
      <div class="greeting-content">
        <div class="avatar">
          <f7-icon ios="f7:person_circle_fill" md="material:account_circle" size="48" color="primary"></f7-icon>
        </div>
        <div class="greeting-text">
          <p class="greeting-hello">Good {{ timeOfDay }},</p>
          <h2 class="greeting-name">{{ auth.user?.name || 'Investor' }}!</h2>
        </div>
      </div>
    </f7-block>

    <!-- Market Summary Card -->
    <f7-block>
      <div class="market-summary-card">
        <div v-for="item in marketOverview" :key="item.ticker" class="market-item">
          <span class="market-label">{{ item.name || item.ticker }}</span>
          <span :class="['market-value', item.changePercent >= 0 ? 'positive' : 'negative']">
            {{ item.changePercent >= 0 ? '+' : '' }}{{ item.changePercent?.toFixed(2) || '0.00' }}%
          </span>
        </div>
        <!-- Fallback if no data -->
        <div v-if="marketOverview.length === 0" class="market-item">
          <span class="market-label">Loading...</span>
        </div>
      </div>
    </f7-block>

    <!-- Watchlist Section -->
    <f7-block-title class="section-title">
      <span>My Watchlists</span>
      <f7-link @click="showWatchlistActions" class="section-action">
        <f7-icon ios="f7:ellipsis_circle" md="material:more_horiz"></f7-icon>
      </f7-link>
    </f7-block-title>

    <!-- Watchlist Selector -->
    <f7-block class="watchlist-selector-block">
      <div class="watchlist-chips">
        <f7-chip v-for="wl in watchlists" :key="wl.id" :text="wl.name" :outline="selectedWatchlistId !== wl.id"
          :color="selectedWatchlistId === wl.id ? 'primary' : undefined" @click="selectWatchlist(wl.id)">
          <template #media v-if="wl.isDefault">
            <f7-icon ios="f7:star_fill" md="material:star" size="14"></f7-icon>
          </template>
        </f7-chip>
        <f7-chip text="+" outline @click="showCreateWatchlistDialog" class="add-chip"></f7-chip>
      </div>
    </f7-block>

    <!-- Watchlist Items -->
    <f7-list class="watchlist-items">
      <f7-list-item v-for="item in currentWatchlistItems" :key="item.ticker" :title="item.ticker" :footer="item.name"
        swipeout @click="openAssetDetail(item)" @contextmenu.prevent @touchstart.passive="startHold(item)"
        @touchend="endHold" @touchmove="cancelHold" @mousedown="startHold(item)" @mouseup="endHold"
        @mouseleave="cancelHold" :class="{ 'item-holding': holdingTicker === item.ticker }">
        <template #media>
          <div class="asset-icon-wrapper">
            <img v-if="getAssetLogoUrl(item)" :src="getAssetLogoUrl(item) || ''" :alt="item.ticker" class="asset-logo"
              @error="onLogoError($event, item.ticker)" />
            <div v-else class="asset-icon" :style="{ backgroundColor: getColorForTicker(item.ticker) }">
              {{ item.ticker.substring(0, 2) }}
            </div>
          </div>
        </template>
        <template #after>
          <div class="after-content">
            <div class="sparkline-wrapper">
              <SparklineChart :data="item.sparkline" :positive="item.changePercent >= 0" :width="60" :height="20" />
            </div>
            <div class="price-col">
              <span class="price-text">{{ formatPrice(item.price) }}</span>
              <span :class="['change-badge', item.changePercent >= 0 ? 'positive' : 'negative']">
                {{ item.changePercent >= 0 ? '+' : '' }}{{ item.changePercent.toFixed(2) }}%
              </span>
            </div>
          </div>
        </template>
        <f7-swipeout-actions right>
          <f7-swipeout-button delete confirm-text="Remove from watchlist?">
            <f7-icon ios="f7:trash" md="material:delete"></f7-icon>
          </f7-swipeout-button>
        </f7-swipeout-actions>
      </f7-list-item>

      <!-- Empty State -->
      <f7-list-item v-if="loaded && currentWatchlistItems.length === 0" class="empty-state">
        <template #title>
          <div class="empty-content">
            <f7-icon ios="f7:eye_slash" md="material:visibility_off" size="48" color="gray"></f7-icon>
            <p>No assets in this watchlist</p>
            <f7-button fill small @click="showAddAssetSheet">Add Asset</f7-button>
          </div>
        </template>
      </f7-list-item>
    </f7-list>

    <!-- Add Asset Sheet -->
    <f7-sheet class="add-asset-sheet" :opened="addAssetSheetOpen" @sheet:closed="addAssetSheetOpen = false"
      swipe-to-close backdrop>
      <f7-toolbar>
        <div class="left"></div>
        <div class="right">
          <f7-link sheet-close>Close</f7-link>
        </div>
      </f7-toolbar>
      <f7-page-content>
        <f7-block-title large>Add Asset to Watchlist</f7-block-title>
        <f7-searchbar :custom-search="true" placeholder="Search ticker or name..."
          @searchbar:search="onAssetSearch"></f7-searchbar>
        <f7-list media-list>
          <f7-list-item v-for="asset in filteredAssets" :key="asset.ticker" :title="asset.ticker" :subtitle="asset.name"
            :after="asset.type" @click="addAssetToWatchlist(asset)">
            <template #media>
              <div class="asset-icon small" :style="{ backgroundColor: getColorForTicker(asset.ticker) }">
                {{ asset.ticker.substring(0, 2) }}
              </div>
            </template>
          </f7-list-item>
        </f7-list>
      </f7-page-content>
    </f7-sheet>
  </f7-page>
</template>

<script setup lang="ts">
import { f7 } from 'framework7-vue';
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../../api/client';
import SparklineChart from '../../components/SparklineChart.vue';
import { useAuthStore } from '../../stores/auth';
import { useMarketStore } from '../../stores/market';
import { useWatchlistStore } from '../../stores/watchlist';
import { createLogger } from '../../utils/logger';

const auth = useAuthStore();
const marketStore = useMarketStore();
const watchlistStore = useWatchlistStore();
const logger = createLogger('HomePage');

const loaded = ref(false);

// Helper to generate random sparkline data (fallback when no real data)
function generateSparkline(positive: boolean): number[] {
  const points = 12;
  const data: number[] = [];
  let value = 100;
  for (let i = 0; i < points; i++) {
    value += (Math.random() - 0.5) * 10;
    data.push(value);
  }
  if (positive && data[data.length - 1] < data[0]) {
    data.reverse();
  } else if (!positive && data[data.length - 1] > data[0]) {
    data.reverse();
  }
  return data;
}

// Time of day greeting
const timeOfDay = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
});

// Market Overview
const marketOverview = ref<any[]>([]);

async function fetchMarketOverview() {
  try {
    const response = await api.get('/market/overview');
    if (response.data.success) {
      marketOverview.value = response.data.data;
    }
  } catch (e) {
    logger.warn('Could not fetch market overview', e);
    // Fallback to dummy data
    marketOverview.value = [
      { ticker: 'SPY', name: 'S&P 500', changePercent: 1.24 },
      { ticker: 'QQQ', name: 'NASDAQ', changePercent: 0.87 },
      { ticker: 'BTC-USD', name: 'BTC', changePercent: -2.15 },
    ];
  }
}

// Watchlists - from store
const watchlists = computed(() => watchlistStore.watchlists);
const selectedWatchlistId = ref<number | null>(null);

// Current watchlist items with mock price data
const currentWatchlistItems = computed(() => {
  if (!watchlistStore.currentWatchlist) return [];

  return watchlistStore.currentWatchlist.items.map(item => {
    // Generate deterministic mock price based on ticker
    const seed = item.ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const mockPrice = (seed % 500) + 10;
    const mockChange = ((seed % 200) - 100) / 10;

    return {
      ...item,
      price: mockPrice,
      changePercent: mockChange,
      sparkline: generateSparkline(mockChange >= 0),
    };
  });
});

// Watch for watchlist selection changes
watch(selectedWatchlistId, async (newId) => {
  if (newId) {
    await watchlistStore.fetchWatchlistWithItems(newId);
  }
});

// All Assets for search (from market store)
const allAssets = computed(() => marketStore.symbols);

const searchQuery = ref('');
const filteredAssets = computed(() => {
  const q = searchQuery.value.toLowerCase();
  if (!q) return allAssets.value.slice(0, 10);
  return allAssets.value.filter(a =>
    a.ticker.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q)
  );
});

const addAssetSheetOpen = ref(false);

async function selectWatchlist(id: number) {
  selectedWatchlistId.value = id;
}

function showWatchlistActions() {
  f7.dialog.create({
    title: 'Watchlist Actions',
    buttons: [
      { text: 'Create New Watchlist', onClick: showCreateWatchlistDialog },
      { text: 'Rename Current', onClick: showRenameWatchlistDialog },
      { text: 'Delete Current', color: 'red', onClick: confirmDeleteWatchlist },
      { text: 'Cancel', color: 'gray' },
    ],
    verticalButtons: true,
  }).open();
}

async function showCreateWatchlistDialog() {
  f7.dialog.prompt('Enter watchlist name:', 'New Watchlist', async (name) => {
    if (name.trim()) {
      try {
        const created = await watchlistStore.createWatchlist(name.trim());
        selectedWatchlistId.value = created.id;
        f7.toast.show({ text: `Created "${name}"`, closeTimeout: 2000 });
      } catch (e) {
        f7.toast.show({ text: 'Failed to create watchlist', closeTimeout: 2000 });
      }
    }
  });
}

async function showRenameWatchlistDialog() {
  const current = watchlists.value.find(w => w.id === selectedWatchlistId.value);
  if (!current) return;

  f7.dialog.prompt('Enter new name:', 'Rename Watchlist', async (name) => {
    if (name.trim()) {
      try {
        await watchlistStore.updateWatchlist(current.id, { name: name.trim() });
        f7.toast.show({ text: `Renamed to "${name}"`, closeTimeout: 2000 });
      } catch (e) {
        f7.toast.show({ text: 'Failed to rename', closeTimeout: 2000 });
      }
    }
  }, undefined, current.name);
}

async function confirmDeleteWatchlist() {
  const current = watchlists.value.find(w => w.id === selectedWatchlistId.value);
  if (!current) return;
  if (current.isDefault) {
    f7.dialog.alert('Cannot delete default watchlist');
    return;
  }

  f7.dialog.confirm(`Delete "${current.name}"?`, 'Delete Watchlist', async () => {
    try {
      await watchlistStore.deleteWatchlist(current.id);
      selectedWatchlistId.value = watchlistStore.defaultWatchlist?.id || null;
      f7.toast.show({ text: 'Watchlist deleted', closeTimeout: 2000 });
    } catch (e) {
      f7.toast.show({ text: 'Failed to delete', closeTimeout: 2000 });
    }
  });
}

function showAddAssetSheet() {
  searchQuery.value = '';
  addAssetSheetOpen.value = true;
}

function onAssetSearch(_: any, query: string) {
  searchQuery.value = query;
}

async function addAssetToWatchlist(asset: any) {
  if (!selectedWatchlistId.value) return;

  try {
    await watchlistStore.addSymbolToWatchlist(selectedWatchlistId.value, asset.ticker);
    addAssetSheetOpen.value = false;
    f7.toast.show({ text: `Added ${asset.ticker}`, closeTimeout: 2000 });
  } catch (e) {
    f7.toast.show({ text: (e as Error).message || 'Failed to add', closeTimeout: 2000 });
  }
}

function openAssetDetail(item: any) {
  logger.debug('Open asset detail:', item.ticker);
  f7.views.main.router.navigate('/chart/', { props: { ticker: item.ticker } });
}

function formatPrice(price: number): string {
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getColorForTicker(ticker: string): string {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Track failed logos to avoid infinite retry
const failedLogos = ref<Set<string>>(new Set());

function getAssetLogoUrl(item: any): string | null {
  // Skip if logo already failed
  if (failedLogos.value.has(item.ticker)) {
    return null;
  }

  // Use iconUrl from database if available
  if (item.iconUrl) {
    return item.iconUrl;
  }

  // For crypto, use CoinCap icons (reliable)
  if (item.type === 'CRYPTO' || item.ticker.includes('-USD')) {
    const baseSymbol = item.ticker.split('-')[0].toLowerCase();
    return `https://assets.coincap.io/assets/icons/${baseSymbol}@2x.png`;
  }

  // For stocks: Use Clearbit logo API with company website domain
  // Website comes from Yahoo Finance assetProfile, stored in our database
  if (item.website) {
    try {
      const url = new URL(item.website);
      const domain = url.hostname.replace('www.', '');
      return `https://logo.clearbit.com/${domain}`;
    } catch {
      // Invalid URL, skip
    }
  }

  // Fallback: no logo available
  return null;
}

function onLogoError(event: Event, ticker: string) {
  // Mark as failed and hide the image
  failedLogos.value.add(ticker);
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
}

function onItemHold(item: any) {
  if (!selectedWatchlistId.value) return;

  // Mobile long press or desktop right click
  f7.dialog.create({
    title: 'Remove Asset',
    text: `Remove ${item.ticker} from watchlist?`,
    buttons: [
      {
        text: 'Cancel',
        color: 'gray'
      },
      {
        text: 'Remove',
        color: 'red',
        onClick: async () => {
          try {
            if (selectedWatchlistId.value) {
              await watchlistStore.removeSymbolFromWatchlist(selectedWatchlistId.value, item.ticker);
              f7.toast.show({ text: `Removed ${item.ticker}`, closeTimeout: 2000 });
            }
          } catch (e) {
            f7.toast.show({ text: 'Failed to remove', closeTimeout: 2000 });
          }
        }
      }
    ]
  }).open();
}

onMounted(async () => {
  logger.debug('HomePage Mounted');

  // Fetch data in parallel
  await Promise.all([
    fetchMarketOverview(),
    marketStore.fetchSymbols(),
    watchlistStore.fetchWatchlists(),
  ]);

  // Select default watchlist
  if (watchlistStore.defaultWatchlist) {
    selectedWatchlistId.value = watchlistStore.defaultWatchlist.id;
  }

  loaded.value = true;
});

// -- Hold / Long Press Logic with Visual Feedback --
const holdingTicker = ref<string | null>(null);
let holdTimer: any = null;
const HOLD_DURATION = 600;

function startHold(item: any) {
  // Prevent interfering with swipeout if already swiped open?
  // Use a simple check or just proceed.
  holdingTicker.value = item.ticker;

  holdTimer = setTimeout(() => {
    onItemHold(item);
    holdingTicker.value = null; // Reset visual immediately after triggering
  }, HOLD_DURATION);
}

function cancelHold() {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
  holdingTicker.value = null;
}

// If they release before timer, it's just a click (handled by click listener)
// We just need to clear the timer/visual
function endHold() {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
  // Small delay to smooth out the "pop" back animation
  setTimeout(() => {
    holdingTicker.value = null;
  }, 100);
}
</script>

<style scoped>
/* Previous styles... */
.greeting-block {
  padding-top: 10px;
}

/* ... (keeping existing styles implicitly, just adding new ones) ... */
/* NOTE: In replace_file_content, I need to include the surrounding context or existing styles if I am replacing a block.
   Since I am replacing the end of script and start of style, I need to be careful.
   The tool works by replacing EXACT MATCHES.
   I will target the end of script and the style tag opening.
*/

.watchlist-items .item-content {
  transition: all 0.2s ease;
}

/* Visual Feedback Class */
.item-holding {
  transform: scale(0.97);
  background-color: var(--f7-list-bg-color);
  /* Ensure it has a bg to darken */
  filter: brightness(0.95);
  transition: all 0.2s ease-out;
}

.greeting-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.greeting-hello {
  margin: 0;
  font-size: 14px;
  color: var(--f7-text-color);
  opacity: 0.6;
}

.greeting-name {
  margin: 4px 0 0;
  font-size: 24px;
  font-weight: 700;
}

.market-summary-card {
  display: flex;
  justify-content: space-between;
  background: var(--f7-card-bg-color);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.market-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.market-label {
  font-size: 12px;
  color: var(--f7-text-color);
  opacity: 0.6;
}

.market-value {
  font-size: 16px;
  font-weight: 600;
  margin-top: 4px;
}

.market-value.positive {
  color: #10b981;
}

.market-value.negative {
  color: #ef4444;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-action {
  opacity: 0.6;
}

.watchlist-selector-block {
  padding-top: 0;
}

.watchlist-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.add-chip {
  opacity: 0.6;
}

.watchlist-items {
  margin-top: 0;
}


.asset-icon-wrapper {
  width: 44px;
  height: 44px;
  position: relative;
}

.asset-logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--f7-page-bg-color);
}

.asset-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 14px;
}

.asset-icon.small {
  width: 36px;
  height: 36px;
  font-size: 12px;
}

.sparkline-wrapper {
  display: flex;
  align-items: center;
  margin-left: auto;
  margin-right: 12px;
}

.change-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.change-badge.positive {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.change-badge.negative {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.after-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sparkline-wrapper {
  flex-shrink: 0;
}

.price-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.price-text {
  font-weight: 600;
  font-size: 14px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-content p {
  margin: 0;
  color: var(--f7-text-color);
  opacity: 0.6;
}

.add-asset-sheet {
  height: 80%;
}
</style>
