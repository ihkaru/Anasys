import { useElementSize } from '@vueuse/core';
import { CandlestickSeries, createChart, type IChartApi } from 'lightweight-charts';
import { onUnmounted, shallowRef, watch, type Ref } from 'vue';
import { useThemeStore } from '../../../stores/theme';
import { DARK_THEME, getCandlestickSeriesOptions, getChartOptions, LIGHT_THEME, type ChartTheme } from '../utils/chart-config';

export function useChart(containerRef: Ref<HTMLElement | null>, isFullscreen: Ref<boolean>) {
  const chart = shallowRef<IChartApi | null>(null);
  const candleSeries = shallowRef<any>(null);
  const themeStore = useThemeStore();
  
  const { width, height } = useElementSize(containerRef);
  
  function getTheme(): ChartTheme {
    return themeStore.isDark ? DARK_THEME : LIGHT_THEME;
  }
  
  function updateChartTheme() {
    if (chart.value) {
      chart.value.applyOptions(
        getChartOptions(getTheme(), width.value, height.value, isFullscreen.value)
      );
    }
  }
  
  function initChart() {
    if (!containerRef.value) return;
    
    chart.value = createChart(
      containerRef.value,
      getChartOptions(getTheme(), width.value, height.value, isFullscreen.value)
    );
    
    candleSeries.value = chart.value.addSeries(
      CandlestickSeries,
      getCandlestickSeriesOptions(getTheme())
    );
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
        chart.value.applyOptions(
            getChartOptions(getTheme(), width.value, height.value, isFullscreen.value)
        );
    }
  }
  
  function fitContent() {
    chart.value?.timeScale().fitContent();
  }
  
  // Auto-resize on dimension changes
  watch([width, height, isFullscreen], () => {
     resizeChart();
  });
  
  // Watch theme store for changes (manual toggle or system change)
  watch(() => themeStore.isDark, () => {
    updateChartTheme();
  });
  
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
