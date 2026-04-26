<template>
    <div class="market-summary-block">
        <div class="market-summary-card">
            <!-- Data State -->
            <template v-if="marketOverview.length > 0">
                <div v-for="item in marketOverview" :key="item.ticker" class="market-item">
                    <span class="market-label">{{ item.name || item.ticker }}</span>
                    <span :class="['market-value', (item.changePercent ?? 0) >= 0 ? 'positive' : 'negative']">
                        {{ formatPercent(item.changePercent ?? 0) }}
                    </span>
                </div>
            </template>

            <!-- Loading State (Non-structural) -->
            <div v-else-if="loading" class="market-item loading-state">
                <f7-preloader size="20"></f7-preloader>
            </div>

            <!-- Empty State -->
            <div v-else class="market-item empty-state">
                <span class="market-label">No Data</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { formatPercent } from "../../../utils/formatters";
import { useMarketData } from "../composables/useMarketData";

const { marketOverview, loading, fetchMarketOverview } = useMarketData();

onMounted(() => {
	fetchMarketOverview();
});
</script>

<style scoped>
.market-summary-block {
    margin: var(--f7-block-margin-vertical) var(--f7-block-margin-horizontal);
}

.market-summary-card {
    display: flex;
    justify-content: space-between;
    background: var(--f7-card-bg-color);
    border-radius: 12px;
    padding: 16px;
    min-height: 60px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.market-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
}

.market-item.loading-state,
.market-item.empty-state {
    justify-content: center;
}

.market-label {
    font-size: 12px;
    color: var(--f7-text-color);
    opacity: 0.6;
    text-align: center;
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
