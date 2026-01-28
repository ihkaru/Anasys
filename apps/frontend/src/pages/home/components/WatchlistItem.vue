<template>
    <f7-list-item :title="item.ticker" :footer="item.name" swipeout @click="$emit('click', item)" @contextmenu.prevent
        @touchstart.passive="longPress.start(item)" @touchend="longPress.end" @touchmove="longPress.cancel"
        @mousedown="longPress.start(item)" @mouseup="longPress.end" @mouseleave="longPress.cancel"
        :class="{ 'item-holding': longPress.isHolding.value }">
        <template #media>
            <AssetLogo :ticker="item.ticker" :icon-url="item.iconUrl" :website="item.website" :type="item.type" />
        </template>
        <template #after>
            <div class="after-content">
                <div class="sparkline-wrapper">
                    <SparklineChart :data="item.sparkline" :positive="(item.changePercent ?? 0) >= 0" :width="60"
                        :height="20" />
                </div>
                <div class="price-col">
                    <span class="price-text">{{ formatPrice(item.price ?? 0) }}</span>
                    <span :class="['change-badge', (item.changePercent ?? 0) >= 0 ? 'positive' : 'negative']">
                        {{ formatChangePercent(item.changePercent ?? 0) }}
                    </span>
                </div>
            </div>
        </template>
        <f7-swipeout-actions right>
            <f7-swipeout-button delete confirm-text="Remove from watchlist?" @click="$emit('remove', item.ticker)">
                <f7-icon ios="f7:trash" md="material:delete"></f7-icon>
            </f7-swipeout-button>
        </f7-swipeout-actions>
    </f7-list-item>
</template>

<script setup lang="ts">
import SparklineChart from '../../../components/SparklineChart.vue';
import { useLongPress } from '../composables/useLongPress';
import { formatChangePercent, formatPrice } from '../utils/assetFormatters';
import AssetLogo from './AssetLogo.vue';

interface Props {
    item: any; // Using any for now matching original structure, ideally strictly typed
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'click', item: any): void;
    (e: 'remove', ticker: string): void;
    (e: 'hold', item: any): void;
}>();

const longPress = useLongPress((item) => {
    emit('hold', item);
});
</script>

<style scoped>
.item-holding {
    transform: scale(0.97);
    background-color: var(--f7-list-bg-color);
    filter: brightness(0.95);
    transition: all 0.2s ease-out;
}

.after-content {
    display: flex;
    align-items: center;
    gap: 12px;
}

.sparkline-wrapper {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    margin-right: 12px;
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
</style>
