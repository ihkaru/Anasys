<template>
    <f7-block class="watchlist-selector-block">
        <div class="watchlist-chips">
            <f7-chip v-for="wl in watchlists" :key="wl.id" :text="wl.name" :outline="selectedId !== wl.id"
                :color="selectedId === wl.id ? 'primary' : undefined" @click="$emit('select', wl.id)">
                <template #media v-if="wl.isDefault">
                    <f7-icon ios="f7:star_fill" md="material:star" size="14"></f7-icon>
                </template>
            </f7-chip>
            <f7-chip text="+" outline @click="$emit('create')" class="add-chip"></f7-chip>
        </div>
    </f7-block>
</template>

<script setup lang="ts">
interface Watchlist {
    id: number;
    name: string;
    isDefault?: boolean;
}

interface Props {
    watchlists: Watchlist[];
    selectedId: number | null;
}

defineProps<Props>();

defineEmits<{
    (e: 'select', id: number): void;
    (e: 'create'): void;
}>();
</script>

<style scoped>
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
</style>
