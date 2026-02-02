<template>
  <div class="page-content explore-page-content">
    <f7-navbar title="Explore" :sliding="false">
      <template #right>
        <f7-link icon-ios="f7:slider_horizontal_3" icon-md="material:tune" @click="filterSheetOpened = true"></f7-link>
      </template>
    </f7-navbar>

    <!-- Search Bar -->
    <f7-searchbar :custom-search="true" placeholder="Search stocks, crypto..." @searchbar:search="onSearch"
      @searchbar:clear="onSearchClear" :value="searchQuery"></f7-searchbar>

    <div v-if="marketStore.loading && !searchQuery" class="text-align-center padding">
      <f7-preloader />
    </div>

    <!-- Category Chips -->
    <CategoryChips v-model:selected="selectedCategories" />

    <!-- Content: Trending or Search Results -->
    <template v-if="!searchQuery">
      <!-- Trending Section -->
      <f7-block-title v-if="!marketStore.loading">🔥 Trending Today</f7-block-title>
      <TrendingSection v-if="!marketStore.loading" :items="trendingAssets" @click="openAsset" />

      <!-- Lists: Gainers & Losers -->
      <template v-if="!marketStore.loading">
        <f7-block-title>📈 Top Gainers</f7-block-title>
        <AssetItemList :items="topGainers" @click="openAsset" />

        <f7-block-title>📉 Top Losers</f7-block-title>
        <AssetItemList :items="topLosers" @click="openAsset" />
      </template>
    </template>

    <template v-else>
      <f7-block-title>Search Results</f7-block-title>

      <div v-if="searchLoading" class="text-align-center padding">
        <f7-preloader />
        <p class="text-color-gray">Searching...</p>
      </div>

      <AssetItemList v-else :items="searchResults" :show-subtitle="true" :show-sparkline="false" :show-price="false"
        :empty-message="searchQuery.length < 2 ? 'Type at least 2 characters to search' : 'No assets found matching your search'"
        @click="openAsset" />
    </template>

    <!-- Filter Sheet -->
    <f7-sheet class="filter-sheet" :opened="filterSheetOpened" @sheet:closed="filterSheetOpened = false">
      <f7-toolbar>
        <div class="left">
          <f7-link @click="clearFilters">Reset</f7-link>
        </div>
        <div class="right">
          <f7-link sheet-close>Done</f7-link>
        </div>
      </f7-toolbar>
      <f7-page-content>
        <f7-block-title>Asset Type</f7-block-title>
        <f7-list>
          <f7-list-item checkbox title="All" :checked="selectedCategories.length === 0"
            @change="selectedCategories = []"></f7-list-item>
          <f7-list-item checkbox title="Stocks" :checked="selectedCategories.includes('STOCK')"
            @change="toggleCategory('STOCK')"></f7-list-item>
          <f7-list-item checkbox title="Crypto" :checked="selectedCategories.includes('CRYPTO')"
            @change="toggleCategory('CRYPTO')"></f7-list-item>
        </f7-list>
      </f7-page-content>
    </f7-sheet>

  </div>
</template>

<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { f7 } from "framework7-vue";
import { computed, onMounted, ref, watch } from "vue";
import { useMarketStore } from "../../stores/market";
import { createLogger } from "../../utils/logger";
import AssetItemList from "./components/AssetItemList.vue";
import CategoryChips from "./components/CategoryChips.vue";
import TrendingSection from "./components/TrendingSection.vue";
import { useExploreFilters } from "./composables/useExploreFilters";

const logger = createLogger("ExplorePage");
const marketStore = useMarketStore();

const { selectedCategories, searchQuery, filterSheetOpened, toggleCategory, clearFilters } = useExploreFilters();

// Search results from backend
const backendSearchResults = ref<any[]>([]);
const searchLoading = ref(false);

onMounted(async () => {
	// Fetch trending from Yahoo (fresh) and movers from DB
	await Promise.all([marketStore.fetchTrending("US", 8), marketStore.fetchMovers()]);
});

// Computed Data
const trendingAssets = computed(() => marketStore.movers.trending || []);
const topGainers = computed(() => marketStore.movers.gainers || []);
const topLosers = computed(() => marketStore.movers.losers || []);

// Debounced search to backend
const debouncedSearch = useDebounceFn(async (query: string) => {
	if (!query || query.length < 2) {
		backendSearchResults.value = [];
		searchLoading.value = false;
		return;
	}

	searchLoading.value = true;
	try {
		const results = await marketStore.searchSymbols(query, 20);
		// Map to our expected format
		backendSearchResults.value = results.map((r: any) => ({
			ticker: r.symbol || r.ticker,
			name: r.name,
			type: r.type === "CRYPTOCURRENCY" ? "CRYPTO" : "STOCK",
			price: 0, // Search doesn't return price
			changePercent: 0,
			sparkline: [],
			exchange: r.exchange,
			source: r.source,
			currency: r.currency,
		}));
	} catch (e) {
		logger.error("Search failed", e);
		backendSearchResults.value = [];
	} finally {
		searchLoading.value = false;
	}
}, 300);

// Watch search query and trigger backend search
watch(searchQuery, (newQuery) => {
	if (newQuery && newQuery.length >= 2) {
		searchLoading.value = true;
		debouncedSearch(newQuery);
	} else {
		backendSearchResults.value = [];
		searchLoading.value = false;
	}
});

const searchResults = computed(() => {
	// Filter by category if needed
	let results = backendSearchResults.value;
	if (selectedCategories.value.length > 0) {
		results = results.filter((a) => selectedCategories.value.includes(a.type));
	}
	return results;
});

// Logic
function onSearch(_: any, query: string) {
	searchQuery.value = query;
}

function onSearchClear() {
	searchQuery.value = "";
	backendSearchResults.value = [];
}

function openAsset(item: any) {
	logger.debug("Open asset:", item.ticker, item.source);
	marketStore.selectSymbol(item.ticker);
	if (item.source) {
		marketStore.selectSource(item.source);
	} else {
		marketStore.selectSource("YAHOO"); // Default
	}
	f7.views.main.router.navigate("/chart/", { props: { ticker: item.ticker } });
}
</script>

<style scoped>
.explore-page-content {
  background: var(--f7-page-bg-color);
}
</style>
