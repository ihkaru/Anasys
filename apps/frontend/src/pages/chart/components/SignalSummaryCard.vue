<template>
    <f7-card v-if="hasSignals">
        <f7-card-header>
            {{ totalSignals }} Signal{{ totalSignals > 1 ? 's' : '' }} Found
        </f7-card-header>
        <f7-card-content>
            <div class="signal-summary">
                <div class="signal-stat">
                    <span class="label">Buy Signals</span>
                    <span class="value buy">{{ buySignals }}</span>
                </div>
                <div class="signal-stat">
                    <span class="label">Sell Signals</span>
                    <span class="value sell">{{ sellSignals }}</span>
                </div>
            </div>
        </f7-card-content>
    </f7-card>
</template>

<script setup lang="ts">
import { toRef } from 'vue';
import { type Signal } from '../../../stores/market';
import { useSignalMarkers } from '../composables/useSignalMarkers';

const props = defineProps<{
    signals: Signal[];
}>();

const { buySignals, sellSignals, totalSignals, hasSignals } = useSignalMarkers(
    toRef(props, 'signals')
);
</script>

<style scoped>
.signal-summary {
    display: flex;
    justify-content: space-around;
}

.signal-stat {
    text-align: center;
}

.signal-stat .label {
    display: block;
    font-size: 12px;
    color: var(--f7-text-color);
    opacity: 0.7;
}

.signal-stat .value {
    display: block;
    font-size: 24px;
    font-weight: bold;
}

.signal-stat .value.buy {
    color: #10b981;
}

.signal-stat .value.sell {
    color: #ef4444;
}
</style>
