<template>
	<f7-page class="chart-page">
		<!-- Custom Navbar with Real-time Price -->
		<f7-navbar back-link="Back">
			<f7-nav-title>
				<div class="nav-title-content">
					<div class="title-row">
						<span class="ticker">{{ marketStore.selectedSymbol || 'Chart' }}</span>
					</div>
					<div v-if="primaryQuoteInfo" class="price-info-wrapper">
						<div class="main-price-row">
							<span v-if="primaryQuoteInfo.isExtended" class="ext-badge">{{ primaryQuoteInfo.label
							}}</span>
							<span class="price">{{ formatPrice(primaryQuoteInfo.price, primaryQuoteInfo.currency)
							}}</span>
							<span class="change" :class="primaryQuoteInfo.changePercent >= 0 ? 'up' : 'down'">
								{{ (primaryQuoteInfo.change || 0) >= 0 ? '+' : '' }}{{ (primaryQuoteInfo.change ||
									0).toFixed(2) }}
								({{ primaryQuoteInfo.changePercent >= 0 ? '+' : '' }}{{
									primaryQuoteInfo.changePercent.toFixed(2) }}%)
							</span>
						</div>
						<div v-if="secondaryQuoteInfo" class="secondary-info">
							Reg: {{ formatPrice(secondaryQuoteInfo.price, secondaryQuoteInfo.currency) }}
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

		<TradingChart ref="chartRef" :key="marketStore.selectedSymbol"
			:ohlcv-data="marketStore.ohlcvData" :signals="marketStore.signals" :loading="marketStore.historyLoading"
			:on-load-more="handleLoadMore" />

		<div class="controls-row">
			<TimeframeSelector v-model="selectedTimeframe" @update:model-value="handleTimeframeChange" />
		</div>

		<SignalSummaryCard v-if="!isFullscreen" :signals="marketStore.signals" />

		<AssetDetailsCard v-if="!isFullscreen" :asset="marketStore.selectedSymbolData" />

		<!-- NEW: Financials Section -->
		<FinancialsSection v-if="!isFullscreen && financials" :financials="financials" :analyst="analystRatings"
			:current-price="primaryQuoteInfo?.price || 0" :symbol="marketStore.selectedSymbol" />

		<!-- NEW: Earnings Section -->
		<EarningsSection v-if="!isFullscreen && earnings" :earnings="earnings" :symbol="marketStore.selectedSymbol" />

		<RecommendationsSection v-if="!isFullscreen && recommendations.length > 0" :recommendations="recommendations"
			@click="openRecommendation" />

		<div v-if="!isFullscreen && !marketStore.selectedSymbolData && marketStore.loading" class="details-loading">
			<f7-preloader />
		</div>
	</f7-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { subscribeOHLCV, subscribeQuotes } from "../../composables/useRealtimeQuotes";
import { useMarketStore } from "../../stores/market";
import { formatPrice, getExtendedHoursInfo } from "../../utils/formatters";
import AssetDetailsCard from "./components/AssetDetailsCard.vue";
import EarningsSection from "./components/EarningsSection.vue";
import FinancialsSection from "./components/FinancialsSection.vue";
import RecommendationsSection from "./components/RecommendationsSection.vue";
import SignalSummaryCard from "./components/SignalSummaryCard.vue";
import TimeframeSelector from "./components/TimeframeSelector.vue";
import type TradingChart from "./components/TradingChart.vue";

// Throttle helper for chart updates
let lastChartUpdate = 0;
const CHART_UPDATE_THROTTLE_MS = 100; // Max 10 updates per second

const props = defineProps<{
	ticker?: string;
}>();

const marketStore = useMarketStore();
const chartRef = ref<InstanceType<typeof TradingChart> | null>(null);
const selectedTimeframe = ref("1d");
const selectedInterval = ref("1d"); // Default interval
const isFullscreen = ref(false);
const recommendations = ref<any[]>([]);
const financials = ref<any>(null);
const analystRatings = ref<any>(null);
const earnings = ref<any>(null);
const currentQuote = ref<any>(null);

// ==================== Real-Time Subscriptions ====================

let unsubscribeQuote: (() => void) | null = null;
let unsubscribeOHLCV: (() => void) | null = null;

