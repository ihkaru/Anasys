<template>
    <!-- Single stable wrapper — never conditionally mounted, so Vue never does insertBefore -->
    <div class="asset-icon-wrapper" :class="[size]">
        <!-- Text fallback: always in DOM, shown via opacity when logo not loaded or errored -->
        <div
            class="asset-icon"
            :class="[size, { 'faded': isLoaded && !hasError }]"
            :style="{ backgroundColor: getColorForTicker(safeTicker) }"
            aria-hidden="true"
        >
            {{ initials }}
        </div>

        <!-- Logo image: always in DOM if URL exists, shown via opacity once loaded -->
        <img
            v-if="logoUrl"
            :src="logoUrl"
            :alt="safeTicker"
            class="asset-logo"
            :class="{ 'visible': isLoaded && !hasError }"
            @error="onLogoError"
            @load="onLogoLoad"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { getColorForTicker } from "../utils/assetColors";
import { createLogger } from "../../../utils/logger";

const logger = createLogger("AssetLogo");

interface Props {
	ticker?: string | null;
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

// A safe non-null ticker for all internal use
const safeTicker = computed(() => (props.ticker || "??").trim().toUpperCase());

const initials = computed(() => safeTicker.value.substring(0, 2));

// Reset state if ticker changes
watch(
	() => props.ticker,
	(newTicker, oldTicker) => {
		if (newTicker !== oldTicker) {
			if (!newTicker) {
				logger.warn(`[AssetLogo] Received null/undefined ticker (was: ${oldTicker})`);
			}
			hasError.value = false;
			isLoaded.value = false;
		}
	},
);

const logoUrl = computed(() => {
	// Priority 1: Use backend-provided icon if available
	if (props.iconUrl) return props.iconUrl;

	const ticker = safeTicker.value;
	if (!ticker || ticker === "??") return "";

	// Skip logo fetch for futures/commodities — they always 404
	if (ticker.includes("=F") || ticker.includes("!")) {
		return "";
	}

	// Skip tickers with hyphens except crypto (e.g. BRK-B is a stock, BTC-USD is crypto)
	if (ticker.includes("-") && !ticker.includes("-USD") && !ticker.includes("-PERP")) {
		return "";
	}

	// Crypto logo endpoint
	if (props.type === "CRYPTO" || ticker.includes("-USD") || ticker.includes("-PERP")) {
		return `https://api.elbstream.com/logos/crypto/${ticker.split("-")[0]}`;
	}

	// Stock/ETF logo endpoint
	return `https://api.elbstream.com/logos/symbol/${ticker}`;
});

function onLogoLoad() {
	isLoaded.value = true;
}

function onLogoError() {
	// This is the normal path for any ticker not in elbstream — not a bug
	hasError.value = true;
	// Only log unexpected cases — known 404s (no icon in DB) are expected
	if (props.iconUrl) {
		logger.warn(`[AssetLogo] UNEXPECTED: iconUrl failed to load for ${safeTicker.value}: ${props.iconUrl}`);
	}
}
</script>

<style scoped>
.asset-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
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

/* Text fallback — always in DOM, just toggled via opacity */
.asset-icon {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 700;
    font-size: 14px;
    opacity: 1;
    transition: opacity 0.15s ease;
    user-select: none;
}

.asset-icon.faded {
    opacity: 0;
}

.asset-icon.small {
    font-size: 12px;
}

.asset-icon.large {
    font-size: 18px;
}

/* Logo image — always in DOM if URL exists, shown via opacity */
.asset-logo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    border: none;
    background: transparent;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.asset-logo.visible {
    opacity: 1;
}
</style>
