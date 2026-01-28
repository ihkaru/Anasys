<template>
    <f7-block>
        <div class="allocation-card">
            <h4>Asset Allocation</h4>

            <div class="allocation-chart">
                <div v-for="(item, index) in data" :key="item.label" class="allocation-bar" :style="{
                    width: item.percent + '%',
                    backgroundColor: colors[index % colors.length]
                }"></div>
            </div>

            <div class="allocation-legend">
                <div v-for="(item, index) in data" :key="item.label" class="legend-item">
                    <span class="legend-dot" :style="{ backgroundColor: colors[index % colors.length] }"></span>
                    <span class="legend-label">{{ item.label }}</span>
                    <span class="legend-percent">{{ item.percent.toFixed(1) }}%</span>
                </div>
            </div>
        </div>
    </f7-block>
</template>

<script setup lang="ts">

export interface AllocationItem {
    label: string;
    percent: number;
}

const props = withDefaults(defineProps<{
    data: AllocationItem[];
    colors?: string[];
}>(), {
    colors: () => [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
        '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
    ]
});
</script>

<style scoped>
.allocation-card {
    background: var(--f7-card-bg-color);
    border-radius: 12px;
    padding: 16px;
}

.allocation-card h4 {
    margin: 0 0 12px;
    font-size: 14px;
    opacity: 0.7;
}

.allocation-chart {
    display: flex;
    height: 12px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--f7-page-bg-color);
}

.allocation-bar {
    height: 100%;
    transition: width 0.3s ease;
}

.allocation-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 12px;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
}

.legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.legend-percent {
    opacity: 0.6;
}
</style>
