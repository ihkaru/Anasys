
import { type IChartApi } from 'lightweight-charts';
import { onUnmounted, readonly, ref, type Ref } from 'vue';

export function useInfiniteScroll(
  chart: Ref<IChartApi | null>,
  onLoadMore: () => Promise<void>,
  options = { threshold: 50 }
) {
  const isLoadingMore = ref(false);
  
  async function handleLoadMore() {
    if (isLoadingMore.value) return;
    
    isLoadingMore.value = true;
    try {
      await onLoadMore();
    } finally {
      isLoadingMore.value = false;
    }
  }
  
  function onVisibleLogicalRangeChanged(newRange: any) {
    if (!newRange) return;
    
    // If scrolled near the start (historical data)
    if (newRange.from < options.threshold) {
      handleLoadMore();
    }
  }
  
  function subscribe() {
    if (!chart.value) return;
    chart.value.timeScale().subscribeVisibleLogicalRangeChange(
      onVisibleLogicalRangeChanged
    );
  }
  
  function unsubscribe() {
    if (!chart.value) return;
    chart.value.timeScale().unsubscribeVisibleLogicalRangeChange(
      onVisibleLogicalRangeChanged
    );
  }
  
  // We need to re-subscribe if chart instance changes (e.g. remounted)
  // But usually chart lifecycle is managed outside. 
  // We expose subscribe/unsubscribe to be called when chart is ready.
  
  onUnmounted(unsubscribe);
  
  return {
    isLoadingMore: readonly(isLoadingMore),
    subscribe,
    unsubscribe,
  };
}
