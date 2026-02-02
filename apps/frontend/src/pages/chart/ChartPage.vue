<template>
    <f7-page class="chart-page">
        <!-- Custom Navbar with Real-time Price -->
        <f7-navbar back-link="Back">
            <f7-nav-title>
                <div class="nav-title-content">
                    <div class="title-row">
                        <span class="ticker">{{ marketStore.selectedSymbol || 'Chart' }}</span>
                        <!-- Source Badge -->
                        <a href="#" class="source-badge" @click="sourcePopoverOpen = true; sourcePopoverTarget = $event.target">
                            {{ currentSourceLabel }}
                            <f7-icon f7="chevron_down" size="10px"></f7-icon>
                        </a>
                    </div>
                    <div v-if="primaryQuoteInfo" class="price-info-wrapper">
                    <div class="main-price-row">
                        <span v-if="primaryQuoteInfo.isExtended" class="ext-badge">{{ primaryQuoteInfo.label }}</span>
                        <span class="price">{{ formatPrice(primaryQuoteInfo.price) }}</span>
                        <span class="change" :class="primaryQuoteInfo.changePercent >= 0 ? 'up' : 'down'">
                            {{ (primaryQuoteInfo.change || 0) >= 0 ? '+' : '' }}{{ (primaryQuoteInfo.change || 0).toFixed(2) }}
                            ({{ primaryQuoteInfo.changePercent >= 0 ? '+' : '' }}{{ primaryQuoteInfo.changePercent.toFixed(2) }}%)
                        </span>
                    </div>
                    <div v-if="secondaryQuoteInfo" class="secondary-info">
                        Reg: {{ formatPrice(secondaryQuoteInfo.price) }}
                        <span :class="secondaryQuoteInfo.changePercent >= 0 ? 'sec-up' : 'sec-down'">
                             ({{ secondaryQuoteInfo.changePercent.toFixed(2) }}%)
                        </span>
                    </div>
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

        <!-- Source Popover -->
        <f7-popover :opened="sourcePopoverOpen" :target="sourcePopoverTarget" @popover:closed="sourcePopoverOpen = false">
            <f7-list>
                <f7-list-item title="Yahoo Finance (Default)" @click="switchSource('YAHOO')" :checked="marketStore.selectedSource === 'YAHOO'" link="#" popover-close>
                     <template #after><f7-icon v-if="marketStore.selectedSource==='YAHOO'" f7="checkmark_alt" size="16"></f7-icon></template>
                </f7-list-item>
                <f7-list-item title="TradingView" @click="switchSource('TRADINGVIEW')" :checked="marketStore.selectedSource === 'TRADINGVIEW'" link="#" popover-close>
                     <template #after><f7-icon v-if="marketStore.selectedSource==='TRADINGVIEW'" f7="checkmark_alt" size="16"></f7-icon></template>
                </f7-list-item>
            </f7-list>
        </f7-popover>

        <TradingChart ref="chartRef" :ohlcv-data="marketStore.ohlcvData" :signals="marketStore.signals"
            :loading="marketStore.loading" @load-more="handleLoadMore" />

        <div class="controls-row">
            <TimeframeSelector v-model="selectedTimeframe" @update:model-value="handleTimeframeChange" />
        </div>

        <SignalSummaryCard v-if="!isFullscreen" :signals="marketStore.signals" />

        <AssetDetailsCard v-if="!isFullscreen" :asset="marketStore.selectedSymbolData" />

        <!-- NEW: Financials Section -->
        <FinancialsSection v-if="!isFullscreen && financials" :financials="financials" :analyst="analystRatings"
            :current-price="primaryQuoteInfo?.price || 0" />

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
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useMarketStore } from "../../stores/market";
import { getExtendedHoursInfo } from "../../utils/formatters";
import type TradingChart from "./components/TradingChart.vue";

const props = defineProps<{
	ticker?: string;
}>();

const marketStore = useMarketStore();
const chartRef = ref<InstanceType<typeof TradingChart> | null>(null);
const selectedTimeframe = ref("1M");
const selectedInterval = ref("1h"); // Auto-derived from timeframe (1M = 1h)
const isFullscreen = ref(false);
const recommendations = ref<any[]>([]);
const financials = ref<any>(null);
const analystRatings = ref<any>(null);
const earnings = ref<any>(null);
const currentQuote = ref<any>(null);

