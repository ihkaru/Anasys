<template>
    <div v-if="recommendations.length > 0" class="recommendations-section">
        <f7-block-title>Similar Assets</f7-block-title>
        <div class="recommendations-scroll">
            <div class="recommendations-cards">
                <div v-for="item in recommendations" :key="item.ticker" class="recommendation-card"
                    @click="$emit('click', item)">
                    <div class="rec-icon">
                        <AssetLogo :ticker="item.ticker" :icon-url="item.iconUrl" :type="item.type || 'STOCK'"
                            size="small" />
                    </div>
                    <div class="rec-info">
                        <span class="rec-ticker">{{ item.ticker || 'Unknown' }}</span>
                        <span :class="['rec-change', (item.changePercent || 0) >= 0 ? 'positive' : 'negative']">
                            {{ (item.changePercent || 0) >= 0 ? '+' : '' }}{{ (item.changePercent || 0).toFixed(2) }}%
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
interface RecommendationItem {
	ticker: string;
	name: string;
	price: number;
	changePercent: number;
	iconUrl?: string;
	type?: "STOCK" | "CRYPTO";
}

defineProps<{
	recommendations: RecommendationItem[];
}>();

defineEmits<(e: "click", item: RecommendationItem) => void>();
</script>

<style scoped>
.recommendations-section {
    padding-bottom: 16px;
}

.recommendations-scroll {
    overflow-x: auto;
    padding: 0 16px;
    -webkit-overflow-scrolling: touch;
}

.recommendations-cards {
    display: flex;
    gap: 10px;
}

.recommendation-card {
    flex-shrink: 0;
    width: 90px;
    background: var(--card-bg, rgba(0, 0, 0, 0.05));
    border-radius: 12px;
    padding: 12px 10px;
    text-align: center;
    cursor: pointer;
    transition: transform 0.1s, background 0.2s;
}

.recommendation-card:active {
    transform: scale(0.95);
    background: var(--chart-border, rgba(0, 0, 0, 0.08));
}

.rec-icon {
    width: 36px;
    height: 36px;
    margin: 0 auto 8px;
}

.rec-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.rec-ticker {
    font-size: 11px;
    font-weight: 600;
    color: var(--f7-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.rec-change {
    font-size: 10px;
    font-weight: 600;
}

.rec-change.positive {
    color: var(--positive-color, #10b981);
}

.rec-change.negative {
    color: var(--negative-color, #ef4444);
}
</style>
