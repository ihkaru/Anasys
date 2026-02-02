<template>
    <div class="interval-selector-wrapper">
        <div class="interval-selector">
            <button v-for="interval in intervals" :key="interval" class="interval-btn"
                :class="{ 'active': modelValue === interval }" @click="$emit('update:modelValue', interval)">
                {{ interval }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
	modelValue: string;
	intervals?: string[];
}>();

defineEmits<(e: "update:modelValue", value: string) => void>();

const _intervals = computed(() => props.intervals || ["15m", "30m", "1h", "1d", "1wk"]);
</script>

<style scoped>
.interval-selector-wrapper {
    display: flex;
    justify-content: center;
    margin: -16px 8px 16px 8px;
    position: relative;
    z-index: 10;
}

.interval-selector {
    background: var(--card-bg, rgba(0, 0, 0, 0.05));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid var(--chart-border, rgba(0, 0, 0, 0.1));
    border-radius: 20px;
    padding: 4px;
    display: flex;
    gap: 4px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.interval-btn {
    background: transparent;
    border: none;
    color: var(--muted-text, #6b7280);
    padding: 6px 16px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    outline: none;
}

.interval-btn:hover {
    background: var(--chart-border, rgba(0, 0, 0, 0.05));
    color: var(--f7-text-color);
}

.interval-btn.active {
    background: var(--f7-theme-color, #2563eb);
    color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
</style>
