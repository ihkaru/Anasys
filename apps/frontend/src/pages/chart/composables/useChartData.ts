import { type Ref, watch } from "vue";
import type { Signal } from "../../../stores/market";
import { useSettingsStore } from "../../../stores/settings";
import { createLogger } from "../../../utils/logger";
import { formatOHLCVForChart, formatSignalMarkers, type OHLCVData } from "../utils/chart-formatters";

const logger = createLogger("useChartData");

export function useChartData(candleSeries: Ref<any>, ohlcvData: Ref<OHLCVData[]>, signals: Ref<Signal[]>) {
	const settingsStore = useSettingsStore();

	function updateData() {
		if (!candleSeries.value) return;

		console.time("[ChartFormat]");
		const chartData = ohlcvData.value.length > 0 
			? formatOHLCVForChart(ohlcvData.value, settingsStore.timezoneMode)
			: [];
		console.timeEnd("[ChartFormat]");

		try {
			candleSeries.value.setData(chartData);
			if (chartData.length > 0) {
				const first = chartData[0];
				const last = chartData[chartData.length - 1];
				logger.debug(`Chart updated with ${chartData.length} candles. Range: ${first.time} -> ${last.time}`);
			} else {
				logger.debug("Chart cleared (no data)");
			}
		} catch (e) {
			console.error("[useChartData] Error in setData", e);
		}
	}

	function updateMarkers() {
		if (!candleSeries.value || signals.value.length === 0) return;

		const markers = formatSignalMarkers(signals.value, settingsStore.timezoneMode);
		candleSeries.value.setMarkers(markers);
	}

	function updateAll() {
		updateData();
		updateMarkers();
	}

	// Auto-update on data changes with DEBOUNCE to prevent blocking
	// NOTE: { flush: 'post' } defers execution until after DOM updates
	let updateTimeout: ReturnType<typeof setTimeout> | null = null;
	function debouncedUpdateData() {
		if (updateTimeout) clearTimeout(updateTimeout);
		updateTimeout = setTimeout(updateData, 16); // ~1 frame (60fps)
	}

	watch(ohlcvData, debouncedUpdateData, { flush: "post" });
	watch(signals, updateMarkers, { deep: true, flush: "post" });

	// Re-render when timezone setting changes
	watch(
		() => settingsStore.timezoneMode,
		() => {
			updateAll();
		},
	);

	return {
		updateData,
		updateMarkers,
		updateAll,
	};
}
