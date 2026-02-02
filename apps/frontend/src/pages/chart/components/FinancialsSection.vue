<template>
    <div class="financials-section" v-if="financials">
        <f7-block-title>Financials & Stats</f7-block-title>

        <div class="stats-grid">
            <!-- Valuation -->
            <div class="stat-card">
                <span class="label">Market Cap</span>
                <span class="value">{{ formatCurrency(financials.marketCap || financials.enterpriseValue) }}</span>
            </div>
            <div class="stat-card">
                <span class="label">P/E Ratio</span>
                <span class="value">{{ formatNumber(financials.trailingPE, 2) }}</span>
            </div>
            <div class="stat-card">
                <span class="label">EPS (TTM)</span>
                <span class="value">{{ formatNumber(financials.trailingEps, 2) }}</span>
            </div>
            <div class="stat-card">
                <span class="label">Div. Yield</span>
                <span class="value">{{ formatPercent(financials.dividendYield) }}</span>
            </div>

            <!-- Margins -->
            <div class="stat-card">
                <span class="label">Profit Margin</span>
                <span class="value">{{ formatPercent(financials.profitMargins) }}</span>
            </div>
            <div class="stat-card">
                <span class="label">Revenue</span>
                <span class="value">{{ formatCurrency(financials.totalRevenue) }}</span>
            </div>

            <!-- Range -->
            <div class="stat-card full-width">
                <span class="label">52 Week Range</span>
                <div class="range-bar-container">
                    <span class="range-val">{{ formatPrice(financials.fiftyTwoWeekLow) }}</span>
                    <div class="range-bar">
                        <div class="range-fill" :style="{ width: calculateRangePercent(financials) + '%' }"></div>
                        <div class="current-marker" :style="{ left: calculateRangePercent(financials) + '%' }"></div>
                    </div>
                    <span class="range-val">{{ formatPrice(financials.fiftyTwoWeekHigh) }}</span>
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
                <span class="value">{{ currencySymbol }}{{ formatPrice(financials.targetMeanPrice) }}</span>
            </div>
        </div>

        <!-- Advanced Financials Section -->
        <div class="advanced-section" v-if="hasAdvancedData">
            <div class="section-header">
                <span class="section-title">Advanced Metrics</span>
                <div class="tab-switch">
                    <button v-for="tab in advancedTabs" :key="tab.key" class="tab-btn"
                        :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
                        {{ tab.label }}
                    </button>
                </div>
            </div>

            <!-- Risk & Volatility Tab -->
            <div class="metrics-grid" v-if="activeTab === 'risk'">
                <div class="metric-item">
                    <span class="metric-label">Beta</span>
                    <span class="metric-value" :class="getBetaClass(financials.beta)">
                        {{ formatNumber(financials.beta, 3) }}
                    </span>
                    <span class="metric-hint" v-if="financials.beta">
                        {{ financials.beta > 1 ? 'Higher volatility' : financials.beta < 1 ? 'Lower volatility'
                            : 'Market average' }} </span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Debt/Equity</span>
                    <span class="metric-value" :class="getDebtClass(financials.debtToEquity)">
                        {{ formatNumber(financials.debtToEquity, 2) }}
                    </span>
                    <span class="metric-hint" v-if="financials.debtToEquity != null">
                        {{ financials.debtToEquity > 2 ? 'High leverage' : financials.debtToEquity < 0.5
                            ? 'Low leverage' : 'Moderate' }} </span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Current Ratio</span>
                    <span class="metric-value" :class="getCurrentRatioClass(financials.currentRatio)">
                        {{ formatNumber(financials.currentRatio, 2) }}
                    </span>
                    <span class="metric-hint" v-if="financials.currentRatio != null">
                        {{ financials.currentRatio >= 1.5 ? 'Healthy liquidity' : financials.currentRatio >= 1 ?
                        'Adequate' : 'Low liquidity' }}
                    </span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Quick Ratio</span>
                    <span class="metric-value">{{ formatNumber(financials.quickRatio, 2) }}</span>
                </div>
            </div>

            <!-- Profitability Tab -->
            <div class="metrics-grid" v-if="activeTab === 'profit'">
                <div class="metric-item">
                    <span class="metric-label">Return on Equity</span>
                    <span class="metric-value" :class="getROEClass(financials.returnOnEquity)">
                        {{ formatPercent(financials.returnOnEquity) }}
                    </span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Return on Assets</span>
                    <span class="metric-value">{{ formatPercent(financials.returnOnAssets) }}</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Gross Margin</span>
                    <span class="metric-value">{{ formatPercent(financials.grossMargins) }}</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Operating Margin</span>
                    <span class="metric-value">{{ formatPercent(financials.operatingMargins) }}</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">EBITDA</span>
                    <span class="metric-value">{{ formatCurrency(financials.ebitda) }}</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Free Cash Flow</span>
                    <span class="metric-value" :class="financials.freeCashflow > 0 ? 'positive' : 'negative'">
                        {{ formatCurrency(financials.freeCashflow) }}
                    </span>
                </div>
            </div>

            <!-- Ownership Tab -->
            <div class="metrics-grid" v-if="activeTab === 'ownership'">
                <div class="metric-item full-width">
                    <span class="metric-label">Insider Ownership</span>
                    <div class="ownership-bar">
                        <div class="ownership-fill insider"
                            :style="{ width: (financials.heldPercentInsiders * 100) + '%' }"></div>
                    </div>
                    <span class="metric-value">{{ formatPercent(financials.heldPercentInsiders) }}</span>
                </div>
                <div class="metric-item full-width">
                    <span class="metric-label">Institutional Ownership</span>
                    <div class="ownership-bar">
                        <div class="ownership-fill institutional"
                            :style="{ width: (financials.heldPercentInstitutions * 100) + '%' }"></div>
                    </div>
                    <span class="metric-value">{{ formatPercent(financials.heldPercentInstitutions) }}</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Shares Outstanding</span>
                    <span class="metric-value">{{ formatLargeNumber(financials.sharesOutstanding) }}</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Float Shares</span>
                    <span class="metric-value">{{ formatLargeNumber(financials.floatShares) }}</span>
                </div>
            </div>

            <!-- Moving Averages Tab -->
            <div class="metrics-grid" v-if="activeTab === 'technicals'">
                <div class="metric-item">
                    <span class="metric-label">50-Day MA</span>
                    <span class="metric-value"
                        :class="currentPrice > financials.fiftyDayAverage ? 'positive' : 'negative'">
                        {{ formatPrice(financials.fiftyDayAverage) }}
                    </span>
                    <span class="metric-hint" v-if="financials.fiftyDayAverage && currentPrice">
                        {{ currentPrice > financials.fiftyDayAverage ? 'Above' : 'Below' }}
                        ({{ ((currentPrice / financials.fiftyDayAverage - 1) * 100).toFixed(1) }}%)
                    </span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">200-Day MA</span>
                    <span class="metric-value"
                        :class="currentPrice > financials.twoHundredDayAverage ? 'positive' : 'negative'">
                        {{ formatPrice(financials.twoHundredDayAverage) }}
                    </span>
                    <span class="metric-hint" v-if="financials.twoHundredDayAverage && currentPrice">
                        {{ currentPrice > financials.twoHundredDayAverage ? 'Above' : 'Below' }}
                        ({{ ((currentPrice / financials.twoHundredDayAverage - 1) * 100).toFixed(1) }}%)
                    </span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Avg Volume</span>
                    <span class="metric-value">{{ formatLargeNumber(financials.averageVolume) }}</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">Book Value</span>
                    <span class="metric-value">{{ formatPrice(financials.bookValue) }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
	financials: any;
	analyst: any;
	currentPrice: number;
	symbol?: string;
}>();

