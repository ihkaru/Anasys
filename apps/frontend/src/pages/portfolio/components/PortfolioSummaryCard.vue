<template>
    <f7-block>
        <div class="portfolio-summary-card">
            <div class="summary-header">
                <span class="summary-label">Total Portfolio Value</span>
                <f7-icon :ios="showBalance ? 'f7:eye_fill' : 'f7:eye_slash_fill'"
                    :md="showBalance ? 'material:visibility' : 'material:visibility_off'" size="20"
                    @click="$emit('toggle-balance')"></f7-icon>
            </div>

            <h1 class="summary-value">
                {{ showBalance ? formatCurrency(totalValue) : '••••••' }}
            </h1>

            <div :class="['summary-change', changePercent >= 0 ? 'positive' : 'negative']">
                <f7-icon :ios="changePercent >= 0 ? 'f7:arrow_up_right' : 'f7:arrow_down_right'"
                    :md="changePercent >= 0 ? 'material:trending_up' : 'material:trending_down'" size="16"></f7-icon>
                <span>
                    {{ formatCurrency(Math.abs(changeAmount)) }}
                    ({{ formatPercent(changePercent) }})
                </span>
            </div>
        </div>
    </f7-block>
</template>

<script setup lang="ts">
import { formatCurrency, formatPercent } from "../../../utils/formatters";

defineProps<{
    totalValue: number;
    changeAmount: number;
    changePercent: number;
    showBalance: boolean;
}>();

defineEmits<(e: "toggle-balance") => void>();
</script>

<style scoped>
.portfolio-summary-card {
    background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
    border-radius: 16px;
    padding: 24px;
    color: white;
}

.summary-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.summary-label {
    font-size: 14px;
    opacity: 0.9;
}

.summary-value {
    font-size: 36px;
    font-weight: 700;
    margin: 8px 0;
}

.summary-change {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    padding: 6px 12px;
    border-radius: 20px;
    width: fit-content;
}

.summary-change.positive {
    background: rgba(255, 255, 255, 0.2);
}

.summary-change.negative {
    background: rgba(239, 68, 68, 0.3);
}
</style>
