import type { IChartApi } from "lightweight-charts";
import { onUnmounted, readonly, ref, type Ref } from "vue";

export function useInfiniteScroll(
	chart: Ref<IChartApi | null>,
	onLoadMore: () => Promise<boolean | number | undefined>,
	options = { threshold: 50 },
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
		// console.time("InfiniteScroll_Load");
		try {
			const dataAdded = await onLoadMore();
			// console.log(`[InfiniteScroll] onLoadMore returned: ${dataAdded}`);

			// If callback returns false or 0/null, assume no more history
			if (dataAdded === false || (typeof dataAdded === "number" && dataAdded === 0)) {
				hasMoreHistory.value = false;
				// console.warn("[InfiniteScroll] End of history reached (0 items returned). Stopping.");
			}
		} catch (e) {
			console.error("[InfiniteScroll] Error:", e);
		} finally {
			isLoadingMore.value = false;
			// console.timeEnd("InfiniteScroll_Load");
		}
	}

	// Throttle for range change events to prevent flood during zoom gestures
	let lastRangeCheck = 0;
	const RANGE_THROTTLE_MS = 150; // Max ~7 checks per second

	function onVisibleLogicalRangeChanged(newRange: any) {
		if (!newRange) return;

		// Throttle: Skip if we checked recently
		const now = Date.now();
		if (now - lastRangeCheck < RANGE_THROTTLE_MS) {
			return; // Skip - too soon
		}
		lastRangeCheck = now;

		// DEBUG: Log range change (throttled)
		// console.log(`%c[InfiniteScroll] Range: from=${newRange.from?.toFixed(1)} to=${newRange.to?.toFixed(1)}`, 'color: #607D8B');

		// If scrolled near the start (historical data)
		if (newRange.from < options.threshold) {
			// console.log(`%c[InfiniteScroll] THRESHOLD HIT - triggering load`, 'color: #FF5722; font-weight: bold');
			handleLoadMore();
		}
	}

	function subscribe() {
		if (!chart.value) return;
		chart.value.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChanged);
	}

	function unsubscribe() {
		if (!chart.value) return;
		chart.value.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChanged);
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
