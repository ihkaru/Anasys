<template>
    <f7-block>
        <div class="market-summary-card">
            <div v-for="item in marketOverview" :key="item.ticker" class="market-item">
                <span class="market-label">{{ item.name || item.ticker }}</span>
                <span :class="['market-value', (item.changePercent ?? 0) >= 0 ? 'positive' : 'negative']">
                    {{ formatChangePercent(item.changePercent ?? 0) }}
                </span>
            </div>

            <!-- Loading State -->
            <div v-if="loading && marketOverview.length === 0" class="market-item">
                <f7-preloader size="20"></f7-preloader>
            </div>

            <!-- Fallback if no data and not loading -->
            <div v-if="!loading && marketOverview.length === 0" class="market-item">
                <span class="market-label">No Data</span>
            </div>
        </div>
    </f7-block>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useMarketData } from "../composables/useMarketData";

const { marketOverview, loading, fetchMarketOverview } = useMarketData();

onMounted(() => {
	fetchMarketOverview();
});
</script>

<style scoped>
.market-summary-card {
    display: flex;
    justify-content: space-between;
    background: var(--f7-card-bg-color);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.market-item {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.market-label {
    font-size: 12px;
    color: var(--f7-text-color);
    opacity: 0.6;
}

.market-value {
    font-size: 16px;
    font-weight: 600;
    margin-top: 4px;
}

.market-value.positive {
    color: var(--positive-color, #10b981);
}

.market-value.negative {
    color: var(--negative-color, #ef4444);
}
</style>
