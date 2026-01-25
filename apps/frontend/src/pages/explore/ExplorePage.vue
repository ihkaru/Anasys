<template>
  <div class="page-content explore-page-content">
    <f7-navbar title="Explore" :sliding="false">
      <template #right>
        <f7-link icon-ios="f7:slider_horizontal_3" icon-md="material:tune" @click="showFilters"></f7-link>
      </template>
    </f7-navbar>

    <!-- Search Bar -->
    <f7-searchbar :custom-search="true" placeholder="Search stocks, crypto, ETFs..." @searchbar:search="onSearch"
      @searchbar:clear="onSearchClear"></f7-searchbar>

    <div v-if="marketStore.loading" class="text-align-center padding">
      <f7-preloader />
    </div>

    <!-- Category Chips -->
    <f7-block class="category-chips-block">
      <div class="category-chips">
        <f7-chip v-for="cat in categories" :key="cat.slug" :text="cat.name"
          :outline="!selectedCategories.includes(cat.slug)"
          :color="selectedCategories.includes(cat.slug) ? 'primary' : undefined"
          @click="toggleCategory(cat.slug)"></f7-chip>
      </div>
    </f7-block>

    <!-- Trending Section -->
    <f7-block-title v-if="!searchQuery && !marketStore.loading">🔥 Trending Today</f7-block-title>
    <div v-if="!searchQuery && !marketStore.loading" class="trending-scroll">
      <div class="trending-cards">
        <div v-for="item in trendingAssets" :key="item.ticker" class="trending-card" @click="openAsset(item)">
          <div class="trending-icon-wrapper">
             <img v-if="getAssetLogoUrl(item)" :src="getAssetLogoUrl(item) || ''" :alt="item.ticker" class="trending-logo"
              @error="onLogoError($event, item.ticker)" />
            <div v-else class="trending-icon" :style="{ backgroundColor: getColorForTicker(item.ticker) }">
              {{ item.ticker.substring(0, 2) }}
            </div>
          </div>
          <SparklineChart :data="item.sparkline || []" :positive="isSparklinePositive(item.sparkline)" :width="76"
            :height="24" />
          <div class="trending-info">
            <span class="trending-ticker">{{ item.ticker }}</span>
            <span :class="['trending-change', item.changePercent >= 0 ? 'positive' : 'negative']">
              {{ item.changePercent >= 0 ? '+' : '' }}{{ item.changePercent.toFixed(2) }}%
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Lists -->
    <template v-if="!searchQuery && !marketStore.loading">
        <f7-block-title>📈 Top Gainers</f7-block-title>
        <f7-list class="asset-list">
        <f7-list-item v-for="item in topGainers" :key="item.ticker" :title="item.ticker" :footer="item.name"
            @click="openAsset(item)">
            <template #media>
            <div class="asset-icon-wrapper">
                <img v-if="getAssetLogoUrl(item)" :src="getAssetLogoUrl(item) || ''" :alt="item.ticker" class="asset-logo"
                @error="onLogoError($event, item.ticker)" />
                <div v-else class="asset-icon" :style="{ backgroundColor: getColorForTicker(item.ticker) }">{{
                item.ticker.substring(0, 2) }}</div>
            </div>
            </template>
            <template #after>
            <div class="after-content">
                <div class="sparkline-wrapper">
                <SparklineChart :data="item.sparkline || []" :positive="isSparklinePositive(item.sparkline)" :width="60"
                    :height="20" />
                </div>
                <div class="price-col">
                <span class="price-text">{{ formatPrice(item.price) }}</span>
                <span class="change-badge positive">+{{ item.changePercent.toFixed(2) }}%</span>
                </div>
            </div>
            </template>
        </f7-list-item>
        </f7-list>

        <f7-block-title>📉 Top Losers</f7-block-title>
        <f7-list class="asset-list">
        <f7-list-item v-for="item in topLosers" :key="item.ticker" :title="item.ticker" :footer="item.name"
            @click="openAsset(item)">
            <template #media>
            <div class="asset-icon-wrapper">
                <img v-if="getAssetLogoUrl(item)" :src="getAssetLogoUrl(item) || ''" :alt="item.ticker" class="asset-logo"
                @error="onLogoError($event, item.ticker)" />
                <div v-else class="asset-icon" :style="{ backgroundColor: getColorForTicker(item.ticker) }">{{
                item.ticker.substring(0, 2) }}</div>
            </div>
            </template>
            <template #after>
            <div class="after-content">
                <div class="sparkline-wrapper">
                <SparklineChart :data="item.sparkline || []" :positive="isSparklinePositive(item.sparkline)" :width="60"
                    :height="20" />
                </div>
                <div class="price-col">
                <span class="price-text">{{ formatPrice(item.price) }}</span>
                <span class="change-badge negative">{{ item.changePercent.toFixed(2) }}%</span>
                </div>
            </div>
            </template>
        </f7-list-item>
        </f7-list>
    </template>

    <!-- Search Results -->
    <f7-block-title v-if="searchQuery">Search Results</f7-block-title>
    <f7-list media-list v-if="searchQuery" class="asset-list">
      <f7-list-item v-for="item in searchResults" :key="item.ticker" :title="item.ticker" :subtitle="item.name"
        @click="openAsset(item)">
        <template #media>
          <div class="asset-icon-wrapper">
            <img v-if="getAssetLogoUrl(item)" :src="getAssetLogoUrl(item) || ''" :alt="item.ticker" class="asset-logo"
              @error="onLogoError($event, item.ticker)" />
            <div v-else class="asset-icon" :style="{ backgroundColor: getColorForTicker(item.ticker) }">{{
              item.ticker.substring(0, 2) }}</div>
          </div>
        </template>
        <template #after>
          <div class="after-content">
            <div class="price-col">
              <span class="price-text">{{ formatPrice(item.price) }}</span>
            </div>
          </div>
        </template>
      </f7-list-item>
      
       <f7-list-item v-if="searchResults.length === 0" class="no-results">
        <template #title>
           <div class="no-results-content">
             <f7-icon ios="f7:search" md="material:search" size="48" color="gray"></f7-icon>
             <p>No results for "{{ searchQuery }}"</p>
           </div>
        </template>
      </f7-list-item>
    </f7-list>

    <!-- Filter Sheet -->
    <f7-sheet class="filter-sheet" :opened="filterSheetOpened" @sheet:closed="filterSheetOpened = false">
      <f7-toolbar>
        <div class="left"></div>
        <div class="right">
          <f7-link sheet-close>Done</f7-link>
        </div>
      </f7-toolbar>
      <f7-page-content>
        <f7-block-title>Asset Type</f7-block-title>
        <f7-list>
          <f7-list-item checkbox title="All" :checked="selectedCategories.length === 0" @change="selectedCategories = []"></f7-list-item>
          <f7-list-item checkbox title="Stocks" :checked="selectedCategories.includes('STOCK')" @change="toggleCategory('STOCK')"></f7-list-item>
          <f7-list-item checkbox title="Crypto" :checked="selectedCategories.includes('CRYPTO')" @change="toggleCategory('CRYPTO')"></f7-list-item>
        </f7-list>
      </f7-page-content>
    </f7-sheet>
  </div>
