<template>
    <f7-block class="greeting-block">
        <div class="greeting-content">
            <div class="avatar">
                <f7-icon ios="f7:person_circle_fill" md="material:account_circle" size="48" color="primary"></f7-icon>
            </div>
            <div class="greeting-text">
                <p class="greeting-hello">Good {{ timeOfDay }},</p>
                <h2 class="greeting-name">{{ userName || 'Investor' }}!</h2>
            </div>
        </div>
    </f7-block>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
    userName?: string;
}

const props = defineProps<Props>();

const timeOfDay = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
});
</script>

<style scoped>
.greeting-block {
    padding-top: 10px;
}

.greeting-content {
    display: flex;
    align-items: center;
    gap: 16px;
}

.greeting-hello {
    margin: 0;
    font-size: 14px;
    color: var(--f7-text-color);
    opacity: 0.6;
}

.greeting-name {
    margin: 4px 0 0;
    font-size: 24px;
    font-weight: 700;
}
</style>
