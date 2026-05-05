import { useElementSize } from "@vueuse/core";
import { createChart, CandlestickSeries, type IChartApi } from "lightweight-charts";
import { onUnmounted, type Ref, shallowRef, watch } from "vue";
import { useSettingsStore } from "../../../stores/settings";
import { useThemeStore } from "../../../stores/theme";
import {
	type ChartTheme,
	DARK_THEME,
	getCandlestickSeriesOptions,
	getChartOptions,
	LIGHT_THEME,
} from "../utils/chart-config";

export function useChart(containerRef: Ref<HTMLElement | null>, isFullscreen: Ref<boolean>) {
	const chart = shallowRef<IChartApi | null>(null);
	const candleSeries = shallowRef<any>(null);
	const themeStore = useThemeStore();
	const settingsStore = useSettingsStore(); // Access settings

	const { width, height } = useElementSize(containerRef);

	function getTheme(): ChartTheme {
		return themeStore.isDark ? DARK_THEME : LIGHT_THEME;
	}

	function updateChartOptions() {
		if (chart.value) {
			// console.log(`%c[Chart] updateChartOptions called`, 'color: #2196F3');
			chart.value.applyOptions(
				getChartOptions(
					getTheme(),
					width.value,
					height.value,
					isFullscreen.value,
					settingsStore.timezoneMode === "local" ? "local" : "America/New_York",
				),
			);
		}
	}

	function initChart() {
		if (!containerRef.value) return;

		try {
			// console.log(`%c[Chart] Creating chart instance...`, 'color: #9C27B0');

			// 1. Create a pure, non-reactive instance first
			const rawChart = createChart(
				containerRef.value,
				getChartOptions(
					getTheme(),
					width.value,
					height.value,
					isFullscreen.value,
					settingsStore.timezoneMode === "local" ? "local" : "America/New_York",
				),
			);

			// 2. Call the method BEFORE giving it to Vue's reactivity system
			if (!rawChart || typeof rawChart.addSeries !== "function") {
				console.error("[Chart] rawChart is invalid or missing addSeries", rawChart);
				// Diagnostic dump
				const proto = rawChart ? Object.getPrototypeOf(rawChart) : null;
				console.log("rawChart Prototype methods:", proto ? Object.getOwnPropertyNames(proto) : "null");
				return;
			}

			const rawCandleSeries = rawChart.addSeries(CandlestickSeries, getCandlestickSeriesOptions(getTheme()));

			// 3. ONLY THEN assign to shallowRefs
			chart.value = rawChart;
			candleSeries.value = rawCandleSeries;

			// console.log("[Chart] Chart initialized successfully");
		} catch (e) {
			console.error("[Chart] Exception during initChart:", e);
		}
	}

	function destroyChart() {
		if (chart.value) {
			chart.value.remove();
			chart.value = null;
			candleSeries.value = null;
		}
	}

	function resizeChart() {
		if (chart.value && width.value && height.value) {
			// console.log(`%c[Chart] resizeChart called: ${width.value}x${height.value}`, 'color: #4CAF50');
			updateChartOptions();
		}
	}

	function fitContent() {
		chart.value?.timeScale().fitContent();
	}

	// Auto-resize on dimension changes
	watch([width, height, isFullscreen], () => {
		resizeChart();
	});

	// Watch theme store for changes
	watch(
		() => themeStore.isDark,
		() => {
			updateChartOptions();
		},
	);

	// Watch timezone settings
	watch(
		() => settingsStore.timezoneMode,
		() => {
			updateChartOptions();
		},
	);

	onUnmounted(destroyChart);

	return {
		chart,
		candleSeries,
		initChart,
		destroyChart,
		resizeChart,
		fitContent,
	};
}
