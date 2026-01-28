<template>
    <div class="earnings-section" v-if="earnings && earnings.earningsHistory?.length">
        <f7-block-title>Earnings & Revenue</f7-block-title>

        <!-- Next Earnings Date -->
        <div class="next-earnings" v-if="earnings.nextEarningsDate">
            <f7-icon f7="calendar" size="20" class="text-color-primary"></f7-icon>
            <div class="date-info">
                <span class="label">Next Earnings</span>
                <span class="date">{{ formatDate(earnings.nextEarningsDate) }}</span>
            </div>
        </div>

        <!-- History List -->
        <div class="earnings-list">
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
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    earnings: any;
}>();

const sortedHistory = computed(() => {
    if (!props.earnings?.earningsHistory) return [];
    return [...props.earnings.earningsHistory].reverse().slice(0, 4);
});

function formatDate(dateStr: string) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatPeriod(dateStr: string) {
    // Try to format nicely like Q3 2024 if possible, otherwise date
    if (!dateStr) return '-';
    // Sometimes Yahoo gives raw date strings
    const date = new Date(dateStr);
    const month = date.getMonth();
    const q = Math.floor(month / 3) + 1;
    return `Q${q} '${date.getFullYear().toString().substr(2)}`;
}

function getBeatClass(item: any) {
    if (!item.epsActual || !item.epsEstimate) return '';
    return item.epsActual >= item.epsEstimate ? 'text-color-green' : 'text-color-red';
}
</script>

<style scoped>
.earnings-section {
    padding: 0 16px 16px;
}

.next-earnings {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.05);
    padding: 12px 16px;
    border-radius: 12px;
    margin-bottom: 16px;
}

.date-info {
    display: flex;
    flex-direction: column;
}

.label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
}

.date {
    font-size: 14px;
    font-weight: 600;
}

.earnings-list {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    overflow: hidden;
}

.list-header {
    display: flex;
    justify-content: space-between;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.02);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
}

.list-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 13px;
}

.eps-group {
    display: flex;
    gap: 4px;
    font-family: monospace;
}

.estimate {
    color: rgba(255, 255, 255, 0.5);
}

.divider {
    color: rgba(255, 255, 255, 0.3);
}

.surprise {
    font-weight: 500;
    min-width: 50px;
    text-align: right;
}

.surprise.positive {
    color: #10b981;
}

.surprise.negative {
    color: #ef4444;
}
</style>
