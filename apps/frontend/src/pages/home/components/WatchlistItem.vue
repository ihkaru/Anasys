<template>
    <f7-list-item :footer="item.name" swipeout @click="$emit('click', item)" @contextmenu.prevent
        @touchstart.passive="longPress.start(item)" @touchend="longPress.end" @touchmove="longPress.cancel"
        @mousedown="longPress.start(item)" @mouseup="longPress.end" @mouseleave="longPress.cancel"
        :class="{ 'item-holding': longPress.isHolding.value }">
        <template #title>
            <div class="item-title-row">
                <span>{{ item.ticker }}</span>
                <span v-if="item.source" class="badge-source" :class="item.source.toLowerCase()">
                    {{ item.source === 'YAHOO' ? 'Y' : 'TV' }}
                </span>
            </div>
        </template>
        <template #media>
            <AssetLogo :ticker="item.ticker" :icon-url="item.iconUrl" :website="item.website" :type="item.type" />
        </template>
        <template #after>
            <div class="after-content">
                <div class="sparkline-wrapper">
                    <SparklineChart :data="item.sparkline" :positive="(primaryDisplay.changePercent) >= 0" :width="60"
                        :height="20" />
                </div>
                <div class="price-col">
                    <div class="main-price-row">
                        <span v-if="primaryDisplay.isExtended" class="ext-badge">{{ primaryDisplay.label }}</span>
                        <span class="price-text">{{ formatPrice(primaryDisplay.price, item.currency) }}</span>
                    </div>
                    <span :class="['change-badge', (primaryDisplay.changePercent) >= 0 ? 'positive' : 'negative']">
                        {{ formatChangePercent(primaryDisplay.changePercent) }}
                    </span>
                    <!-- Secondary Display (Regular Close if Extended is active) -->
                    <span v-if="secondaryDisplay" class="secondary-info">
                        Reg: {{ formatPrice(secondaryDisplay.price, item.currency) }}
                        <span :class="secondaryDisplay.changePercent >= 0 ? 'sec-up' : 'sec-down'">
                            ({{ formatChangePercent(secondaryDisplay.changePercent) }})
                        </span>
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
import { computed } from 'vue';
import SparklineChart from '../../../components/SparklineChart.vue';
import { getExtendedHoursInfo } from '../../../utils/formatters';
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

// Compute extended hours info
const extendedHours = computed(() => getExtendedHoursInfo(props.item));

// Determine Primary Display (Extended takes priority if available)
const primaryDisplay = computed(() => {
    if (extendedHours.value) {
        return {
            price: extendedHours.value.price,
            changePercent: extendedHours.value.changePercent,
            label: extendedHours.value.label, // 'Pre' or 'After'
            isExtended: true
        };
    }
    return {
        price: props.item.price ?? 0,
        changePercent: props.item.changePercent ?? 0,
        label: 'Reg',
        isExtended: false
    };
});

// Determine Secondary Display (Regular Close if Extended is active)
const secondaryDisplay = computed(() => {
    if (extendedHours.value) {
        return {
            price: props.item.price ?? 0,
            changePercent: props.item.changePercent ?? 0
        };
    }
    return null;
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

.main-price-row {
    display: flex;
    align-items: center;
    gap: 4px;
}

.price-text {
    font-weight: 700;
    font-size: 15px;
    letter-spacing: -0.5px;
}

.ext-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 3px;
    border-radius: 3px;
    background: var(--f7-theme-color);
    color: #fff;
    opacity: 0.8;
}

.change-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
}

.change-badge.positive {
    background: rgba(16, 185, 129, 0.1);
    color: var(--positive-color, #10b981);
}

.change-badge.negative {
    background: rgba(239, 68, 68, 0.1);
    color: var(--negative-color, #ef4444);
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

/* Secondary Info Styles */
.secondary-info {
    font-size: 10px;
    color: var(--f7-text-color);
    opacity: 0.5;
    margin-top: 1px;
}

.secondary-info .sec-up {
    color: var(--positive-color, #10b981);
}

.secondary-info .sec-down {
    color: var(--negative-color, #ef4444);
}
</style>