const activeTab = ref<"risk" | "profit" | "ownership" | "technicals">("risk");

const advancedTabs = [
	{ key: "risk", label: "Risk" },
	{ key: "profit", label: "Profit" },
	{ key: "ownership", label: "Ownership" },
	{ key: "technicals", label: "Technicals" },
] as const;

// Detect market from symbol to determine currency
const isIndonesian = computed(() => {
	return props.symbol?.endsWith(".JK") || props.symbol?.endsWith(".JK");
});

const currencySymbol = computed(() => {
	if (isIndonesian.value) return "Rp";
	return "$";
});

const hasAdvancedData = computed(() => {
	const f = props.financials;
	return (
		f &&
		(f.beta != null ||
			f.debtToEquity != null ||
			f.returnOnEquity != null ||
			f.returnOnAssets != null ||
			f.heldPercentInsiders != null ||
			f.fiftyDayAverage != null)
	);
});

// === Formatting Functions ===

function formatNumber(num: number | null | undefined, decimals = 2): string {
	if (num == null || Number.isNaN(num)) return "-";
	return num.toFixed(decimals);
}

function formatPercent(ratio: number | null | undefined): string {
	if (ratio == null || Number.isNaN(ratio)) return "-";
	return `${(ratio * 100).toFixed(2)}%`;
}

