<template>
    <f7-page class="chart-page">
        <f7-navbar :title="marketStore.selectedSymbol" back-link="Back">
            <f7-nav-right>
                <f7-link @click="toggleFullscreen">
                    <f7-icon
                        :ios="isFullscreen ? 'f7:arrow_down_right_and_arrow_up_left' : 'f7:arrow_up_left_and_arrow_down_right'"
                        :md="isFullscreen ? 'material:fullscreen_exit' : 'material:fullscreen'"></f7-icon>
                </f7-link>
            </f7-nav-right>
        </f7-navbar>

        <div class="chart-container" :class="{ 'fullscreen': isFullscreen }" ref="chartContainerRef">
            <!-- Chart will be rendered here -->
            <div ref="chartRef" class="chart-element"></div>

            <!-- Loading overlay -->
            <div v-if="marketStore.loading" class="chart-loading">
                <f7-preloader></f7-preloader>
            </div>

            <!-- Signal markers legend -->
            <div class="chart-legend" v-if="marketStore.signals.length > 0">
                <span class="legend-item buy">
                    <span class="dot"></span> Buy Signal
                </span>
                <span class="legend-item sell">
                    <span class="dot"></span> Sell Signal
                </span>
            </div>
        </div>

        <!-- Modern Interval Selector -->
        <div class="interval-selector-wrapper">
            <div class="interval-selector modern-glass">
                <button v-for="interval in intervals" :key="interval" class="interval-btn"
                    :class="{ 'active': selectedInterval === interval }" @click="changeInterval(interval)">
                    {{ interval }}
                </button>
            </div>
        </div>

        <!-- Signal Summary Card -->
        <f7-card v-if="!isFullscreen && marketStore.signals.length > 0">
            <f7-card-header>
                {{ marketStore.signals.length }} Signals Found
            </f7-card-header>
            <f7-card-content>
                <div class="signal-summary">
                    <div class="signal-stat">
                        <span class="label">Buy Signals</span>
                        <span class="value buy">{{ buySignals }}</span>
                    </div>
                    <div class="signal-stat">
                        <span class="label">Sell Signals</span>
                        <span class="value sell">{{ sellSignals }}</span>
                    </div>
                </div>
            </f7-card-content>
        </f7-card>

        <!-- Asset Details Card -->
        <f7-card v-if="!isFullscreen && marketStore.selectedSymbolData" class="asset-details-card">
            <f7-card-header class="no-border">
                <div class="header-row">
                    <div class="title-col">
                        <h2 class="asset-name">{{ marketStore.selectedSymbolData.name }}</h2>
                        <span class="asset-ticker">{{ marketStore.selectedSymbolData.ticker }} · {{
                            marketStore.selectedSymbolData.type }}</span>
                    </div>
                    <img v-if="marketStore.selectedSymbolData.iconUrl" :src="marketStore.selectedSymbolData.iconUrl"
                        class="asset-logo-large" />
                </div>
            </f7-card-header>
            <f7-card-content>
                <div class="stats-grid">
                    <div class="stat-item" v-if="marketStore.selectedSymbolData.sector">
                        <span class="label">Sector</span>
                        <span class="value">{{ marketStore.selectedSymbolData.sector }}</span>
                    </div>
                    <div class="stat-item" v-if="marketStore.selectedSymbolData.industry">
                        <span class="label">Industry</span>
                        <span class="value">{{ marketStore.selectedSymbolData.industry }}</span>
                    </div>
                </div>

                <div class="description-block" v-if="marketStore.selectedSymbolData.description">
                    <p class="description-text">{{ marketStore.selectedSymbolData.description }}</p>
                </div>

                <div class="actions-block">
                    <f7-button fill v-if="marketStore.selectedSymbolData.website"
                        :href="marketStore.selectedSymbolData.website" target="_blank" external>
                        <f7-icon ios="f7:globe" md="material:language"></f7-icon> Website
                    </f7-button>
                </div>
            </f7-card-content>
        </f7-card>

        <!-- Loading State for Details -->
        <div v-if="!isFullscreen && !marketStore.selectedSymbolData && marketStore.loading" class="details-loading">
            <f7-preloader />
        </div>

    </f7-page>
</template>

<script setup lang="ts">
import { useElementSize, useFullscreen } from '@vueuse/core';
import { CandlestickSeries, ColorType, createChart, type IChartApi } from 'lightweight-charts';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useMarketStore, type Signal } from '../../stores/market';

const props = defineProps<{
    ticker?: string;
}>();

