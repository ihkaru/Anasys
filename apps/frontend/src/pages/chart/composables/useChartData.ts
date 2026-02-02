import { type Ref, watch } from "vue";
import type { Signal } from "../../../stores/market";
import { useSettingsStore } from "../../../stores/settings";
import { createLogger } from "../../../utils/logger";
import { formatOHLCVForChart, formatSignalMarkers, type OHLCVData } from "../utils/chart-formatters";

const logger = createLogger("useChartData");

export function useChartData(candleSeries: Ref<any>, ohlcvData: Ref<OHLCVData[]>, signals: Ref<Signal[]>) {
	const settingsStore = useSettingsStore();

	function updateData() {
		if (!candleSeries.value || ohlcvData.value.length === 0) return;

		// Debug: log data summary
		logger.debug(`Updating chart with ${ohlcvData.value.length} candles`);

		if (ohlcvData.value.length > 0) {
			const first = ohlcvData.value[0];
			const last = ohlcvData.value[ohlcvData.value.length - 1];
			logger.debug(`Range: ${first.timestamp} -> ${last.timestamp}`);
		}

		const chartData = formatOHLCVForChart(ohlcvData.value, settingsStore.timezoneMode);
		candleSeries.value.setData(chartData);
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

	// Auto-update on data changes
	watch(ohlcvData, updateData, { deep: true });
	watch(signals, updateMarkers, { deep: true });

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
