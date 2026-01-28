
import { watch, type Ref } from 'vue';
import { type Signal } from '../../../stores/market';
import { formatOHLCVForChart, formatSignalMarkers, type OHLCVData } from '../utils/chart-formatters';

export function useChartData(
  candleSeries: Ref<any>,
  ohlcvData: Ref<OHLCVData[]>,
  signals: Ref<Signal[]>
) {
  function updateData() {
    if (!candleSeries.value || ohlcvData.value.length === 0) return;
    
    const chartData = formatOHLCVForChart(ohlcvData.value);
    candleSeries.value.setData(chartData);
  }
  
  function updateMarkers() {
    if (!candleSeries.value || signals.value.length === 0) return;
    
    const markers = formatSignalMarkers(signals.value);
    candleSeries.value.setMarkers(markers);
  }
  
  function updateAll() {
    updateData();
    updateMarkers();
  }
  
  // Auto-update on data changes
  watch(ohlcvData, updateData, { deep: true });
  watch(signals, updateMarkers, { deep: true });
  
  return {
    updateData,
    updateMarkers,
    updateAll,
  };
}
