<template>
    <f7-page class="chart-page">
        <f7-navbar :title="marketStore.selectedSymbol || 'Chart'" back-link="Back">
            <f7-nav-right>
                <f7-link @click="chartRef?.toggleFullscreen()">
                    <f7-icon
                        :ios="isFullscreen ? 'f7:arrow_down_right_and_arrow_up_left' : 'f7:arrow_up_left_and_arrow_down_right'"
                        :md="isFullscreen ? 'material:fullscreen_exit' : 'material:fullscreen'"></f7-icon>
                </f7-link>
            </f7-nav-right>
        </f7-navbar>

        <TradingChart ref="chartRef" :ohlcv-data="marketStore.ohlcvData" :signals="marketStore.signals"
            :loading="marketStore.loading" @load-more="handleLoadMore" />

        <IntervalSelector v-model="selectedInterval" @update:model-value="handleIntervalChange" />

        <SignalSummaryCard v-if="!isFullscreen" :signals="marketStore.signals" />

        <AssetDetailsCard v-if="!isFullscreen" :asset="marketStore.selectedSymbolData" />

        <RecommendationsSection v-if="!isFullscreen && recommendations.length > 0" :recommendations="recommendations"
            @click="openRecommendation" />

        <div v-if="!isFullscreen && !marketStore.selectedSymbolData && marketStore.loading" class="details-loading">
            <f7-preloader />
        </div>
    </f7-page>
</template>

<script setup lang="ts">
import { f7 } from 'framework7-vue';
import { nextTick, onMounted, ref, watch } from 'vue';
import { useMarketStore } from '../../stores/market';
import AssetDetailsCard from './components/AssetDetailsCard.vue';
import IntervalSelector from './components/IntervalSelector.vue';
import RecommendationsSection from './components/RecommendationsSection.vue';
import SignalSummaryCard from './components/SignalSummaryCard.vue';
import TradingChart from './components/TradingChart.vue';

const props = defineProps<{
    ticker?: string;
}>();

const marketStore = useMarketStore();
const chartRef = ref<InstanceType<typeof TradingChart> | null>(null);
const selectedInterval = ref('1h');
const isFullscreen = ref(false);
const recommendations = ref<any[]>([]);

async function handleIntervalChange(interval: string) {
    if (!marketStore.selectedSymbol) return;
    selectedInterval.value = interval;

    const limit = getIntervalLimit(interval);
    await marketStore.fetchHistory(marketStore.selectedSymbol, interval, limit);
    // Optional: fit content logic here if needed, but normally chart watcher handles it
    chartRef.value?.fitContent();
}

async function handleLoadMore() {
    if (!marketStore.selectedSymbol || marketStore.ohlcvData.length === 0) return;

    const oldestCandle = marketStore.ohlcvData[0];
    if (!oldestCandle) return;

    await marketStore.fetchHistory(
        marketStore.selectedSymbol,
        selectedInterval.value,
        500,
        oldestCandle.timestamp
    );
}

function getIntervalLimit(interval: string): number {
    if (interval === '1d' || interval === '1wk') return 365;
    if (interval === '15m') return 200;
    return 500;
}

async function loadInitialData(ticker: string) {
    marketStore.selectSymbol(ticker);
    marketStore.selectedSymbolData = null;
    marketStore.signals = [];
    recommendations.value = [];

    // We don't block UI with await here to allow skeleton or loader to show
    await Promise.all([
        marketStore.fetchHistory(ticker, selectedInterval.value, 500),
        marketStore.fetchSymbolDetails(ticker)
    ]);

    // Fit content after data loaded
    nextTick(() => {
        chartRef.value?.fitContent();
    });

    // Fetch recommendations in background (non-blocking)
    marketStore.fetchRecommendations(ticker).then((recs) => {
        recommendations.value = recs;
    });
}

function openRecommendation(item: any) {
    // Navigate to the recommended asset
    marketStore.selectSymbol(item.ticker);
    f7.views.main.router.navigate('/chart/', { props: { ticker: item.ticker } });
}

onMounted(async () => {
    const ticker = props.ticker || marketStore.selectedSymbol;
    if (ticker) {
        await loadInitialData(ticker);
    }
});

watch(() => props.ticker, async (newTicker) => {
    if (newTicker) {
        await loadInitialData(newTicker);
    }
});
</script>

<style scoped>
.chart-page {
    background: #0f0f23;
}

.details-loading {
    display: flex;
    justify-content: center;
    padding: 32px;
}
</style>
