<template>
    <f7-list class="asset-list">
        <f7-list-item v-for="item in items" :key="item.ticker + (item.source || '') + (item.exchange || '')"
            :subtitle="showSubtitle ? item.name : undefined" :footer="!showSubtitle ? item.name : undefined"
            @click="$emit('click', item)">
            <template #title>
                <div class="title-row">
                    <span class="ticker">{{ item.ticker }}</span>
                    <div class="badges">
                        <span v-if="item.exchange" class="badge exchange">{{ item.exchange }}</span>
                        <span v-if="item.source" class="badge source" :class="item.source.toLowerCase()">
                            {{ item.source === 'YAHOO' ? 'Y' : 'TV' }}
                        </span>
                    </div>
                </div>
            </template>
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
                        <span class="price-text">{{ formatPrice(item.price, item.currency) }}</span>
                        <span v-if="item.changePercent !== undefined"
                            :class="['change-badge', isPositive(item) ? 'positive' : 'negative']">
                            {{ isPositive(item) ? '+' : '' }}{{ item.changePercent.toFixed(2) }}%
                        </span>
                        <!-- Extended Hours Secondary Display -->
                        <span v-if="getExtendedHours(item)" class="extended-hours">
                            {{ getExtendedHours(item)?.label }}: {{ formatPrice(getExtendedHours(item)?.price || 0, item.currency) }}
                            <span :class="(getExtendedHours(item)?.changePercent || 0) >= 0 ? 'ext-positive' : 'ext-negative'">
                                {{ (getExtendedHours(item)?.changePercent || 0) >= 0 ? '+' : '' }}{{ (getExtendedHours(item)?.changePercent || 0).toFixed(2) }}%
                            </span>
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
import { getExtendedHoursInfo } from "../../../utils/formatters";

interface AssetItem {
	ticker: string;
	name?: string;
	price: number;
	changePercent?: number;
	sparkline?: number[];
	iconUrl?: string;
	website?: string;
	type?: string;
	// Multi-source fields
	source?: string;
	exchange?: string;
	currency?: string;
}

const _props = withDefaults(
	defineProps<{
		items: AssetItem[];
		showSparkline?: boolean;
		showSubtitle?: boolean;
		showPrice?: boolean;
		emptyMessage?: string;
	}>(),
	{
		showSparkline: true,
		showSubtitle: false,
		showPrice: true,
	},
);

defineEmits<(e: "click", item: AssetItem) => void>();

function _isPositive(item: AssetItem): boolean {
	return (item.changePercent || 0) >= 0;
}

// Get extended hours info for an item
function _getExtendedHours(item: AssetItem) {
	return getExtendedHoursInfo(item as any);
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

.title-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.ticker {
    font-weight: 600;
}

.badges {
    display: flex;
    gap: 4px;
}

.badge {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
    color: var(--f7-text-color);
    text-transform: uppercase;
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

/* Extended Hours Styles */
.extended-hours {
    font-size: 10px;
    color: var(--f7-text-color);
    opacity: 0.65;
    margin-top: 2px;
}

.extended-hours .ext-positive {
    color: var(--positive-color, #10b981);
}

.extended-hours .ext-negative {
    color: var(--negative-color, #ef4444);
}
</style>
