<template>
    <div class="financials-section" v-if="financials">
        <f7-block-title>Financials & Stats</f7-block-title>

        <div class="stats-grid">
            <!-- Valuation -->
            <div class="stat-card">
                <span class="label">Market Cap</span>
                <span class="value">{{ formatLargeNumber(financials.marketCap || financials.enterpriseValue) }}</span>
            </div>
            <div class="stat-card">
                <span class="label">P/E Ratio</span>
                <span class="value">{{ financials.trailingPE?.toFixed(2) || '-' }}</span>
            </div>
            <div class="stat-card">
                <span class="label">EPS (TTM)</span>
                <span class="value">{{ financials.trailingEps?.toFixed(2) || '-' }}</span>
            </div>
            <div class="stat-card">
                <span class="label">Div. Yield</span>
                <span class="value">{{ (financials.dividendYield * 100)?.toFixed(2) }}%</span>
            </div>

            <!-- Margins -->
            <div class="stat-card">
                <span class="label">Profit Margin</span>
                <span class="value">{{ (financials.profitMargins * 100)?.toFixed(2) }}%</span>
            </div>
            <div class="stat-card">
                <span class="label">Revenue</span>
                <span class="value">{{ formatLargeNumber(financials.totalRevenue) }}</span>
            </div>

            <!-- Range -->
            <div class="stat-card full-width">
                <span class="label">52 Week Range</span>
                <div class="range-bar-container">
                    <span class="range-val">{{ financials.fiftyTwoWeekLow?.toFixed(2) }}</span>
                    <div class="range-bar">
                        <div class="range-fill" :style="{ width: calculateRangePercent(financials) + '%' }"></div>
                        <div class="current-marker" :style="{ left: calculateRangePercent(financials) + '%' }"></div>
                    </div>
                    <span class="range-val">{{ financials.fiftyTwoWeekHigh?.toFixed(2) }}</span>
                </div>
            </div>
        </div>

        <!-- Analyst Ratings if available -->
        <div class="analyst-block" v-if="analyst">
            <div class="analyst-header">
                <span class="label">Analyst Recommendation</span>
                <span class="rating-badge" :class="getRatingClass(financials.recommendationKey)">
                    {{ formatRatingObj(financials.recommendationKey) }}
                </span>
            </div>
            <div class="rating-bar">
                <div class="segment buy" :style="{ flex: analyst.buy + analyst.strongBuy }"></div>
                <div class="segment hold" :style="{ flex: analyst.hold }"></div>
                <div class="segment sell" :style="{ flex: analyst.sell + analyst.strongSell }"></div>
            </div>
            <div class="rating-labels">
                <span>Buy {{ analyst.buy + analyst.strongBuy }}</span>
                <span>Hold {{ analyst.hold }}</span>
                <span>Sell {{ analyst.sell + analyst.strongSell }}</span>
            </div>
            <div class="target-price" v-if="financials.targetMeanPrice">
                <span class="label">Target Price</span>
                <span class="value">${{ financials.targetMeanPrice }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps<{
	financials: any;
	analyst: any;
	currentPrice: number;
}>();

function _formatLargeNumber(num: number) {
	if (!num) return "-";
	if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
	if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
	if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
	return num.toLocaleString();
}

function _calculateRangePercent(fin: any) {
	if (!fin.fiftyTwoWeekHigh || !fin.fiftyTwoWeekLow || !props.currentPrice) return 50;
	const range = fin.fiftyTwoWeekHigh - fin.fiftyTwoWeekLow;
	const current = props.currentPrice - fin.fiftyTwoWeekLow;
	return Math.max(0, Math.min(100, (current / range) * 100));
}

function _formatRatingObj(key: string) {
	if (!key) return "N/A";
	return key.replace("-", " ").toUpperCase();
}

function _getRatingClass(key: string) {
	if (!key) return "";
	if (key.includes("buy")) return "positive";
	if (key.includes("sell")) return "negative";
	return "neutral";
}
</script>

<style scoped>
.financials-section {
    padding: 0 16px 16px;
}

.stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 24px;
}

.stat-card {
    background: var(--card-bg, rgba(0, 0, 0, 0.05));
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
}

.stat-card.full-width {
    grid-column: span 2;
}

.label {
    font-size: 12px;
    color: var(--muted-text, #6b7280);
    margin-bottom: 4px;
}

.value {
    font-size: 16px;
    font-weight: 600;
    color: var(--f7-text-color);
}

.range-bar-container {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
}

.range-val {
    font-size: 11px;
    color: var(--muted-text, #6b7280);
}

.range-bar {
    flex: 1;
    height: 4px;
    background: var(--chart-border, rgba(0, 0, 0, 0.1));
    border-radius: 2px;
    position: relative;
}

.range-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--negative-color) 0%, #eab308 50%, var(--positive-color) 100%);
    border-radius: 2px;
    width: 0%;
}

.current-marker {
    position: absolute;
    top: -4px;
    width: 2px;
    height: 12px;
    background: var(--f7-text-color);
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
}

/* Analyst Block */
.analyst-block {
    background: var(--card-bg, rgba(0, 0, 0, 0.05));
    border-radius: 12px;
    padding: 16px;
}

.analyst-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
}

.rating-badge {
    font-size: 12px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--chart-border, rgba(0, 0, 0, 0.1));
    color: var(--f7-text-color);
}

.rating-badge.positive {
    color: var(--positive-color, #10b981);
    background: rgba(16, 185, 129, 0.15);
}

.rating-badge.negative {
    color: var(--negative-color, #ef4444);
    background: rgba(239, 68, 68, 0.15);
}

.rating-badge.neutral {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.15);
}

.rating-bar {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
}

.segment.buy {
    background: var(--positive-color, #10b981);
}

.segment.hold {
    background: #f59e0b;
}

.segment.sell {
    background: var(--negative-color, #ef4444);
}

.rating-labels {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--muted-text, #6b7280);
    margin-bottom: 12px;
}

.target-price {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--chart-border, rgba(0, 0, 0, 0.1));
    padding-top: 12px;
}
</style>
