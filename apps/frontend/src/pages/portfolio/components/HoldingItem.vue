<template>
    <f7-list-item :footer="`${holding.shares} shares @ ${formatCurrency(holding.avgCost)}`" swipeout
        class="no-swipe-panel" :class="{ 'item-holding': isHolding }" @click="$emit('click', holding)"
        @contextmenu.prevent @touchstart.passive="startHold" @touchend="endHold" @touchmove="cancelHold"
        @mousedown="startHold" @mouseup="endHold" @mouseleave="cancelHold">
        <template #title>
            <div class="item-title-row">
                <span>{{ holding.ticker }}</span>
                <span v-if="holding.source" class="badge-source" :class="holding.source.toLowerCase()">
                    {{ holding.source === 'YAHOO' ? 'Y' : 'TV' }}
                </span>
            </div>
        </template>
        <template #media>
            <AssetLogo :ticker="holding.ticker" :icon-url="holding.iconUrl" :website="holding.website"
                :type="holding.type" size="medium" />
        </template>

        <template #after>
            <div class="after-content">
                <div class="sparkline-wrapper">
                    <SparklineChart v-if="holding.sparkline && holding.sparkline.length" :data="holding.sparkline"
                        :positive="holding.pnlPercent >= 0" :width="60" :height="20" />
                </div>
                <div class="price-col">
                    <span class="price-text">{{ formatCurrency(holding.currentValue) }}</span>
                    <span :class="['change-badge', holding.pnlPercent >= 0 ? 'positive' : 'negative']">
                        {{ formatPercent(holding.pnlPercent) }}
                    </span>
                </div>
            </div>
        </template>

        <f7-swipeout-actions right>
            <f7-swipeout-button @click="$emit('edit', holding)" color="blue">
                <f7-icon ios="f7:pencil" md="material:edit"></f7-icon>
            </f7-swipeout-button>
            <f7-swipeout-button delete confirm-text="Remove this holding?" @click="$emit('delete', holding)">
                <f7-icon ios="f7:trash" md="material:delete"></f7-icon>
            </f7-swipeout-button>
        </f7-swipeout-actions>
    </f7-list-item>
</template>

<script setup lang="ts">
import SparklineChart from "../../../components/SparklineChart.vue";
import { formatCurrency, formatPercent } from "../../../utils/formatters";
import AssetLogo from "../../home/components/AssetLogo.vue";
import { useLongPress } from "../../home/composables/useLongPress"; // Reusing from home, better to move to shared but this works for now

const props = defineProps<{
	holding: any; // Using any for now to avoid strict type dependency if Holding interface is in store
}>();

const emit = defineEmits<{
	(e: "click", holding: any): void;
	(e: "edit", holding: any): void;
	(e: "delete", holding: any): void;
	(e: "hold", holding: any): void;
}>();

const {
	isHolding,
	start: startHold,
	cancel: cancelHold,
	end: endHold,
} = useLongPress(() => emit("hold", props.holding), 600);
</script>

<style scoped>
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

.change-badge {
    padding: 4px 10px;
    border-radius: 20px;
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

.item-holding {
    transform: scale(0.97);
    background-color: var(--f7-list-bg-color);
    filter: brightness(0.95);
    transition: all 0.2s ease-out;
}

.item-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.badge-source {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.1);
    color: var(--f7-text-color);
    opacity: 0.7;
}

.badge-source.yahoo {
    background: rgba(103, 58, 183, 0.1);
    color: #673ab7;
}

.badge-source.tradingview {
    background: rgba(255, 152, 0, 0.1);
    color: #ff9800;
}
</style>
