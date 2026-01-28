import { useElementSize } from '@vueuse/core';
import { CandlestickSeries, createChart, type IChartApi } from 'lightweight-charts';
import { onUnmounted, ref, shallowRef, watch, type Ref } from 'vue';
import { DARK_THEME, getCandlestickSeriesOptions, getChartOptions, type ChartTheme } from '../utils/chart-config';

export function useChart(containerRef: Ref<HTMLElement | null>, isFullscreen: Ref<boolean>) {
  const chart = shallowRef<IChartApi | null>(null);
  const candleSeries = shallowRef<any>(null);
  const theme = ref<ChartTheme>(DARK_THEME);
  
  const { width, height } = useElementSize(containerRef);
  
  function initChart() {
    if (!containerRef.value) return;
    
    chart.value = createChart(
      containerRef.value,
      getChartOptions(theme.value, width.value, height.value, isFullscreen.value)
    );
    
    candleSeries.value = chart.value.addSeries(
      CandlestickSeries,
      getCandlestickSeriesOptions(theme.value)
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
            getChartOptions(theme.value, width.value, height.value, isFullscreen.value)
        );
    }
  }
  
  function fitContent() {
    chart.value?.timeScale().fitContent();
  }
  
  // Auto-resize
  watch([width, height, isFullscreen], () => {
     resizeChart();
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
