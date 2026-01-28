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
            <f7-list media-list>
                <f7-list-item v-for="asset in filteredAssets" :key="asset.ticker" :title="asset.ticker"
                    :subtitle="asset.name" :after="asset.type" @click="$emit('add', asset)">
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
import { watch } from 'vue';
import { useMarketStore } from '../../../stores/market';
import { useAssetSearch } from '../composables/useAssetSearch';
import AssetLogo from './AssetLogo.vue';

interface Props {
    opened: boolean;
    watchlistId: number | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'add', asset: any): void;
}>();

const marketStore = useMarketStore();
// Note: we need to pass a Ref to useAssetSearch. marketStore.symbols is a state but not a strict Ref in pinia unless storeToRefs is used or we define it as computed.
// However, marketStore.symbols is reactive.
import { storeToRefs } from 'pinia';
const { symbols } = storeToRefs(marketStore);

const { searchQuery, filteredAssets, onSearch, reset } = useAssetSearch(symbols);

// Reset search when sheet opens
watch(() => props.opened, (isOpen) => {
    if (isOpen) reset();
});

</script>

<style scoped>
.add-asset-sheet {
    height: 80%;
}
</style>