const marketStore = useMarketStore();

const chartRef = ref<HTMLDivElement | null>(null);
const chartContainerRef = ref<HTMLDivElement | null>(null);
const selectedInterval = ref('1h');
const intervals = ['15m', '30m', '1h', '1d', '1wk']; // Removed 4h

let chart: IChartApi | null = null;
let candleSeries: any = null;
let isLoadingMore = false;

const { width, height } = useElementSize(chartContainerRef);
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(chartContainerRef);

// Computed
const buySignals = computed(() => marketStore.signals.filter(s => s.type === 'BUY').length);
const sellSignals = computed(() => marketStore.signals.filter(s => s.type === 'SELL').length);

async function changeInterval(interval: string) {
    if (selectedInterval.value === interval) return;
    selectedInterval.value = interval;
    if (marketStore.selectedSymbol) {
        let limit = 500;
        if (interval === '1d' || interval === '1wk') limit = 365;
        if (interval === '15m') limit = 200;

        await marketStore.fetchHistory(marketStore.selectedSymbol, interval, limit);
        if (chart) chart.timeScale().fitContent();
    }
}

async function loadMoreHistory() {
    if (isLoadingMore || !marketStore.selectedSymbol || marketStore.ohlcvData.length === 0) return;

    // Check if we are at the start
    const oldestCandle = marketStore.ohlcvData[0];
    if (!oldestCandle) return;

    isLoadingMore = true;
    console.log('[ChartPage] Loading more history before:', oldestCandle.timestamp);

    try {
        await marketStore.fetchHistory(
            marketStore.selectedSymbol,
            selectedInterval.value,
            500,
            oldestCandle.timestamp // Pass timestamp of oldest candle
        );
    } finally {
        isLoadingMore = false;
    }
}

function onVisibleLogicalRangeChanged(newRange: any) {
    if (!newRange) return;
    // If we scroll close to the start (left side)
    // logical range < 0 means we are scrolling into "future" if right, but "past" is positive index 0?
    // In lightweight charts, index 0 is usually the first point in dataset. 
    // If range.from < 0, we are looking at empty space before the first point.
    if (newRange.from < 50) { // Fetch early
        loadMoreHistory();
    }
}

// Initialize chart
onMounted(async () => {
    console.log('[ChartPage] Mounted. Ticker Prop:', props.ticker, 'Store Selected:', marketStore.selectedSymbol);
    await nextTick();
    initChart();

    // Reset selected data to avoid showing old data
    marketStore.selectedSymbolData = null;

    // Use prop ticker if available, otherwise fallback to store
    if (props.ticker) {
        console.log('[ChartPage] Using prop ticker:', props.ticker);
        marketStore.selectSymbol(props.ticker);
    }

    // Always fetch fresh data on mount to ensure backend sync
    if (marketStore.selectedSymbol) {
        console.log('[ChartPage] Fetching history for:', marketStore.selectedSymbol);
        // Parallel fetch: History + Details
        await Promise.all([
            marketStore.fetchHistory(marketStore.selectedSymbol, selectedInterval.value, 500),
            marketStore.fetchSymbolDetails(marketStore.selectedSymbol)
        ]);
    }

    updateChartData();
    chart?.timeScale().fitContent();
});

// Watch for prop changes (e.g. navigation within same route)
watch(() => props.ticker, async (newTicker) => {
    if (newTicker) {
        marketStore.selectSymbol(newTicker);
        marketStore.selectedSymbolData = null; // Clear old
        await Promise.all([
            marketStore.fetchHistory(newTicker, '1h', 500),
            marketStore.fetchSymbolDetails(newTicker)
        ]);
        // Clear old signals
        marketStore.signals = [];
    }
});

onUnmounted(() => {
    if (chart) {
        chart.remove();
        chart = null;
    }
});

function initChart() {
    if (!chartRef.value) return;

    chart = createChart(chartRef.value, {
        layout: {
            background: { type: ColorType.Solid, color: '#1a1a2e' },
            textColor: '#d1d4dc',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
        },
        grid: {
            vertLines: { color: '#2B2B43' },
            horzLines: { color: '#2B2B43' },
        },
        width: width.value || 400,
        height: height.value || 300,
        crosshair: {
            mode: 1, // Magnet mode
        },
        rightPriceScale: {
            borderColor: '#2B2B43',
        },
        timeScale: {
            borderColor: '#2B2B43',
            timeVisible: true,
            secondsVisible: false,
        },
    });

    candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981', // Tailwind Emerald 500
        downColor: '#ef4444', // Tailwind Red 500
        borderDownColor: '#ef4444',
        borderUpColor: '#10b981',
        wickDownColor: '#ef4444',
        wickUpColor: '#10b981',
    });

    // Infinite Scroll Listener
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChanged);
}