</template>

<script setup lang="ts">
import { f7 } from 'framework7-vue';
import { computed, onMounted, ref } from 'vue';
import SparklineChart from '../../components/SparklineChart.vue';
import { useMarketStore } from '../../stores/market';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ExplorePage');
const marketStore = useMarketStore();
const filterSheetOpened = ref(false);

onMounted(async () => {
  await Promise.all([
    marketStore.fetchSymbols(),
    marketStore.fetchMovers()
  ]);
});

// Categories
const categories = ref([
  { name: 'Stocks', slug: 'STOCK' },
  { name: 'Crypto', slug: 'CRYPTO' },
]);

const selectedCategories = ref<string[]>([]);

// Real data from store
const trendingAssets = computed(() => marketStore.movers.trending);
const topGainers = computed(() => marketStore.movers.gainers);
const topLosers = computed(() => marketStore.movers.losers);

const searchQuery = ref('');

// For search, we combine symbol list with price data if available from movers
const allAssets = computed(() => {
  return marketStore.symbols.map(s => {
    // Check if we have price info in movers cache
    const mover = [...marketStore.movers.trending, ...marketStore.movers.gainers, ...marketStore.movers.losers]
      .find(m => m.ticker === s.ticker);

    return {
      ticker: s.ticker,
      name: s.name || s.ticker,
      type: s.type,
      price: mover?.price || 0,
      changePercent: mover?.changePercent || 0,
      categories: [s.type],
      sparkline: mover?.sparkline || [],
      website: s.website,
      iconUrl: s.iconUrl,
    };
  });
});

