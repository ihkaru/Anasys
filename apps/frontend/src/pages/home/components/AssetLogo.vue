<template>
    <div v-if="ticker" class="asset-icon-wrapper" :class="[size]">
        <!-- Fallback shown while loading OR on error -->
        <div v-if="!isLoaded || hasError" class="asset-icon" :class="[size]"
            :style="{ backgroundColor: getColorForTicker(ticker) }">
            {{ ticker.substring(0, 2) }}
        </div>
        <!-- Actual logo (hidden until loaded) -->
        <img v-if="logoUrl && !hasError" :src="logoUrl" :alt="ticker" class="asset-logo" :class="{ 'loaded': isLoaded }"
            @error="onLogoError" @load="onLogoLoad" />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { getColorForTicker } from "../utils/assetColors";

interface Props {
	ticker: string;
	name?: string;
	type?: string;
	iconUrl?: string;
	website?: string;
	size?: "small" | "medium" | "large";
}

const props = withDefaults(defineProps<Props>(), {
	size: "medium",
	type: "STOCK",
});

const hasError = ref(false);
const isLoaded = ref(false);

// Reset state if ticker changes
watch(
	() => props.ticker,
	() => {
		hasError.value = false;
		isLoaded.value = false;
	},
);

const logoUrl = computed(() => {
	// Priority 1: Use cached icon from backend if available
	if (props.iconUrl) return props.iconUrl;

	// Stocks/ETFs - use symbol endpoint
	if (!props.ticker) return "";

	// Mencegah browser mencoba memuat logo yang pasti gagal (menghindari 404 di console)
	if (props.ticker.includes("=F") || (props.ticker.includes("-") && !props.ticker.includes("-USD"))) {
		return "";
	}

	const url =
		props.type === "CRYPTO" || props.ticker.includes("-USD")
			? `https://api.elbstream.com/logos/crypto/${props.ticker.split("-")[0].toUpperCase()}`
			: `https://api.elbstream.com/logos/symbol/${props.ticker}`;

	// If backend provided iconUrl, favor it (it likely points to local /public/logos/...)
	// Note: iconUrl from DB might be relative path like '/public/logos/...'
	return url;
});

function onLogoLoad() {
	isLoaded.value = true;
}

function onLogoError() {
	hasError.value = true;
}
</script>

<style scoped>
.asset-icon-wrapper {
    position: relative;
    display: inline-block;
    flex-shrink: 0;
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
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    background: transparent;
    border: none;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.asset-logo.loaded {
    opacity: 1;
}

.asset-icon {
    width: 100%;
    height: 100%;
    border-radius: 50%;
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
