<template>
    <f7-list class="watchlist-items">
        <WatchlistItem v-for="item in items" :key="item.ticker + (item.source || '')" :item="item" @click="$emit('item-click', item)"
            @remove="$emit('item-remove', item.ticker)" @hold="$emit('item-hold', item)" />

        <!-- Empty State -->
        <f7-list-item v-if="loaded && items.length === 0" class="empty-state">
            <template #title>
                <div class="empty-content">
                    <f7-icon ios="f7:eye_slash" md="material:visibility_off" size="48" color="gray"></f7-icon>
                    <p>No assets in this watchlist</p>
                    <f7-button fill small @click="$emit('add-asset')">Add Asset</f7-button>
                </div>
            </template>
        </f7-list-item>
    </f7-list>
</template>

<script setup lang="ts">
interface Props {
	items: any[];
	loaded: boolean;
	watchlistId: number | null;
}

defineProps<Props>();

defineEmits<{
	(e: "item-click", item: any): void;
	(e: "item-remove", ticker: string): void;
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