const searchResults = computed(() => {
  const q = searchQuery.value.toLowerCase();
  if (!q) return [];
  return allAssets.value.filter(a =>
    a.ticker.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
  );
});

const filteredByCategory = computed(() => {
  if (selectedCategories.value.length === 0) return [];
  return allAssets.value.filter(a =>
    a.categories.some(c => selectedCategories.value.includes(c))
  );
});

function toggleCategory(slug: string) {
  const idx = selectedCategories.value.indexOf(slug);
  if (idx >= 0) {
    selectedCategories.value.splice(idx, 1);
  } else {
    selectedCategories.value.push(slug);
  }
}

function getCategoryTitle(): string {
  const names = selectedCategories.value.map(s =>
    categories.value.find(c => c.slug === s)?.name || s
  );
  return names.join(', ');
}

function onSearch(_: any, query: string) {
  searchQuery.value = query;
}

function onSearchClear() {
  searchQuery.value = '';
}

function showFilters() {
  filterSheetOpened.value = true;
}

function openAsset(item: any) {
  logger.debug('Open asset:', item.ticker);
  marketStore.selectSymbol(item.ticker);
  f7.views.main.router.navigate('/chart/', { props: { ticker: item.ticker } });
}

function addToWatchlist(item: any) {
  f7.toast.show({ text: `Added ${item.ticker} to watchlist`, closeTimeout: 2000 });
}

function formatPrice(price: number): string {
  if (price < 1) return '$' + price.toFixed(4);
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

function isSparklinePositive(data: number[] | undefined): boolean {
  if (!data || data.length < 2) return true; // Default to green or impartial
  return data[data.length - 1] >= data[0];
}

// Track failed logos to avoid infinite retry
const failedLogos = ref<Set<string>>(new Set());

function getAssetLogoUrl(item: any): string | null {
  if (failedLogos.value.has(item.ticker)) {
    return null;
  }

  if (item.iconUrl) {
    return item.iconUrl;
  }

  // For crypto, use CoinCap icons
  if (item.type === 'CRYPTO' || item.ticker.includes('-USD')) {
    const baseSymbol = item.ticker.split('-')[0].toLowerCase();
    return `https://assets.coincap.io/assets/icons/${baseSymbol}@2x.png`;
  }

  // For stocks, use Clearbit if website available
  if (item.website) {
    try {
      const url = new URL(item.website);
      const domain = url.hostname.replace('www.', '');
      return `https://logo.clearbit.com/${domain}`;
    } catch {
      // Invalid URL
    }
  }

  return null;
}

function onLogoError(event: Event, ticker: string) {
  failedLogos.value.add(ticker);
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
}
</script>

<style scoped>
.category-chips-block {
  padding-top: 8px;
  padding-bottom: 0;
}

.category-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.trending-scroll {
  overflow-x: auto;
  padding: 0 16px 16px;
  -webkit-overflow-scrolling: touch;
}

.trending-cards {
  display: flex;
  gap: 12px;
}

.trending-card {
  flex-shrink: 0;
  width: 100px;
  background: var(--f7-card-bg-color);
  border-radius: 12px;
  padding: 12px;
  text-align: center;
  cursor: pointer;
  transition: transform 0.1s;
}

.trending-card:active {
  transform: scale(0.97);
}

.trending-icon-wrapper {
  width: 40px;
  height: 40px;
  margin: 0 auto 6px;
  position: relative;
}

.trending-logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--f7-page-bg-color);
}

.trending-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 14px;
}

.trending-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
}

.trending-ticker {
  font-weight: 600;
  font-size: 13px;
}

.trending-change {
  font-size: 11px;
  font-weight: 600;
}

.trending-change.positive {
  color: #10b981;
}

.trending-change.negative {
  color: #ef4444;
}

.asset-list {
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

.after-content {
  display: flex;
  align-items: center;
  gap: 12px;
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

.change-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
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

.add-watchlist-btn {
  padding: 8px;
  margin-right: 8px;
}

.no-results {
  text-align: center;
  padding: 40px 20px;
}

.no-results-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.no-results-content p {
  margin: 0;
  opacity: 0.6;
}
</style>
