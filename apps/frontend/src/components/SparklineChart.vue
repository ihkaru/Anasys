<template>
  <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" class="sparkline-chart">
    <defs>
      <linearGradient :id="gradientId" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" :style="{ stopColor: color, stopOpacity: 0.3 }" />
        <stop offset="100%" :style="{ stopColor: color, stopOpacity: 0 }" />
      </linearGradient>
    </defs>

    <!-- Area fill -->
    <path :d="areaPath" :fill="`url(#${gradientId})`" />

    <!-- Line -->
    <path :d="linePath" fill="none" :stroke="color" :stroke-width="strokeWidth" stroke-linecap="round"
      stroke-linejoin="round" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  positive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  width: 80,
  height: 32,
  strokeWidth: 1.5,
  positive: true,
});


const gradientId = computed(() => `sparkline-gradient-${Math.random().toString(36).substr(2, 9)}`);
// ... rest of code
const color = computed(() => props.positive ? '#10b981' : '#ef4444');

const normalizedData = computed(() => {
  // ... existing computed code
  if (!props.data || props.data.length === 0) return [];

  const min = Math.min(...props.data);
  const max = Math.max(...props.data);
  const range = max - min || 1;

  const padding = props.height * 0.1;
  const availableHeight = props.height - padding * 2;

  return props.data.map(value => {
    return props.height - padding - ((value - min) / range) * availableHeight;
  });
});

const points = computed(() => {
  if (normalizedData.value.length === 0) return [];

  const stepX = props.width / (normalizedData.value.length - 1 || 1);

  return normalizedData.value.map((y, i) => ({
    x: i * stepX,
    y: y,
  }));
});

const linePath = computed(() => {
  if (points.value.length === 0) return '';

  return points.value.reduce((path, point, i) => {
    if (i === 0) {
      return `M ${point.x} ${point.y}`;
    }
    return `${path} L ${point.x} ${point.y}`;
  }, '');
});

const areaPath = computed(() => {
  if (points.value.length === 0) return '';

  const line = linePath.value;
  const lastPoint = points.value[points.value.length - 1];
  const firstPoint = points.value[0];

  return `${line} L ${lastPoint.x} ${props.height} L ${firstPoint.x} ${props.height} Z`;
});
</script>

<style scoped>
.sparkline-chart {
  display: block;
}
</style>