// Source Selector State
const sourcePopoverOpen = ref(false);
const sourcePopoverTarget = ref<any>(null);

const currentSourceLabel = computed(() => {
	return marketStore.selectedSource === "YAHOO" ? "Yahoo" : "TradingView";
});

// Extended hours info for secondary display
const extendedHoursInfo = computed(() => {
	if (!currentQuote.value) return null;
	return getExtendedHoursInfo(currentQuote.value);
});

// Primary info (Extended takes priority)
const primaryQuoteInfo = computed(() => {
	if (extendedHoursInfo.value) {
		return {
			price: extendedHoursInfo.value.price,
			change: extendedHoursInfo.value.change,
			changePercent: extendedHoursInfo.value.changePercent,
			label: extendedHoursInfo.value.label,
			isExtended: true,
		};
	}
	if (currentQuote.value) {
		return {
			price: currentQuote.value.price,
			change: currentQuote.value.change,
			changePercent: currentQuote.value.changePercent,
			label: null,
			isExtended: false,
		};
	}
	return null;
});

// Secondary info (Regular close if Extended active)
const secondaryQuoteInfo = computed(() => {
	if (extendedHoursInfo.value && currentQuote.value) {
		return {
			price: currentQuote.value.price,
			change: currentQuote.value.change,
			changePercent: currentQuote.value.changePercent,
			label: "Reg Close",
		};
	}
	return null;
});

function switchSource(source: string) {
	if (marketStore.selectedSource === source) return;
	handleSourceChange(source);
}

// Professional timeframe-to-interval mapping
// Based on US market trading hours: ~6.5h/day (9:30 AM - 4:00 PM EST)
// ~22 trading days per month, ~252 trading days per year
function getTimeframeConfig(timeframe: string): { interval: string; limit: number } {
	switch (timeframe) {
		case "1D":
			return { interval: "5m", limit: 80 }; // 6.5h × 12 = 78 candles (1 trading day)
		case "1W":
			return { interval: "30m", limit: 70 }; // 6.5h × 2/h × 5 days ≈ 65 candles
		case "1M":
			return { interval: "1h", limit: 145 }; // 6.5h × 22 days ≈ 143 candles
		case "3M":
			return { interval: "4h", limit: 110 }; // ~66 trading days × ~1.6 candles/day
		case "1Y":
			return { interval: "1d", limit: 252 }; // 252 trading days
		case "ALL":
			return { interval: "1d", limit: 2000 }; // Max history
		default:
			return { interval: "1h", limit: 100 };
	}
}

async function handleTimeframeChange(timeframe: string) {
	if (!marketStore.selectedSymbol) return;
	selectedTimeframe.value = timeframe;
	lastLoadedTimestamp.value = null; // Reset for new timeframe

	const config = getTimeframeConfig(timeframe);
	selectedInterval.value = config.interval;

	// Clear old data to prevent mixing different intervals
	marketStore.ohlcvData = [];

	await marketStore.fetchHistory(marketStore.selectedSymbol, config.interval, config.limit);
	chartRef.value?.fitContent();
}

async function handleSourceChange(source: string) {
	if (!marketStore.selectedSymbol) return;
	console.log("[ChartPage] Source changed to:", source);
	marketStore.selectSource(source);

	// Clear old data to prevent mixing different sources
	marketStore.ohlcvData = [];

	// Reload history with current timeframe config
	lastLoadedTimestamp.value = null;
	const config = getTimeframeConfig(selectedTimeframe.value);
	await marketStore.fetchHistory(marketStore.selectedSymbol, config.interval, config.limit);
	chartRef.value?.fitContent();

	// Reload quote for the new source
	loadBackgroundData(marketStore.selectedSymbol);
}

const lastLoadedTimestamp = ref<string | null>(null);

