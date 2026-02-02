<template>
    <div>
        <f7-block-title>Holdings</f7-block-title>

        <f7-list v-if="holdings.length > 0" media-list>
            <HoldingItem v-for="holding in holdings" :key="holding.id || holding.ticker" :holding="holding"
                @click="$emit('item-click', $event)" @edit="$emit('item-edit', $event)"
                @delete="$emit('item-delete', $event)" @hold="$emit('item-hold', $event)" />
        </f7-list>

        <!-- Empty State -->
        <f7-block v-else class="empty-state">
            <f7-icon ios="f7:cube_box" md="material:inventory_2" size="64" color="gray"></f7-icon>
            <h3>No Holdings Yet</h3>
            <p>Add your first investment to track your portfolio</p>
            <f7-button fill @click="$emit('add')">Add Holding</f7-button>
        </f7-block>
    </div>
</template>

<script setup lang="ts">
import HoldingItem from "./HoldingItem.vue";
defineProps<{
    holdings: any[];
}>();

defineEmits<{
    (e: "item-click", holding: any): void;
    (e: "item-edit", holding: any): void;
    (e: "item-delete", holding: any): void;
    (e: "item-hold", holding: any): void;
    (e: "add"): void;
}>();
</script>

<style scoped>
.empty-state {
    text-align: center;
    padding: 60px 20px;
}

.empty-state h3 {
    margin: 16px 0 8px;
}

.empty-state p {
    margin: 0 0 24px;
    opacity: 0.6;
}
</style>