// Subscribe to real-time updates for current symbol
function setupRealtimeSubscriptions(ticker: string, interval: string, source: string) {
	// Clean up previous subscriptions
	if (unsubscribeQuote) {
		unsubscribeQuote();
		unsubscribeQuote = null;
	}
	if (unsubscribeOHLCV) {
		unsubscribeOHLCV();
		unsubscribeOHLCV = null;
	}

	console.log(`[ChartPage RT] Setting up subscriptions for ${ticker} (${source})`);

	// Subscribe to quote updates (for navbar price AND live candle)
	unsubscribeQuote = subscribeQuotes(
		[ticker],
		(update) => {
			// Filter invalid updates
			if (!update.price || update.price <= 0) return;

			// Update currentQuote for navbar display
			currentQuote.value = {
				...currentQuote.value,
				price: update.price,
				change: update.change,
				changePercent: update.changePercent,
				volume: update.volume,
			};
			// console.log(`[ChartPage RT] Quote: ${ticker} $${update.price}`);

			// Update Chart Candle from Quote (THROTTLED to prevent UI blocking)
			const now = Date.now();
			if (now - lastChartUpdate < CHART_UPDATE_THROTTLE_MS) {
				return; // Skip this update, too soon
			}
			lastChartUpdate = now;

			// Since stocks (Yahoo/TradingView polled) don't send OHLCV updates, drive it from Quotes
			const data = marketStore.ohlcvData;
			if (data.length > 0) {
				const lastIndex = data.length - 1;
				const lastCandle = data[lastIndex];

				// Simple update: assumes the quote belongs to the current last candle interval
				const newCandle = {
					...lastCandle,
					close: update.price,
					high: Math.max(lastCandle.high, update.price),
					low: Math.min(lastCandle.low, update.price),
				};

				// Update store data
				marketStore.ohlcvData[lastIndex] = newCandle;

				// Imperatively update the chart for performance
				if (chartRef.value) {
					chartRef.value.updateCandle(newCandle);
				}
			}
		},
		source,
	);

	// Subscribe to OHLCV updates (for live candles)
	unsubscribeOHLCV = subscribeOHLCV(
		ticker,
		interval,
		(update) => {
			// OPTIMIZED: Direct mutation + imperative chart update
			// Avoids spread copy and full reactivity cascade
			const data = marketStore.ohlcvData;
			if (data.length === 0) return;

			const lastIndex = data.length - 1;
			const lastCandle = data[lastIndex];
			const updateTime = new Date(update.timestamp).getTime();
			const lastTime = new Date(lastCandle.timestamp).getTime();

			if (updateTime === lastTime) {
				// Update existing candle - direct mutation
				const newCandle = {
					timestamp: lastCandle.timestamp,
					open: lastCandle.open,
					high: Math.max(lastCandle.high, update.high),
					low: Math.min(lastCandle.low, update.low),
					close: update.close,
					volume: update.volume,
				};
				data[lastIndex] = newCandle;

				// Imperatively update chart (no reactivity cascade)
				if (chartRef.value) {
					chartRef.value.updateCandle(newCandle);
				}
			} else if (updateTime > lastTime && update.isClosed) {
				// Append new candle - need to trigger reactivity
				const newCandle = {
					timestamp: new Date(update.timestamp).toISOString(),
					open: update.open,
					high: update.high,
					low: update.low,
					close: update.close,
					volume: update.volume,
				};
				data.push(newCandle);

				// Imperatively update chart
				if (chartRef.value) {
					chartRef.value.updateCandle(newCandle);
				}
			}
			// console.log(`[ChartPage RT] OHLCV: ${ticker} candle updated/appended`);
		},
		source,
	);
}

// Watch for symbol/interval changes and set up real-time subscriptions
watch(
	() => [marketStore.selectedSymbol, selectedInterval.value, marketStore.selectedSymbolData?.provider] as const,
	([symbol, interval, provider]) => {
		console.log(`[ChartPage] Watcher triggered: ${symbol} ${interval} (Provider: ${provider})`);
		if (symbol) {
			// Resolve source: prioritaskan field 'source' (dari search), lalu 'provider' (dari details), fallback 'YAHOO'
			const source = (
				marketStore.selectedSymbolData?.source ||
				marketStore.selectedSymbolData?.provider ||
				"YAHOO"
			).toUpperCase();

			setupRealtimeSubscriptions(symbol, interval, source);
		}
	},
	{ immediate: true },
);

