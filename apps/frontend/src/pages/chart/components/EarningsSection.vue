<template>
    <div class="earnings-section" v-if="hasData">
        <div class="section-header">
            <f7-block-title class="no-margin">Financials</f7-block-title>
            <div class="view-switch">
                <f7-link :class="{ active: viewMode === 'eps' }" @click="viewMode = 'eps'">EPS</f7-link>
                <f7-link :class="{ active: viewMode === 'revenue' }" @click="viewMode = 'revenue'">Rev</f7-link>
            </div>
        </div>

        <!-- Next Earnings Date -->
        <div class="next-earnings" v-if="earnings.nextEarningsDate">
            <div class="icon-box">
                <f7-icon ios="f7:calendar" md="material:calendar_today" size="24"></f7-icon>
            </div>
            <div class="date-info">
                <span class="label">Next Earnings</span>
                <span class="date">{{ formatDate(earnings.nextEarningsDate) }}</span>
            </div>
        </div>

        <!-- History List: EPS -->
        <div class="earnings-list" v-if="viewMode === 'eps'">
            <div class="list-header">
                <span>Period</span>
                <span>Est / Act</span>
                <span>Surprise</span>
            </div>
            <div v-for="(item, i) in sortedHistory" :key="i" class="list-row">
                <span class="period">{{ formatPeriod(item.date) }}</span>
                <div class="eps-group">
                    <span class="estimate">{{ item.epsEstimate?.toFixed(2) }}</span>
                    <span class="divider">/</span>
                    <span class="actual" :class="getBeatClass(item)">{{ item.epsActual?.toFixed(2) }}</span>
                </div>
                <span class="surprise" :class="item.surprisePercent >= 0 ? 'positive' : 'negative'">
                    {{ item.surprisePercent ? (item.surprisePercent * 100).toFixed(1) + '%' : '-' }}
                </span>
            </div>
        </div>

        <!-- History List: Revenue -->
        <div class="earnings-list" v-if="viewMode === 'revenue'">
            <div class="list-header">
                <span>Period</span>
                <span>Revenue</span>
                <span>Earnings</span>
            </div>
            <div v-for="(item, i) in sortedRevenue" :key="i" class="list-row">
                <span class="period">{{ formatPeriod(item.date) }}</span>
                <span class="revenue">{{ formatLargeNumber(item.revenue) }}</span>
                <span class="earnings-val">{{ formatLargeNumber(item.earnings) }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
	earnings: any;
	symbol?: string;
}>();

const viewMode = ref<"eps" | "revenue">("eps");

const hasData = computed(() => {
	return (
		props.earnings &&
		(props.earnings.earningsHistory?.length || props.earnings.revenueHistory?.length || props.earnings.nextEarningsDate)
	);
});

const sortedHistory = computed(() => {
	if (!props.earnings?.earningsHistory) return [];
	return [...props.earnings.earningsHistory].reverse().slice(0, 4);
});

const sortedRevenue = computed(() => {
	if (!props.earnings?.revenueHistory) return [];
	return [...props.earnings.revenueHistory].reverse().slice(0, 4);
});

function formatDate(dateStr: string) {
	if (!dateStr) return "-";
	try {
		const d = new Date(dateStr);
		return d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	} catch (_e) {
		return dateStr;
	}
}

function formatPeriod(dateStr: string) {
	if (!dateStr) return "-";

	if (/^\d[Qq]\d{4}$/.test(dateStr)) {
		return dateStr
			.toUpperCase()
			.replace(/(\d{4})/, " '$1")
			.replace(" '20", " '");
	}

	try {
		const date = new Date(dateStr);
		if (Number.isNaN(date.getTime())) return dateStr;

		const month = date.getMonth();
		const q = Math.floor(month / 3) + 1;
		const yearShort = date.getFullYear().toString().substring(2);
		return `Q${q} '${yearShort}`;
	} catch (_e) {
		return dateStr;
	}
}

function formatLargeNumber(num: number) {
	if (!num) return "-";
	if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
	if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
	if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
	return num.toLocaleString();
}

function getBeatClass(item: any) {
	if (item.epsActual === undefined || item.epsEstimate === undefined) return "";
	return item.epsActual >= item.epsEstimate ? "beat" : "miss";
}
</script>

<style scoped>
.earnings-section {
    padding: 0 16px 16px;
    margin-top: 24px;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.view-switch {
    display: flex;
    background: var(--card-bg, rgba(0, 0, 0, 0.05));
    border-radius: 8px;
    padding: 2px;
}

.view-switch .link {
    font-size: 12px;
    padding: 4px 12px;
    height: 24px;
    line-height: 24px;
    border-radius: 6px;
    color: var(--muted-text, #6b7280);
    transition: all 0.2s;
}

.view-switch .link.active {
    background: var(--f7-theme-color);
    color: white;
    font-weight: 600;
}

.next-earnings {
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--card-bg, rgba(0, 0, 0, 0.05));
    padding: 16px;
    border-radius: 16px;
    margin-bottom: 16px;
    border: 1px solid var(--chart-border, rgba(0, 0, 0, 0.1));
}

.icon-box {
    width: 42px;
    height: 42px;
    background: rgba(var(--f7-theme-color-rgb), 0.2);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--f7-theme-color);
}

.date-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.label {
    font-size: 10px;
    color: var(--muted-text, #6b7280);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 600;
}

.date {
    font-size: 16px;
    font-weight: 700;
    color: var(--f7-text-color);
}

.earnings-list {
    background: var(--card-bg, rgba(0, 0, 0, 0.03));
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--chart-border, rgba(0, 0, 0, 0.05));
}

.list-header {
    display: flex;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--card-bg, rgba(0, 0, 0, 0.05));
    font-size: 11px;
    color: var(--muted-text, #6b7280);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
}

.list-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-top: 1px solid var(--chart-border, rgba(0, 0, 0, 0.05));
    font-size: 13px;
}

.period {
    font-weight: 600;
    width: 60px;
    color: var(--f7-text-color);
}

.eps-group {
    display: flex;
    gap: 6px;
    font-family: 'Roboto Mono', monospace;
    font-size: 13px;
    flex: 1;
    justify-content: center;
}

.estimate {
    color: var(--muted-text, #6b7280);
}

.divider {
    color: var(--chart-border, rgba(0, 0, 0, 0.2));
}

.actual {
    font-weight: 700;
    color: var(--f7-text-color);
}

.actual.beat {
    color: var(--positive-color, #10b981);
}

.actual.miss {
    color: var(--negative-color, #ef4444);
}

.surprise,
.revenue,
.earnings-val {
    width: 70px;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.surprise {
    font-weight: 600;
}

.surprise.positive {
    color: var(--positive-color, #10b981);
}

.surprise.negative {
    color: var(--negative-color, #ef4444);
}

.revenue {
    color: var(--f7-text-color);
    font-weight: 500;
}

.earnings-val {
    color: var(--muted-text, #6b7280);
}
</style>