function formatPrice(price: number | null | undefined): string {
	if (price == null || Number.isNaN(price)) return "-";
	// For IDR, don't show decimals for small prices
	if (isIndonesian.value && price >= 1) {
		return price.toLocaleString("id-ID", { maximumFractionDigits: 0 });
	}
	return price.toFixed(2);
}

function formatLargeNumber(num: number | null | undefined): string {
	if (num == null || Number.isNaN(num)) return "-";
	if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
	if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
	if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
	if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
	return num.toLocaleString();
}

function formatCurrency(num: number | null | undefined): string {
	if (num == null || Number.isNaN(num)) return "-";
	// Just format as large number, currency symbol added in UI if needed
	return formatLargeNumber(num);
}

function calculateRangePercent(fin: any): number {
	if (!fin.fiftyTwoWeekHigh || !fin.fiftyTwoWeekLow || !props.currentPrice) return 50;
	const range = fin.fiftyTwoWeekHigh - fin.fiftyTwoWeekLow;
	const current = props.currentPrice - fin.fiftyTwoWeekLow;
	return Math.max(0, Math.min(100, (current / range) * 100));
}

function formatRatingObj(key: string): string {
	if (!key) return "N/A";
	return key.replace("-", " ").toUpperCase();
}

// === Classification Functions ===

function getRatingClass(key: string): string {
	if (!key) return "";
	if (key.includes("buy")) return "positive";
	if (key.includes("sell")) return "negative";
	return "neutral";
}

function getBetaClass(beta: number | null): string {
	if (beta == null) return "";
	if (beta > 1.5) return "high-risk";
	if (beta < 0.8) return "low-risk";
	return "";
}

function getDebtClass(ratio: number | null): string {
	if (ratio == null) return "";
	if (ratio > 2) return "high-risk";
	if (ratio < 0.5) return "low-risk";
	return "";
}

function getCurrentRatioClass(ratio: number | null): string {
	if (ratio == null) return "";
	if (ratio >= 1.5) return "positive";
	if (ratio < 1) return "negative";
	return "";
}

function getROEClass(roe: number | null): string {
	if (roe == null) return "";
	if (roe > 0.15) return "positive";
	if (roe < 0) return "negative";
	return "";
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
    margin-bottom: 24px;
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

/* Advanced Section */
.advanced-section {
    background: var(--card-bg, rgba(0, 0, 0, 0.03));
    border-radius: 16px;
    padding: 16px;
    border: 1px solid var(--chart-border, rgba(0, 0, 0, 0.08));
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 12px;
}

.section-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--f7-text-color);
}

.tab-switch {
    display: flex;
    background: var(--card-bg, rgba(0, 0, 0, 0.06));
    border-radius: 8px;
    padding: 2px;
    gap: 2px;
}

.tab-btn {
    font-size: 11px;
    padding: 6px 10px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--muted-text, #6b7280);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
}

.tab-btn:hover {
    background: rgba(0, 0, 0, 0.05);
}

.tab-btn.active {
    background: var(--f7-theme-color);
    color: white;
    font-weight: 600;
}

.metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

.metric-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background: var(--card-bg, rgba(0, 0, 0, 0.04));
    border-radius: 10px;
}

.metric-item.full-width {
    grid-column: span 2;
}

.metric-label {
    font-size: 11px;
    color: var(--muted-text, #6b7280);
    text-transform: uppercase;
    letter-spacing: 0.3px;
}

.metric-value {
    font-size: 15px;
    font-weight: 600;
    color: var(--f7-text-color);
}

.metric-value.positive {
    color: var(--positive-color, #10b981);
}

.metric-value.negative {
    color: var(--negative-color, #ef4444);
}

.metric-value.high-risk {
    color: var(--negative-color, #ef4444);
}

.metric-value.low-risk {
    color: var(--positive-color, #10b981);
}

.metric-hint {
    font-size: 10px;
    color: var(--muted-text, #9ca3af);
    font-style: italic;
}

/* Ownership bars */
.ownership-bar {
    height: 6px;
    background: var(--chart-border, rgba(0, 0, 0, 0.1));
    border-radius: 3px;
    overflow: hidden;
    margin: 4px 0;
}

.ownership-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
}

.ownership-fill.insider {
    background: linear-gradient(90deg, #8b5cf6, #a78bfa);
}

.ownership-fill.institutional {
    background: linear-gradient(90deg, #3b82f6, #60a5fa);
}
</style>
