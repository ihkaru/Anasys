<template>
  <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" class="sparkline">
    <path :d="path" fill="none" :stroke="color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
	defineProps<{
		data: number[];
		width?: number;
		height?: number;
		positive?: boolean;
	}>(),
	{
		width: 60,
		height: 20,
		positive: true,
	},
);

const _color = computed(() => (props.positive ? "#10b981" : "#ef4444"));

const _path = computed(() => {
	if (!props.data || props.data.length < 2) return "";

	const min = Math.min(...props.data);
	const max = Math.max(...props.data);
	const range = max - min || 1;
	const step = props.width / (props.data.length - 1);

	return props.data
		.map((val, i) => {
			const x = i * step;
			const y = props.height - ((val - min) / range) * props.height;
			return `${i === 0 ? "M" : "L"} ${x},${y}`;
		})
		.join(" ");
});
</script>

<style scoped>
.sparkline {
  display: block;
}
</style>
