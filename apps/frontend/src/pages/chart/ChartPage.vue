<template>
    <f7-page class="chart-page">
        <!-- Custom Navbar with Real-time Price -->
        <f7-navbar back-link="Back">
            <f7-nav-title>
                <div class="nav-title-content">
                    <span class="ticker">{{ marketStore.selectedSymbol || 'Chart' }}</span>
                    <div v-if="currentQuote" class="price-info">
                        <span class="price">{{ formatPrice(currentQuote.price) }}</span>
                        <span class="change" :class="currentQuote.change >= 0 ? 'up' : 'down'">
                            {{ currentQuote.change >= 0 ? '+' : '' }}{{ currentQuote.change.toFixed(2) }}
                            ({{ currentQuote.changePercent.toFixed(2) }}%)
                        </span>
                    </div>
                </div>
            </f7-nav-title>
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

        <!-- NEW: Financials Section -->
        <FinancialsSection v-if="!isFullscreen && financials" :financials="financials" :analyst="analystRatings"
            :current-price="currentQuote?.price || 0" />

        <!-- NEW: Earnings Section -->
        <EarningsSection v-if="!isFullscreen && earnings" :earnings="earnings" />

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
import EarningsSection from './components/EarningsSection.vue';
import FinancialsSection from './components/FinancialsSection.vue';
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
const financials = ref<any>(null);
const analystRatings = ref<any>(null);
const earnings = ref<any>(null);
const currentQuote = ref<any>(null);

async function handleIntervalChange(interval: string) {
    if (!marketStore.selectedSymbol) return;
    selectedInterval.value = interval;
    lastLoadedTimestamp.value = null; // Reset loop guard

    const limit = getIntervalLimit(interval);
    await marketStore.fetchHistory(marketStore.selectedSymbol, interval, limit);
    chartRef.value?.fitContent();
}

const lastLoadedTimestamp = ref<string | null>(null);

async function handleLoadMore() {
    if (!marketStore.selectedSymbol || marketStore.ohlcvData.length === 0) return 0;

    const oldestCandle = marketStore.ohlcvData[0];
    if (!oldestCandle) return 0;

    // Prevent infinite loop if we're requesting the same timestamp
    if (lastLoadedTimestamp.value === oldestCandle.timestamp) {
        // console.debug('[ChartPage] Duplicate load request for timestamp:', oldestCandle.timestamp);
        return 0;
    }

    lastLoadedTimestamp.value = oldestCandle.timestamp;

    const result = await marketStore.fetchHistory(
        marketStore.selectedSymbol,
        selectedInterval.value,
        500,
        oldestCandle.timestamp
    );
    return result ? result.length : 0;
}


function getIntervalLimit(interval: string): number {
    if (interval === '1d' || interval === '1wk') return 365;
    if (interval === '15m') return 200;
    return 500;
}

function formatPrice(price: number) {
    if (!price) return '-';
    return price < 1 ? price.toFixed(4) : price.toFixed(2);
}

async function loadInitialData(ticker: string) {
    marketStore.selectSymbol(ticker);
    marketStore.selectedSymbolData = null;
    marketStore.signals = [];
    recommendations.value = [];
    financials.value = null;
    analystRatings.value = null;
    earnings.value = null;
    currentQuote.value = null;
    lastLoadedTimestamp.value = null; // Reset loop guard

    // We don't block UI with await here to allow skeleton or loader to show
    // Optimize: Prioritize History (Chart) over Symbol Details (Metadata)
    console.time('LoadHistory');
    console.log('[ChartPage] Starting fetchHistory...');
    await marketStore.fetchHistory(ticker, selectedInterval.value, 500);
    console.log('[ChartPage] fetchHistory done.');
    console.timeEnd('LoadHistory');

    // Fit content immediately after history loaded
    nextTick(() => {
        console.log('[ChartPage] fitContent nextTick calling...');
        chartRef.value?.fitContent();
        console.log('[ChartPage] fitContent called.');
    });

    // Fetch details in parallel/background (delayed to avoid UI freeze/patch error during mount)
    setTimeout(() => {
        marketStore.fetchSymbolDetails(ticker);
    }, 300);




    // Fetch background data
    loadBackgroundData(ticker);
}

function loadBackgroundData(ticker: string) {
    console.log(`[ChartPage] loadBackgroundData for ${ticker}`);
    
    // 1. Quotes
    marketStore.fetchQuote(ticker).then(quote => {
        console.log('[ChartPage] quote:', quote);
        if (quote) currentQuote.value = quote;
    });

    // 2. Recommendations
    marketStore.fetchRecommendations(ticker).then(recs => {
        console.log('[ChartPage] recommendations:', recs);
        recommendations.value = recs || [];
    });

    // 3. Financials
    marketStore.fetchFinancials(ticker).then(data => {
        console.log('[ChartPage] financials:', data);
        financials.value = data;
    });

    // 4. Analyst Ratings
    marketStore.fetchAnalyst(ticker).then(data => {
        console.log('[ChartPage] analyst:', data);
        analystRatings.value = data;
    });

    // 5. Earnings
    marketStore.fetchEarnings(ticker).then(data => {
        console.log('[ChartPage] earnings:', data);
        earnings.value = data;
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

/* Custom Nav Title */
.nav-title-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Center for IOS style */
    line-height: 1.2;
}

.ticker {
    font-weight: 700;
    font-size: 16px;
}

.price-info {
    display: flex;
    gap: 6px;
    font-size: 11px;
    font-weight: 500;
}

.change.up {
    color: #10b981;
}

.change.down {
    color: #ef4444;
}
</style>
