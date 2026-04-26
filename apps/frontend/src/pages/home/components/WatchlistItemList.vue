<template>
    <f7-list class="watchlist-items">
        <!-- Skeleton Loading State -->
        <template v-if="!loaded">
            <f7-list-item v-for="n in 3" :key="'skeleton-' + n" class="skeleton-item">
                <template #media>
                    <f7-skeleton-block style="width: 44px; height: 44px; border-radius: 50%;" effect="fade" />
                </template>
                <template #title>
                    <f7-skeleton-text effect="fade">Ticker Name</f7-skeleton-text>
                </template>
                <template #subtitle>
                    <f7-skeleton-text effect="fade">Company Name Here</f7-skeleton-text>
                </template>
                <template #after>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <f7-skeleton-text effect="fade">$0,000.00</f7-skeleton-text>
                        <f7-skeleton-text effect="fade">+0.00%</f7-skeleton-text>
                    </div>
                </template>
            </f7-list-item>
        </template>

        <!-- Actual Items -->
        <template v-else>
            <WatchlistItem v-for="item in items" :key="item.ticker + (item.source || '')" :item="item" :period="period"
                @click="$emit('item-click', item)" @remove="$emit('item-remove', item)"
                @hold="$emit('item-hold', item)" />

            <!-- Empty State -->
            <f7-list-item v-if="items.length === 0" class="empty-state">
                <template #title>
                    <div class="empty-content">
                        <f7-icon ios="f7:eye_slash" md="material:visibility_off" size="48" color="gray"></f7-icon>
                        <p>No assets in this watchlist</p>
                        <f7-button fill small @click="$emit('add-asset')">Add Asset</f7-button>
                    </div>
                </template>
            </f7-list-item>
        </template>
    </f7-list>
</template>

<script setup lang="ts">
import WatchlistItem from "./WatchlistItem.vue";

interface Props {
	items: any[];
	loaded: boolean;
	watchlistId: number | null;
	period?: string;
}

defineProps<Props>();

defineEmits<{
	(e: "item-click", item: any): void;
	(e: "item-remove", item: any): void;
	(e: "item-hold", item: any): void;
	(e: "add-asset"): void;
}>();
</script>

<style scoped>
.watchlist-items {
    margin-top: 0;
}

.watchlist-items :deep(.item-content) {
    transition: all 0.2s ease;
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
</style>
