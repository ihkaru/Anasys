<template>
    <div v-if="recommendations.length > 0" class="recommendations-section">
        <f7-block-title>Similar Assets</f7-block-title>
        <div class="recommendations-scroll">
            <div class="recommendations-cards">
                <div v-for="item in recommendations" :key="item.ticker" class="recommendation-card"
                    @click="$emit('click', item)">
                    <div class="rec-icon">
                        <span class="rec-ticker-icon">{{ item.ticker.substring(0, 2) }}</span>
                    </div>
                    <div class="rec-info">
                        <span class="rec-ticker">{{ item.ticker }}</span>
                        <span :class="['rec-change', item.changePercent >= 0 ? 'positive' : 'negative']">
                            {{ item.changePercent >= 0 ? '+' : '' }}{{ item.changePercent.toFixed(2) }}%
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
}

defineProps<{
    recommendations: RecommendationItem[];
}>();

defineEmits<{
    (e: 'click', item: RecommendationItem): void;
}>();
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
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 12px 10px;
    text-align: center;
    cursor: pointer;
    transition: transform 0.1s, background 0.2s;
}

.recommendation-card:active {
    transform: scale(0.95);
    background: rgba(255, 255, 255, 0.08);
}

.rec-icon {
    width: 36px;
    height: 36px;
    margin: 0 auto 8px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.rec-ticker-icon {
    font-size: 12px;
    font-weight: 700;
    color: white;
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
    color: #10b981;
}

.rec-change.negative {
    color: #ef4444;
}
</style>
