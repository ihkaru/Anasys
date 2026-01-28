
import { type IChartApi } from 'lightweight-charts';
import { onUnmounted, readonly, ref, type Ref } from 'vue';

export function useInfiniteScroll(
  chart: Ref<IChartApi | null>,
  onLoadMore: () => Promise<boolean | number | void>,
  options = { threshold: 50 }
) {
  const isLoadingMore = ref(false);
  const hasMoreHistory = ref(true);


  async function handleLoadMore() {
    if (isLoadingMore.value) return;
    if (!hasMoreHistory.value) {
        // console.debug('[InfiniteScroll] No more history, ignoring trigger.');
        return;
    }
    
    isLoadingMore.value = true;
    console.time('InfiniteScroll_Load');
    try {
      const dataAdded = await onLoadMore();
      console.log(`[InfiniteScroll] onLoadMore returned: ${dataAdded}`);

      // If callback returns false or 0/null, assume no more history
      if (dataAdded === false || (typeof dataAdded === 'number' && dataAdded === 0)) {
         hasMoreHistory.value = false;
         console.warn('[InfiniteScroll] End of history reached (0 items returned). Stopping.');
      }
    } catch(e) {
       console.error('[InfiniteScroll] Error:', e);
    } finally {
      isLoadingMore.value = false;
      console.timeEnd('InfiniteScroll_Load');
    }
  }

  
  function onVisibleLogicalRangeChanged(newRange: any) {
    if (!newRange) return;
    
    // If scrolled near the start (historical data)
    if (newRange.from < options.threshold) {
      // console.debug(`[InfiniteScroll] Threshold reached: ${newRange.from} < ${options.threshold}`);
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
