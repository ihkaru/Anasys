<template>
    <f7-sheet class="add-asset-sheet" :opened="opened" @sheet:closed="$emit('close')" swipe-to-close backdrop>
        <f7-toolbar>
            <div class="left"></div>
            <div class="right">
                <f7-link sheet-close>Close</f7-link>
            </div>
        </f7-toolbar>
        <f7-page-content>
            <f7-block-title large>Add Asset to Watchlist</f7-block-title>
            <f7-searchbar :custom-search="true" placeholder="Search ticker or name..." @searchbar:search="onSearch"
                :value="searchQuery" @input="onSearch(null, $event.target.value)"></f7-searchbar>
            <div v-if="loading" class="text-align-center padding">
                <f7-preloader />
            </div>
            <f7-list media-list v-else>
                <f7-list-item v-for="(asset, index) in searchResults" :key="(asset.ticker || 'unk') + (asset.source || '') + index"
                    :title="asset.ticker" :subtitle="asset.name" @click="$emit('add', asset)">
                    <template #after>
                        <span class="badge-row">
                            <span v-if="asset.exchange" class="badge exchange">{{ asset.exchange }}</span>
                            <span v-if="asset.source" class="badge source" :class="asset.source.toLowerCase()">
                                {{ asset.source === 'YAHOO' ? 'Y' : 'TV' }}
                            </span>
                        </span>
                    </template>
                    <template #media>
                        <AssetLogo :ticker="asset.ticker" :type="asset.type" :website="asset.website"
                            :icon-url="asset.iconUrl" size="small" />
                    </template>
                </f7-list-item>
            </f7-list>
        </f7-page-content>
    </f7-sheet>
</template>

<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { ref, watch } from "vue";
import { useMarketStore } from "../../../stores/market";
import AssetLogo from "./AssetLogo.vue";

interface Props {
	opened: boolean;
	watchlistId: number | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: "close"): void;
	(e: "add", asset: any): void;
}>();

const marketStore = useMarketStore();
const searchQuery = ref("");
const searchResults = ref<any[]>([]);
const loading = ref(false);

// Debounced search to backend
const debouncedSearch = useDebounceFn(async (query: string) => {
	if (!query || query.length < 2) {
		searchResults.value = [];
		loading.value = false;
		return;
	}

	loading.value = true;
	try {
		const results = await marketStore.searchSymbols(query, 20);

		// Map to simple display format — preserve fullSymbol for TV assets
		searchResults.value = results
			.filter((r: any) => r.symbol || r.ticker)
			.map((r: any) => ({
				ticker: r.symbol || r.ticker,
				name: r.name,
				type: r.type === "CRYPTOCURRENCY" ? "CRYPTO" : "STOCK",
				source: r.source,
				exchange: r.exchange,
				currency: r.currency,
				// For TradingView results, fullSymbol = "EXCHANGE:TICKER" (e.g. "NASDAQ:MU")
				// This is passed through so the API can use the exact exchange when fetching chart data
				fullSymbol: r.fullSymbol || null,
				iconUrl: undefined,
				website: undefined,
			}));
	} catch (e) {
		console.error("Search failed", e);
		searchResults.value = [];
	} finally {
		loading.value = false;
	}
}, 300);

function onSearch(_: any, query: string) {
	searchQuery.value = query;
	if (query && query.length >= 2) {
		loading.value = true;
		debouncedSearch(query);
	} else {
		searchResults.value = [];
	}
}

// Reset search when sheet opens
watch(
	() => props.opened,
	(isOpen) => {
		if (isOpen) {
			searchQuery.value = "";
			searchResults.value = [];
		}
	},
);
</script>

<style scoped>
.add-asset-sheet {
    height: 80%;
}

.badge-row {
    display: flex;
    gap: 4px;
    align-items: center;
}

.badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.1);
    color: var(--f7-text-color);
}

.badge.exchange {
    background: rgba(33, 150, 243, 0.1);
    color: #2196f3;
}

.badge.source.yahoo {
    background: rgba(103, 58, 183, 0.1);
    color: #673ab7;
}

.badge.source.tradingview {
    background: rgba(255, 152, 0, 0.1);
    color: #ff9800;
}
</style>
