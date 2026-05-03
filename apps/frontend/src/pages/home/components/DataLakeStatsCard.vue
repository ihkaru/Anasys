<template>
	<f7-card class="data-lake-stats">
		<f7-card-header class="stats-header">
			<div class="header-left">
				<f7-icon ios="f7:database_fill" md="material:storage" color="blue"></f7-icon>
				<span>Anasys Data Lake</span>
			</div>
			<div class="header-right">
				<f7-chip :text="`Total: ${stats?.totalTickers || 0}`" color="blue"></f7-chip>
			</div>
		</f7-card-header>
		<f7-card-content :padding="false">
			<div class="stats-grid">
				<div v-for="(gapCount, label) in stats?.gaps" :key="label" class="stat-item">
					<div class="stat-label">{{ formatLabel(label) }} Gaps</div>
					<div class="stat-value" :class="{ 'has-gaps': gapCount > 0 }">
						{{ gapCount }}
					</div>
					<f7-progressbar :progress="calculateProgress(gapCount)" :color="getProgressColor(gapCount)" />
				</div>
			</div>
		</f7-card-content>
		<f7-card-footer>
			<span class="last-updated">Last update: {{ formatTime(stats?.timestamp) }}</span>
			<f7-link @click="$emit('refresh')" :class="{ 'refreshing': loading }">
				<f7-icon ios="f7:arrow_2_circlepath" md="material:refresh" size="18"></f7-icon>
			</f7-link>
		</f7-card-footer>
	</f7-card>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
	stats: any;
	loading?: boolean;
}>();

defineEmits(["refresh"]);

function formatLabel(label: string | number) {
	return String(label).toUpperCase();
}

function calculateProgress(gaps: number) {
	if (!props.stats?.totalTickers) return 0;
	const total = props.stats.totalTickers;
	return Math.max(0, Math.min(100, ((total - gaps) / total) * 100));
}

function getProgressColor(gaps: number) {
	const progress = calculateProgress(gaps);
	if (progress > 95) return "green";
	if (progress > 80) return "blue";
	if (progress > 50) return "orange";
	return "red";
}

function formatTime(timestamp?: string) {
	if (!timestamp) return "--:--";
	const date = new Date(timestamp);
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
</script>

<style scoped>
.data-lake-stats {
	margin: 16px;
	border-radius: 16px;
	overflow: hidden;
	background: var(--f7-card-bg-color);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.stats-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 12px 16px;
	font-weight: 700;
}

.header-left {
	display: flex;
	align-items: center;
	gap: 8px;
}

.stats-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 1px;
	background: rgba(0, 0, 0, 0.05);
	padding-bottom: 1px;
}

.stat-item {
	background: var(--f7-card-bg-color);
	padding: 16px 12px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
}

.stat-label {
	font-size: 10px;
	color: var(--f7-theme-color-gray);
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.stat-value {
	font-size: 18px;
	font-weight: 700;
	color: var(--f7-theme-color-green);
}

.stat-value.has-gaps {
	color: var(--f7-theme-color-orange);
}

.stat-value.has-gaps:where(:hover) {
    color: var(--f7-theme-color-red);
}

.last-updated {
	font-size: 11px;
	color: var(--f7-theme-color-gray);
}

.refreshing {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}
</style>
