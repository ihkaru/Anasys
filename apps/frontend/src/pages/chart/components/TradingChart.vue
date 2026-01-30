<template>
    <div ref="chartContainerRef" class="chart-container" :class="{ 'fullscreen': isFullscreen }">
        <div ref="chartRef" class="chart-element"></div>

        <div v-if="loading" class="chart-loading">
            <f7-preloader></f7-preloader>
        </div>

        <ChartLegend v-if="hasSignals" />
    </div>
</template>

<script setup lang="ts">
import { useFullscreen } from '@vueuse/core';
import { computed, onMounted, onUnmounted, ref, toRef } from 'vue';
import { type Signal } from '../../../stores/market';
import { useChart } from '../composables/useChart';
import { useChartData } from '../composables/useChartData';
import { useInfiniteScroll } from '../composables/useInfiniteScroll';
import { type OHLCVData } from '../utils/chart-formatters';
import ChartLegend from './ChartLegend.vue';

const props = defineProps<{
    ohlcvData: OHLCVData[];
    signals: Signal[];
    loading?: boolean;
}>();

const emit = defineEmits<{
    (e: 'load-more'): void;
}>();

const chartRef = ref<HTMLDivElement | null>(null);
const chartContainerRef = ref<HTMLDivElement | null>(null);

const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(chartContainerRef);
const hasSignals = computed(() => props.signals.length > 0);

const { chart, candleSeries, initChart, destroyChart, fitContent, resizeChart } = useChart(chartRef, isFullscreen);

// When chart is initialized, we need to bind everything
// Because useChart returns chart as a Ref<IChartApi | null>, useInfiniteScroll needs it.

const { updateAll } = useChartData(
    candleSeries,
    toRef(props, 'ohlcvData'),
    toRef(props, 'signals')
);

// We need to wait until chart is created to subscribe, or handle null chart gracefully in composable
// The composable handles null chart, but we must call subscribe AFTER init.

const { subscribe: subscribeScroll, unsubscribe: unsubscribeScroll } = useInfiniteScroll(
    chart,
    async () => emit('load-more')
);

onMounted(() => {
    initChart();
    // Now chart.value is set inside useChart
    subscribeScroll();
    updateAll();

    // Initial fit (small delay to ensure rendering)
    setTimeout(() => {
        fitContent();
    }, 100);
});

onUnmounted(() => {
    unsubscribeScroll();
    destroyChart();
});

// Expose methods to parent
defineExpose({
    toggleFullscreen,
    fitContent,
});
</script>

<style scoped>
.chart-container {
    position: relative;
    width: 100%;
    height: 350px;
    background: var(--surface-bg, #f5f5f7);
    border-radius: 12px;
    margin: 8px 0;
    overflow: hidden;
    transition: all 0.3s ease;
}

.chart-container.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0;
    border-radius: 0;
    z-index: 9999;
    height: 100vh !important;
}

.chart-element {
    width: 100%;
    height: 100%;
}

.chart-loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10;
}
</style>
