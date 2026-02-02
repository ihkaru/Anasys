import { ref } from "vue";

export function useLongPress(callback: (item: any) => void, duration = 600) {
	const isHolding = ref(false);
	const holdingItem = ref<any>(null); // To track which item is being held if needed for UI feedback
	let timer: ReturnType<typeof setTimeout> | null = null;

	function start(item: any) {
		// Basic check to ensure we clean up previous hold attempts
		cancel();

		holdingItem.value = item;
		timer = setTimeout(() => {
			isHolding.value = true;
			callback(item);
			// Reset visual state after callback fired or keep it until user releases?
			// Original logic reset it immediately.
			isHolding.value = false;
			holdingItem.value = null;
		}, duration);
	}

	function cancel() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		isHolding.value = false;
		holdingItem.value = null;
	}

	function end() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		// Small delay to smooth out the "pop" back animation if needed
		setTimeout(() => {
			isHolding.value = false;
			holdingItem.value = null;
		}, 100);
	}

	return { isHolding, holdingItem, start, cancel, end };
}
