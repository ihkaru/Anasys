<template>
    <div class="trending-scroll">
        <div class="trending-cards">
            <div v-for="item in items" :key="item.ticker" class="trending-card" @click="$emit('click', item)">
                <div class="trending-icon-wrapper">
                    <AssetLogo :ticker="item.ticker" :icon-url="item.iconUrl" :website="item.website" :type="item.type"
                        size="medium" />
                </div>

                <SparklineChart :data="item.sparkline || []" :positive="isPositive(item)" :width="76" :height="24" />

                <div class="trending-info">
                    <span class="trending-ticker">{{ item.ticker }}</span>
                    <span :class="['trending-change', isPositive(item) ? 'positive' : 'negative']">
                        {{ isPositive(item) ? '+' : '' }}{{ item.changePercent.toFixed(2) }}%
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import SparklineChart from "../../../components/SparklineChart.vue";
import AssetLogo from "../../home/components/AssetLogo.vue";

interface TrendingItem {
    ticker: string;
    name?: string;
    changePercent: number;
    sparkline?: number[];
    iconUrl?: string;
    website?: string;
    type?: string;
}

defineProps<{
    items: TrendingItem[];
}>();

defineEmits<(e: "click", item: TrendingItem) => void>();

function isPositive(item: TrendingItem): boolean {
    return item.changePercent >= 0;
}
</script>

<style scoped>
.trending-scroll {
    overflow-x: auto;
    padding: 0 16px 16px;
    -webkit-overflow-scrolling: touch;
}

.trending-cards {
    display: flex;
    gap: 12px;
}

.trending-card {
    flex-shrink: 0;
    width: 100px;
    background: var(--f7-card-bg-color);
    border-radius: 12px;
    padding: 12px;
    text-align: center;
    cursor: pointer;
    transition: transform 0.1s;
}

.trending-card:active {
    transform: scale(0.97);
}

.trending-icon-wrapper {
    width: 40px;
    height: 40px;
    margin: 0 auto 6px;
    position: relative;
    /* AssetLogo will fill this */
}

.trending-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 6px;
}

.trending-ticker {
    font-weight: 600;
    font-size: 13px;
}

.trending-change {
    font-size: 11px;
    font-weight: 600;
}

.trending-change.positive {
    color: #10b981;
}

.trending-change.negative {
    color: #ef4444;
}
</style>
