<template>
    <f7-list class="asset-list">
        <f7-list-item v-for="item in items" :key="item.ticker" :title="item.ticker"
            :subtitle="showSubtitle ? item.name : undefined" :footer="!showSubtitle ? item.name : undefined"
            @click="$emit('click', item)">
            <template #media>
                <div class="asset-icon-wrapper">
                    <AssetLogo :ticker="item.ticker" :icon-url="item.iconUrl" :website="item.website" :type="item.type"
                        size="medium" />
                </div>
            </template>

            <template #after>
                <div class="after-content">
                    <div class="sparkline-wrapper" v-if="showSparkline && showPrice">
                        <SparklineChart :data="item.sparkline || []" :positive="isPositive(item)" :width="60"
                            :height="20" />
                    </div>
                    <div class="price-col" v-if="showPrice">
                        <span class="price-text">{{ formatPrice(item.price) }}</span>
                        <span v-if="item.changePercent !== undefined"
                            :class="['change-badge', isPositive(item) ? 'positive' : 'negative']">
                            {{ isPositive(item) ? '+' : '' }}{{ item.changePercent.toFixed(2) }}%
                        </span>
                    </div>
                </div>
            </template>
        </f7-list-item>

        <f7-list-item v-if="items.length === 0 && emptyMessage" class="no-results">
            <template #title>
                <div class="no-results-content">
                    <f7-icon ios="f7:search" md="material:search" size="48" color="gray"></f7-icon>
                    <p>{{ emptyMessage }}</p>
                </div>
            </template>
        </f7-list-item>
    </f7-list>
</template>

<script setup lang="ts">
import SparklineChart from '../../../components/SparklineChart.vue';
import { formatPrice } from '../../../utils/formatters';
import AssetLogo from '../../home/components/AssetLogo.vue';

interface AssetItem {
    ticker: string;
    name?: string;
    price: number;
    changePercent?: number;
    sparkline?: number[];
    iconUrl?: string;
    website?: string;
    type?: string;
}

const props = withDefaults(defineProps<{
    items: AssetItem[];
    showSparkline?: boolean;
    showSubtitle?: boolean;
    showPrice?: boolean;
    emptyMessage?: string;
}>(), {
    showSparkline: true,
    showSubtitle: false,
    showPrice: true
});

defineEmits<{
    (e: 'click', item: AssetItem): void;
}>();

function isPositive(item: AssetItem): boolean {
    return (item.changePercent || 0) >= 0;
}
</script>

<style scoped>
.asset-list {
    margin-top: 0;
}

.asset-icon-wrapper {
    width: 44px;
    height: 44px;
    position: relative;
}

.after-content {
    display: flex;
    align-items: center;
    gap: 12px;
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
    padding: 2px 8px;
    border-radius: 12px;
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

.no-results {
    text-align: center;
    padding: 40px 20px;
}

.no-results-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.no-results-content p {
    margin: 0;
    opacity: 0.6;
}
</style>
