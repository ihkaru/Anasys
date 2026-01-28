<template>
    <div class="asset-icon-wrapper" :class="[size]">
        <img v-if="!hasError && logoUrl" :src="logoUrl" :alt="ticker" class="asset-logo" @error="onLogoError" />
        <div v-else class="asset-icon" :class="[size]" :style="{ backgroundColor: getColorForTicker(ticker) }">
            {{ ticker.substring(0, 2) }}
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getColorForTicker } from '../utils/assetColors';

interface Props {
    ticker: string;
    name?: string;
    type?: string;
    iconUrl?: string;
    website?: string;
    size?: 'small' | 'medium' | 'large';
}

const props = withDefaults(defineProps<Props>(), {
    size: 'medium',
    type: 'STOCK'
});

const hasError = ref(false);

// Reset error if ticker changes
watch(() => props.ticker, () => {
    hasError.value = false;
});

const logoUrl = computed(() => {
    if (props.iconUrl) return props.iconUrl;

    // Crypto
    if (props.type === 'CRYPTO' || props.ticker.includes('-USD')) {
        const baseSymbol = props.ticker.split('-')[0].toLowerCase();
        return `https://assets.coincap.io/assets/icons/${baseSymbol}@2x.png`;
    }

    // Stocks
    if (props.website) {
        try {
            const url = new URL(props.website);
            const domain = url.hostname.replace('www.', '');
            return `https://logo.clearbit.com/${domain}`;
        } catch {
            return null;
        }
    }

    return null;
});

function onLogoError() {
    hasError.value = true;
}
</script>

<style scoped>
.asset-icon-wrapper {
    position: relative;
    display: inline-block;
}

.asset-icon-wrapper.medium {
    width: 44px;
    height: 44px;
}

.asset-icon-wrapper.small {
    width: 36px;
    height: 36px;
}

.asset-icon-wrapper.large {
    width: 56px;
    height: 56px;
}

.asset-logo {
    width: 100%;
    height: 100%;
    border-radius: 12px;
    object-fit: cover;
    background: var(--f7-page-bg-color);
}

.asset-icon {
    width: 100%;
    height: 100%;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 14px;
}

.asset-icon.small {
    font-size: 12px;
}

.asset-icon.large {
    font-size: 18px;
}
</style>
