
import { watch, type Ref } from 'vue';
import { type Signal } from '../../../stores/market';
import { useSettingsStore } from '../../../stores/settings';
import { createLogger } from '../../../utils/logger';
import { formatOHLCVForChart, formatSignalMarkers, type OHLCVData } from '../utils/chart-formatters';

const logger = createLogger('useChartData');

export function useChartData(
  candleSeries: Ref<any>,
  ohlcvData: Ref<OHLCVData[]>,
  signals: Ref<Signal[]>
) {
  const settingsStore = useSettingsStore();
  
  function updateData() {
    if (!candleSeries.value || ohlcvData.value.length === 0) return;
    
    // === DEBUG LOGGING ===
    logger.info(`=== CHART DATA DEBUG ===`);
    logger.info(`Total candles received: ${ohlcvData.value.length}`);
    
    // Log first 10 raw timestamps to see what's coming from store
    const rawSamples = ohlcvData.value.slice(0, 10);
    logger.info(`First 10 raw timestamps from store:`);
    rawSamples.forEach((c, i) => {
      const ts = new Date(c.timestamp);
      const minute = ts.getMinutes();
      const hourAligned = minute === 0;
      logger.info(`  [${i}] ${c.timestamp} -> minute=${minute} ${hourAligned ? '✓' : '⚠️ NOT HOUR-ALIGNED'}`);
    });
    
    // Check for non-hour-aligned candles in the entire dataset
    const nonHourAligned = ohlcvData.value.filter(c => {
      const ts = new Date(c.timestamp);
      return ts.getMinutes() !== 0;
    });
    
    if (nonHourAligned.length > 0) {
      logger.warn(`⚠️ Found ${nonHourAligned.length} candles NOT aligned to hour boundary!`);
      logger.warn(`First 5 non-aligned:`);
      nonHourAligned.slice(0, 5).forEach(c => {
        const ts = new Date(c.timestamp);
        logger.warn(`  ${c.timestamp} (minute=${ts.getMinutes()})`);
      });
    } else {
      logger.info(`✓ All ${ohlcvData.value.length} candles are hour-aligned`);
    }
    // === END DEBUG ===
    
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
  watch(() => settingsStore.timezoneMode, () => {
    updateAll();
  });
  
  return {
    updateData,
    updateMarkers,
    updateAll,
  };
}
