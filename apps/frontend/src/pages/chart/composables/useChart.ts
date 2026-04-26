import { useElementSize } from "@vueuse/core";
import { createChart, type IChartApi } from "lightweight-charts";
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

		chart.value = createChart(
			containerRef.value,
			getChartOptions(
				getTheme(),
				width.value,
				height.value,
				isFullscreen.value,
				settingsStore.timezoneMode === "local" ? "local" : "America/New_York",
			),
		);

		candleSeries.value = chart.value.addCandlestickSeries(getCandlestickSeriesOptions(getTheme()));
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
