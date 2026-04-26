<template>
    <div ref="chartContainerRef" class="chart-container" :class="{ 'fullscreen': isFullscreen }">
        <div ref="chartRef" class="chart-element"></div>

        <!-- Timezone Indicator -->
        <div class="timezone-badge" :title="timezoneTooltip">
            <span class="tz-icon">🕒</span>
            <span class="tz-label">{{ settingsStore.timezoneLabel }}</span>
        </div>

        <div v-if="loading" class="chart-loading">
            <f7-preloader></f7-preloader>
        </div>

        <ChartLegend v-if="hasSignals" />
    </div>
</template>

<script setup lang="ts">
import { useFullscreen } from "@vueuse/core";
import { computed, onMounted, onUnmounted, ref, toRef } from "vue";
import type { Signal } from "../../../stores/market";
import { useSettingsStore } from "../../../stores/settings";
import { useChart } from "../composables/useChart";
import { useChartData } from "../composables/useChartData";
import { useInfiniteScroll } from "../composables/useInfiniteScroll";
import type { OHLCVData } from "../utils/chart-formatters";
import ChartLegend from "./ChartLegend.vue";

const props = defineProps<{
	ohlcvData: OHLCVData[];
	signals: Signal[];
	loading?: boolean;
	onLoadMore?: () => Promise<number>;
}>();

const emit = defineEmits<(e: "load-more") => void>();

const chartRef = ref<HTMLDivElement | null>(null);
const chartContainerRef = ref<HTMLDivElement | null>(null);
const settingsStore = useSettingsStore();

const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(chartContainerRef);
const hasSignals = computed(() => props.signals.length > 0);

const timezoneTooltip = computed(() => {
	return settingsStore.timezoneMode === "local"
		? "Displaying times in your local timezone"
		: "Displaying times in US market timezone (EST/EDT)";
});

const { chart, candleSeries, initChart, destroyChart, fitContent, resizeChart } = useChart(chartRef, isFullscreen);

const { updateAll } = useChartData(candleSeries, toRef(props, "ohlcvData"), toRef(props, "signals"));

// Fix: Explicitly define the return type to satisfy useInfiniteScroll
const handleInfiniteLoad = async (): Promise<number | boolean | undefined> => {
	if (props.onLoadMore) {
		return await props.onLoadMore();
	}
	emit("load-more");
	return undefined;
};

const {
	subscribe: subscribeScroll,
	unsubscribe: unsubscribeScroll,
	reset: resetScroll,
} = useInfiniteScroll(chart, handleInfiniteLoad);

// FPS Monitor for detecting jank
let frameCount = 0;
let lastFpsTime = performance.now();
let fpsMonitorId: number | null = null;

function measureFPS() {
	frameCount++;
	const now = performance.now();
	if (now - lastFpsTime >= 1000) {
		const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
		if (fps < 50) {
			console.log(`%c[FPS] ⚠️ Low FPS detected: ${fps}`, "color: #FF5722; font-weight: bold");
		}
		frameCount = 0;
		lastFpsTime = now;
	}
	fpsMonitorId = requestAnimationFrame(measureFPS);
}

// Long Task Observer - detects tasks blocking main thread > 50ms
let longTaskObserver: PerformanceObserver | null = null;
function startLongTaskObserver() {
	if ("PerformanceObserver" in window) {
		try {
			longTaskObserver = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					// @ts-expect-error - attribution is available on PerformanceLongTaskTiming
					const attribution = entry.attribution?.[0];
					const details = attribution
						? {
								name: attribution.name,
								containerName: attribution.containerName,
								containerSrc: attribution.containerSrc,
								containerId: attribution.containerId,
							}
						: "no attribution";
					console.log(
						`%c[LongTask] ⚠️ Blocking task: ${entry.duration.toFixed(1)}ms`,
						"color: #E91E63; font-weight: bold",
						details,
					);
				}
			});
			longTaskObserver.observe({ entryTypes: ["longtask"] });
		} catch (e) {
			// longtask not supported
		}
	}
}

onMounted(() => {
	initChart();
	// Now chart.value is set inside useChart
	subscribeScroll();
	updateAll();

	// Start FPS monitoring
	measureFPS();
	startLongTaskObserver();

	// Initial fit (small delay to ensure rendering)
	setTimeout(() => {
		fitContent();
	}, 100);
});

onUnmounted(() => {
	unsubscribeScroll();
	destroyChart();

	// Stop FPS monitoring
	if (fpsMonitorId) {
		cancelAnimationFrame(fpsMonitorId);
	}
	if (longTaskObserver) {
		longTaskObserver.disconnect();
	}
});

// Expose methods to parent - OPTIMIZED: avoid full format for single candle
function updateCandle(candle: OHLCVData) {
	if (candleSeries.value) {
		// Direct update without full formatOHLCVForChart overhead
		const time = new Date(candle.timestamp).getTime() / 1000;
		candleSeries.value.update({
			time,
			open: candle.open,
			high: candle.high,
			low: candle.low,
			close: candle.close,
		});
	}
}

defineExpose({
	toggleFullscreen,
	fitContent,
	updateCandle,
	resetScroll,
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
    /* Removed: transition: all 0.3s ease; - causes jank during zoom/pan */
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

.timezone-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    z-index: 5;
    cursor: help;
    backdrop-filter: blur(4px);
}

.timezone-badge .tz-icon {
    font-size: 12px;
}

.timezone-badge .tz-label {
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
</style>