async function handleLoadMore() {
	if (!marketStore.selectedSymbol || marketStore.ohlcvData.length === 0) {
		// console.debug('[ChartPage] LoadMore skipped: No symbol or data');
		return 0;
	}

	const oldestCandle = marketStore.ohlcvData[0];
	if (!oldestCandle) return 0;

	// Prevent infinite loop if we're requesting the same timestamp
	if (lastLoadedTimestamp.value === oldestCandle.timestamp) {
		// console.debug('[ChartPage] Duplicate load request for timestamp:', oldestCandle.timestamp);
		return 0; // Explicitly return 0 to stop spinner but maybe not stop infinite scroll permanently?
		// Actually if we return 0, useInfiniteScroll sets hasMoreHistory=false.
		// This is correct if we truly have no more data.
	}

	lastLoadedTimestamp.value = oldestCandle.timestamp;

	try {
		const result = await marketStore.fetchHistory(
			marketStore.selectedSymbol,
			selectedInterval.value,
			500,
			oldestCandle.timestamp,
		);

		const count = result ? result.length : 0;
		console.log(`[ChartPage] handleLoadMore fetched ${count} items`);
		return count;
	} catch (e) {
		console.error("[ChartPage] handleLoadMore error:", e);
		return 0;
	}
}

function getIntervalLimit(interval: string): number {
	if (interval === "1d" || interval === "1wk") return 365;
	if (interval === "15m") return 200;
	return 500;
}

function formatPrice(price: number) {
	if (!price) return "-";
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
	console.time("LoadHistory");
	console.log("[ChartPage] Starting fetchHistory...");
	const config = getTimeframeConfig(selectedTimeframe.value);
	selectedInterval.value = config.interval;
	await marketStore.fetchHistory(ticker, config.interval, config.limit);
	console.log("[ChartPage] fetchHistory done.");
	console.timeEnd("LoadHistory");

	// Fit content immediately after history loaded
	nextTick(() => {
		console.log("[ChartPage] fitContent nextTick calling...");
		chartRef.value?.fitContent();
		console.log("[ChartPage] fitContent called.");
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
	marketStore.fetchQuote(ticker).then((quote) => {
		if (quote) currentQuote.value = quote;
	});

	// 2. Recommendations
	marketStore.fetchRecommendations(ticker).then((recs) => {
		console.log("[ChartPage] recommendations:", recs);
		recommendations.value = recs || [];
	});

	// 3. Financials
	marketStore.fetchFinancials(ticker).then((data) => {
		console.log("[ChartPage] financials:", data);
		financials.value = data;
	});

	// 4. Analyst Ratings
	marketStore.fetchAnalyst(ticker).then((data) => {
		console.log("[ChartPage] analyst:", data);
		analystRatings.value = data;
	});

	// 5. Earnings
	marketStore.fetchEarnings(ticker).then((data) => {
		console.log("[ChartPage] earnings:", data);
		earnings.value = data;
	});
}

function openRecommendation(item: any) {
	console.log("[ChartPage] Opening recommendation:", item.ticker);
	// Navigate to the recommended asset by reloading data
	loadInitialData(item.ticker);
}

onMounted(async () => {
	const ticker = props.ticker || marketStore.selectedSymbol;
	if (ticker) {
		await loadInitialData(ticker);
	}
});

watch(
	() => props.ticker,
	async (newTicker) => {
		if (newTicker) {
			await loadInitialData(newTicker);
		}
	},
);
</script>

<style scoped>
.chart-page {
    background: var(--chart-bg, var(--f7-page-bg-color));
}

.details-loading {
    display: flex;
    justify-content: center;
    padding: 32px;
}

.controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-right: 16px; 
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
    color: var(--positive-color, #10b981);
}

.change.down {
    color: var(--negative-color, #ef4444);
}

.title-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.source-badge {
    font-size: 10px;
    background: rgba(var(--f7-theme-color-rgb), 0.15);
    color: var(--f7-theme-color);
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 2px;
    cursor: pointer;
    text-decoration: none;
}

/* Extended Hours Styles */
.extended-hours {
    font-size: 10px;
    opacity: 0.7;
    margin-left: 4px;
}

.extended-hours .ext-down {
    color: var(--negative-color, #ef4444);
}

.price-info-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.1;
}

.main-price-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 500;
}

.ext-badge {
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 3px;
    border-radius: 2px;
    background: var(--f7-theme-color);
    color: #fff;
    opacity: 0.9;
}

.secondary-info {
    font-size: 9px;
    opacity: 0.6;
    display: flex;
    gap: 3px;
}

.secondary-info .sec-up { color: var(--positive-color, #10b981); }
.secondary-info .sec-down { color: var(--negative-color, #ef4444); }
</style>