function updateChartData() {
    if (!candleSeries || marketStore.ohlcvData.length === 0) return;

    // Convert OHLCV data to lightweight-charts format
    // Filter duplicates using a Map
    const dataMap = new Map();
    marketStore.ohlcvData.forEach(d => {
        const time = new Date(d.timestamp).getTime() / 1000;
        dataMap.set(time, {
            time: time as any,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
        });
    });

    const chartData = Array.from(dataMap.values());

    // Sort just in case
    chartData.sort((a, b) => (a.time as number) - (b.time as number));

    candleSeries.setData(chartData);

    // Add signal markers
    if (marketStore.signals.length > 0) {
        const markers = marketStore.signals.map((signal: Signal) => ({
            time: new Date(signal.timestamp).getTime() / 1000 as any,
            position: signal.type === 'BUY' ? 'belowBar' as const : 'aboveBar' as const,
            color: signal.type === 'BUY' ? '#10b981' : '#ef4444',
            shape: signal.type === 'BUY' ? 'arrowUp' as const : 'arrowDown' as const,
            text: signal.type,
        }));

        (candleSeries as any).setMarkers(markers);
    }

    // Fit content only if explicitly requested?
    // chart?.timeScale().fitContent();
}

// Watch for resize
watch([width, height], () => {
    if (chart && width.value && height.value) {
        chart.applyOptions({
            width: width.value,
            height: isFullscreen.value ? height.value : Math.min(height.value, 400)
        });
    }
});

// Watch for data changes
watch(() => marketStore.ohlcvData, () => {
    updateChartData();
}, { deep: true });

// Watch for fullscreen changes
watch(isFullscreen, () => {
    nextTick(() => {
        if (chart && width.value && height.value) {
            chart.applyOptions({
                width: width.value,
                height: height.value
            });
            chart.timeScale().fitContent();
        }
    });
});
</script>

<style scoped>
.chart-page {
    background: #0f0f23;
}

/* Modern Interval Selector */
.interval-selector-wrapper {
    display: flex;
    justify-content: center;
    margin: -16px 8px 16px 8px;
    /* Negative margin to pull it up closer to chart */
    position: relative;
    z-index: 10;
}

.interval-selector.modern-glass {
    background: rgba(43, 43, 67, 0.4);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 4px;
    display: flex;
    gap: 4px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.interval-btn {
    background: transparent;
    border: none;
    color: #d1d4dc;
    padding: 6px 16px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    outline: none;
}

.interval-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: white;
}

.interval-btn.active {
    background: #2563eb;
    /* Primary Blue or could use Green #10b981 */
    color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Adjust Chart Container margin to account for selector overlap if desired, 
   or just normal spacing. Here I simply restore normal layout behavior. */
.chart-container {
    position: relative;
    width: 100%;
    height: 350px;
    background: #1a1a2e;
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

.chart-legend {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #d1d4dc;
    z-index: 5;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
}

.legend-item .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.legend-item.buy .dot {
    background: #10b981;
}

.legend-item.sell .dot {
    background: #ef4444;
}

.signal-summary {
    display: flex;
    justify-content: space-around;
}

.signal-stat {
    text-align: center;
}

.signal-stat .label {
    display: block;
    font-size: 12px;
    color: var(--f7-text-color);
    opacity: 0.7;
}

.signal-stat .value {
    display: block;
    font-size: 24px;
    font-weight: bold;
}

.signal-stat .value.buy {
    color: #10b981;
}

.signal-stat .value.sell {
    color: #ef4444;
}

/* Asset Details */
.asset-details-card {
    background: #1a1a2e;
    border-radius: 16px;
    margin: 16px 8px;
    color: white;
}

.header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
}

.asset-name {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
}

.asset-ticker {
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    font-weight: 500;
}

.asset-logo-large {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.1);
}

.stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
}

.stat-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.stat-item .label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.stat-item .value {
    font-size: 15px;
    font-weight: 600;
}

.description-block {
    margin-bottom: 24px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.description-text {
    font-size: 14px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.8);
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin: 0;
}

.actions-block {
    display: flex;
    gap: 12px;
}

.details-loading {
    display: flex;
    justify-content: center;
    padding: 32px;
}
</style>