// ==================== Computed Properties ====================

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
			currency: currentQuote.value?.currency,
		};
	}
	if (currentQuote.value) {
		return {
			price: currentQuote.value.price,
			change: currentQuote.value.change,
			changePercent: currentQuote.value.changePercent,
			label: null,
			isExtended: false,
			currency: currentQuote.value.currency,
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
			currency: currentQuote.value.currency,
		};
	}
	return null;
});

function getIntervalLimit(interval: string): number {
	// Standard limits for initial load to ensure a full chart view
	if (interval === "1d" || interval === "1wk" || interval === "1mo") return 500;
	if (interval === "15m" || interval === "30m" || interval === "1h" || interval === "4h") return 500;
	return 500;
}

async function handleTimeframeChange(interval: string) {
	if (!marketStore.selectedSymbol) return;
	selectedTimeframe.value = interval; // The UI selector now provides interval values directly
	selectedInterval.value = interval;
	lastLoadedTimestamp.value = null; // Reset for new timeframe
	chartRef.value?.resetScroll(); // Reset infinite scroll history state

	const limit = getIntervalLimit(interval);
	const source = (
		marketStore.selectedSymbolData?.source ||
		marketStore.selectedSymbolData?.provider ||
		"YAHOO"
	).toUpperCase();

	console.log(`[ChartPage] handleTimeframeChange to ${interval} using source: ${source}`);
	await marketStore.fetchHistory(marketStore.selectedSymbol, interval, limit, undefined, source);
	chartRef.value?.fitContent();
}

const lastLoadedTimestamp = ref<string | null>(null);

async function handleLoadMore() {
	if (!marketStore.selectedSymbol || marketStore.ohlcvData.length === 0) {
		return 0;
	}

	const oldestCandle = marketStore.ohlcvData[0];
	if (!oldestCandle) return 0;

	if (lastLoadedTimestamp.value === oldestCandle.timestamp) {
		return 0;
	}

	lastLoadedTimestamp.value = oldestCandle.timestamp;

	try {
		const source = (
			marketStore.selectedSymbolData?.source ||
			marketStore.selectedSymbolData?.provider ||
			"YAHOO"
		).toUpperCase();

		const result = await marketStore.fetchHistory(
			marketStore.selectedSymbol,
			selectedInterval.value,
			500,
			oldestCandle.timestamp,
			source,
		);

		const count = result ? result.length : 0;
		console.log(`[ChartPage] handleLoadMore fetched ${count} items from ${source}`);
		return count;
	} catch (e) {
		console.error("[ChartPage] handleLoadMore error:", e);
		return 0;
	}
}

async function loadInitialData(ticker: string) {
	marketStore.selectSymbol(ticker);

	marketStore.signals = [];
	recommendations.value = [];
	financials.value = null;
	analystRatings.value = null;
	earnings.value = null;
	currentQuote.value = null;
	lastLoadedTimestamp.value = null; // Reset loop guard

	console.log(`[ChartPage] Loading initial data for ${ticker}...`);

	// CRITICAL: Await symbol details FIRST to get correct 'source/provider' metadata.
	// This prevents fetchHistory from defaulting to 'YAHOO' for Crypto/TV assets.
	await marketStore.fetchSymbolDetails(ticker);

	const interval = selectedTimeframe.value;
	selectedInterval.value = interval;
	const limit = getIntervalLimit(interval);

	// Resolve source from newly fetched metadata
	const source = (
		marketStore.selectedSymbolData?.source ||
		marketStore.selectedSymbolData?.provider ||
		"YAHOO"
	).toUpperCase();

	console.log(`[ChartPage] Starting fetchHistory for ${ticker} (${interval}) from ${source}...`);
	await marketStore.fetchHistory(ticker, interval, limit, undefined, source);

	// Fit content immediately after history loaded
	nextTick(() => {
		if (chartRef.value?.fitContent) {
			chartRef.value.fitContent();
		}
	});

	// Fetch other background data
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
	align-items: flex-start;
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
	align-items: flex-start;
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

.secondary-info .sec-up {
	color: var(--positive-color, #10b981);
}

.secondary-info .sec-down {
	color: var(--negative-color, #ef4444);
}
</style>
