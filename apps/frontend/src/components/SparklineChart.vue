<template>
	<svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" class="sparkline">
		<path :d="path" fill="none" :stroke="color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
	</svg>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = withDefaults(
	defineProps<{
		data: number[];
		width?: number;
		height?: number;
		positive?: boolean;
		limit?: number;
	}>(),
	{
		width: 60,
		height: 20,
		positive: true,
	},
);

const color = computed(() => (props.positive ? "#10b981" : "#ef4444"));

// Memoization: cache last data hash and path to prevent recalc on reference-only changes
const lastDataHash = ref("");
const memoizedPath = ref("");

// Calculate path with memoization
const path = computed(() => {
	const data = props.data || [];
	if (data.length < 2) {
		lastDataHash.value = "";
		memoizedPath.value = "";
		return "";
	}

	// Create hash of data values to detect actual changes
	// Using join with precision rounding to handle floating point noise
	const hash = `${data.length}:${props.limit || 0}:${data.map((v) => v.toFixed(4)).join(",")}`;

	// Return cached path if data hasn't actually changed
	if (hash === lastDataHash.value && memoizedPath.value) {
		return memoizedPath.value;
	}

	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;

	// If limit is provided, use it for step calculation to fix the X-axis scale
	// This prevents the "wriggling" effect when data is growing (backfilling)
	const totalPoints = props.limit || Math.max(data.length, 2);
	const step = props.width / (totalPoints - 1);

	// If using limit, anchor points to the right
	const offset = props.limit ? props.limit - data.length : 0;

	const calculatedPath = data
		.map((val, i) => {
			const x = (i + offset) * step;
			const y = props.height - ((val - min) / range) * props.height;
			return `${i === 0 ? "M" : "L"} ${x},${y}`;
		})
		.join(" ");

	// Cache the result
	lastDataHash.value = hash;
	memoizedPath.value = calculatedPath;

	return calculatedPath;
});
</script>

<style scoped>
.sparkline {
	display: block;
}
</style>
