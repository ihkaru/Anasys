<template>
    <div class="timeframe-selector-wrapper">
        <div class="timeframe-selector">
            <button v-for="tf in timeframes" :key="tf.value" class="timeframe-btn"
                :class="{ 'active': modelValue === tf.value }" @click="$emit('update:modelValue', tf.value)">
                {{ tf.label }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
interface Timeframe {
    value: string;
    label: string;
}

defineProps<{
    modelValue: string;
}>();

defineEmits<{
    (e: 'update:modelValue', value: string): void;
}>();

// Professional timeframe options
const timeframes: Timeframe[] = [
    { value: '1D', label: '1D' },
    { value: '1W', label: '1W' },
    { value: '1M', label: '1M' },
    { value: '3M', label: '3M' },
    { value: '1Y', label: '1Y' },
    { value: 'ALL', label: 'ALL' },
];
</script>

<style scoped>
.timeframe-selector-wrapper {
    display: flex;
    justify-content: center;
    margin: -16px 8px 16px 8px;
    position: relative;
    z-index: 10;
}

.timeframe-selector {
    background: var(--card-bg, rgba(0, 0, 0, 0.05));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid var(--chart-border, rgba(0, 0, 0, 0.1));
    border-radius: 20px;
    padding: 4px;
    display: flex;
    gap: 2px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.timeframe-btn {
    background: transparent;
    border: none;
    color: var(--muted-text, #6b7280);
    padding: 6px 14px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    outline: none;
    letter-spacing: 0.5px;
}

.timeframe-btn:hover {
    background: var(--chart-border, rgba(0, 0, 0, 0.05));
    color: var(--f7-text-color);
}

.timeframe-btn.active {
    background: var(--f7-theme-color, #2563eb);
    color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
</style>
