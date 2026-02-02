<template>
    <f7-card v-if="asset" class="asset-details-card">
        <f7-card-header class="no-border">
            <div class="header-row">
                <div class="title-col">
                    <h2 class="asset-name">{{ asset.name }}</h2>
                    <span class="asset-ticker">
                        {{ asset.ticker }} · {{ asset.type }}
                    </span>
                </div>
                <AssetLogo v-if="asset" :ticker="asset.ticker" :icon-url="asset.iconUrl" :type="asset.type" size="large"
                    class="asset-logo-large" />
            </div>
        </f7-card-header>

        <f7-card-content>
            <div class="stats-grid">
                <div class="stat-item" v-if="asset.sector">
                    <span class="label">Sector</span>
                    <span class="value">{{ asset.sector }}</span>
                </div>
                <div class="stat-item" v-if="asset.industry">
                    <span class="label">Industry</span>
                    <span class="value">{{ asset.industry }}</span>
                </div>
            </div>

            <div class="description-block" v-if="asset.description">
                <p class="description-text">{{ asset.description }}</p>
            </div>

            <div class="actions-block">
                <f7-button fill v-if="asset.website" :href="asset.website" target="_blank" external>
                    <f7-icon ios="f7:globe" md="material:language"></f7-icon>
                    Website
                </f7-button>
            </div>
        </f7-card-content>
    </f7-card>
</template>

<script setup lang="ts">
interface AssetDetails {
	name?: string;
	ticker: string;
	type?: string;
	iconUrl?: string;
	sector?: string;
	industry?: string;
	description?: string;
	website?: string;
}

const _props = defineProps<{
	asset: AssetDetails | null;
}>();
</script>

<style scoped>
.asset-details-card {
    background: var(--card-bg, rgba(0, 0, 0, 0.05));
    border-radius: 16px;
    margin: 16px 8px;
    color: var(--f7-text-color);
}

.header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
}

.asset-name {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--f7-text-color);
}

.asset-ticker {
    color: var(--muted-text, #6b7280);
    font-size: 14px;
    font-weight: 500;
}

.asset-logo-large {
    flex-shrink: 0;
    margin-left: 12px;
}



.stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
}

.stat-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.stat-item .label {
    font-size: 12px;
    color: var(--muted-text, #6b7280);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.stat-item .value {
    font-size: 15px;
    font-weight: 600;
    color: var(--f7-text-color);
}

.description-block {
    margin-bottom: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--chart-border, rgba(0, 0, 0, 0.1));
}

.description-text {
    font-size: 14px;
    line-height: 1.6;
    color: var(--f7-text-color);
    opacity: 0.85;
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin: 0;
}

.actions-block {
    display: flex;
    gap: 12px;
}
</style>
