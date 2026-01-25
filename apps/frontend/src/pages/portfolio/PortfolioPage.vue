<template>
  <div class="page-content portfolio-page-content">
    <f7-navbar title="Portfolio" :sliding="false">
      <template #right>
        <f7-link icon-ios="f7:plus_circle" icon-md="material:add_circle" @click="showAddHoldingSheet"></f7-link>
      </template>
    </f7-navbar>

    <!-- Portfolio Summary Card -->
    <f7-block>
      <div class="portfolio-summary-card">
        <div class="summary-header">
          <span class="summary-label">Total Portfolio Value</span>
          <f7-icon ios="f7:eye_fill" md="material:visibility" size="20" @click="toggleBalance"></f7-icon>
        </div>
        <h1 class="summary-value">{{ showBalance ? formatCurrency(totalValue) : '••••••' }}</h1>
        <div :class="['summary-change', totalChangePercent >= 0 ? 'positive' : 'negative']">
          <f7-icon :ios="totalChangePercent >= 0 ? 'f7:arrow_up_right' : 'f7:arrow_down_right'"
            :md="totalChangePercent >= 0 ? 'material:trending_up' : 'material:trending_down'" size="16"></f7-icon>
          <span>{{ formatCurrency(Math.abs(totalChange)) }} ({{ totalChangePercent >= 0 ? '+' : '' }}{{
            totalChangePercent.toFixed(2) }}%)</span>
        </div>
      </div>
    </f7-block>

    <!-- Allocation Chart Placeholder -->
    <f7-block>
      <div class="allocation-card">
        <h4>Asset Allocation</h4>
        <div class="allocation-chart">
          <div v-for="(item, index) in allocationData" :key="item.label" class="allocation-bar"
            :style="{ width: item.percent + '%', backgroundColor: allocationColors[index] }"></div>
        </div>
        <div class="allocation-legend">
          <div v-for="(item, index) in allocationData" :key="item.label" class="legend-item">
            <span class="legend-dot" :style="{ backgroundColor: allocationColors[index] }"></span>
            <span class="legend-label">{{ item.label }}</span>
            <span class="legend-percent">{{ item.percent.toFixed(1) }}%</span>
          </div>
        </div>
      </div>
    </f7-block>

    <!-- Holdings List -->
    <f7-block-title>Holdings</f7-block-title>
    <f7-list>
      <!-- class "no-swipe-panel" prevents the side panel from opening when swiping this item, ensuring swipeout works explicitly -->
      <f7-list-item v-for="holding in holdings" :key="holding.ticker" :title="holding.ticker"
        :footer="`${holding.shares} shares @ ${formatCurrency(holding.avgCost)}`" swipeout class="no-swipe-panel"
        :class="{ 'item-holding': holdingTicker === holding.ticker }" @click="openHoldingDetail(holding)"
        @contextmenu.prevent @touchstart.passive="startHold(holding)" @touchend="endHold" @touchmove="cancelHold"
        @mousedown="startHold(holding)" @mouseup="endHold" @mouseleave="cancelHold">
        <template #media>
          <div class="asset-icon-wrapper">
            <img v-if="getAssetLogoUrl(holding)" :src="getAssetLogoUrl(holding) || ''" :alt="holding.ticker"
              class="asset-logo" @error="onLogoError($event, holding.ticker)" />
            <div v-else class="asset-icon" :style="{ backgroundColor: getColorForTicker(holding.ticker) }">
              {{ holding.ticker.substring(0, 2) }}
            </div>
          </div>
        </template>
        <template #after>
          <div class="after-content">
            <div class="sparkline-wrapper">
              <SparklineChart :data="holding.sparkline" :positive="holding.pnlPercent >= 0" :width="60" :height="20" />
            </div>
            <div class="price-col">
              <span class="price-text">{{ formatCurrency(holding.currentValue) }}</span>
              <span :class="['change-badge', holding.pnlPercent >= 0 ? 'positive' : 'negative']">
                {{ holding.pnlPercent >= 0 ? '+' : '' }}{{ holding.pnlPercent.toFixed(2) }}%
              </span>
            </div>
          </div>
        </template>
        <f7-swipeout-actions right>
          <f7-swipeout-button @click="editHolding(holding)" color="blue">
            <f7-icon ios="f7:pencil" md="material:edit"></f7-icon>
          </f7-swipeout-button>
          <f7-swipeout-button delete confirm-text="Remove this holding?">
            <f7-icon ios="f7:trash" md="material:delete"></f7-icon>
          </f7-swipeout-button>
        </f7-swipeout-actions>
      </f7-list-item>
    </f7-list>

    <!-- Empty State -->
    <f7-block v-if="holdings.length === 0" class="empty-state">
      <f7-icon ios="f7:cube_box" md="material:inventory_2" size="64" color="gray"></f7-icon>
      <h3>No Holdings Yet</h3>
      <p>Add your first investment to track your portfolio</p>
      <f7-button fill @click="showAddHoldingSheet">Add Holding</f7-button>
    </f7-block>

    <!-- Add Holding Sheet -->
    <f7-sheet class="add-holding-sheet" :opened="addHoldingSheetOpen" @sheet:closed="addHoldingSheetOpen = false"
      swipe-to-close backdrop>
      <f7-toolbar>
        <div class="left">
          <f7-link sheet-close>Cancel</f7-link>
        </div>
        <div class="right">
          <f7-link @click="saveHolding">Save</f7-link>
        </div>
      </f7-toolbar>
      <f7-page-content>
        <f7-block-title large>{{ editingHolding ? 'Edit' : 'Add' }} Holding</f7-block-title>
        <f7-list no-hairlines-md>
          <f7-list-input label="Ticker" type="text" placeholder="e.g. AAPL" :value="holdingForm.ticker"
            @input="holdingForm.ticker = ($event.target as HTMLInputElement).value.toUpperCase()"
            :disabled="!!editingHolding"></f7-list-input>
          <f7-list-input label="Quantity (Shares/Coins)" type="number" placeholder="Number of shares or coins"
            :value="holdingForm.shares"
            @input="holdingForm.shares = parseFloat(($event.target as HTMLInputElement).value)"
            clear-button></f7-list-input>
          <f7-list-input label="Average Buy Price" type="number" placeholder="Avg price per share/coin"
            :value="holdingForm.avgCost"
            @input="holdingForm.avgCost = parseFloat(($event.target as HTMLInputElement).value)"
            clear-button></f7-list-input>
        </f7-list>
      </f7-page-content>
    </f7-sheet>
  </div>
</template>

<script setup lang="ts">
import { f7 } from 'framework7-vue';
import { computed, onMounted, reactive, ref } from 'vue';
import SparklineChart from '../../components/SparklineChart.vue';
import { useHoldingsStore } from '../../stores/holdings';
import { useMarketStore } from '../../stores/market';
import { createLogger } from '../../utils/logger';

const logger = createLogger('PortfolioPage');
const holdingsStore = useHoldingsStore();
const marketStore = useMarketStore();

onMounted(async () => {
  logger.debug('PortfolioPage Mounted');
  // Initialize holdings data
  await holdingsStore.initialize();
});

const showBalance = ref(true);

// Holdings from store
const holdings = computed(() => {
  return holdingsStore.holdings.map(h => ({
    ...h,
    sparkline: h.sparkline && h.sparkline.length > 0 ? h.sparkline : generateFallbackSparkline(h.pnlPercent >= 0),
  }));
});

// Fallback sparkline if no history available
function generateFallbackSparkline(positive: boolean): number[] {
  // Simple straight line or minimal variation if no data
  return positive ? [100, 105, 110] : [100, 95, 90];
}

const totalValue = computed(() => holdingsStore.totalValue);
const totalCost = computed(() => holdingsStore.summary?.totalCost || 0);
const totalChange = computed(() => holdingsStore.totalPnl);
const totalChangePercent = computed(() => holdingsStore.totalPnlPercent);

const allocationData = computed(() => {
  return holdingsStore.allocation.map(a => ({
    label: a.ticker,
    percent: a.percent,
  }));
});

const allocationColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// Add/Edit Holding
const addHoldingSheetOpen = ref(false);
const editingHolding = ref<any>(null);
const holdingForm = reactive({
  ticker: '',
  shares: 0,
  avgCost: 0,
});

function toggleBalance() {
  showBalance.value = !showBalance.value;
}

function showAddHoldingSheet() {
  editingHolding.value = null;
  holdingForm.ticker = '';
  holdingForm.shares = 0;
  holdingForm.avgCost = 0;
  addHoldingSheetOpen.value = true;
}

function editHolding(holding: any) {
  editingHolding.value = holding;
  holdingForm.ticker = holding.ticker;
  holdingForm.shares = holding.shares;
  holdingForm.avgCost = holding.avgCost;
  addHoldingSheetOpen.value = true;
}

async function saveHolding() {
  if (!holdingForm.ticker || holdingForm.shares <= 0 || holdingForm.avgCost <= 0) {
    f7.toast.show({ text: 'Please fill all fields', closeTimeout: 2000 });
    return;
  }

  if (editingHolding.value) {
    // Update existing
    const result = await holdingsStore.updateHolding(editingHolding.value.id, {
      shares: holdingForm.shares,
      avgCost: holdingForm.avgCost,
    });
    if (result.success) {
      f7.toast.show({ text: 'Holding updated', closeTimeout: 2000 });
    } else {
      f7.toast.show({ text: result.error || 'Failed to update', closeTimeout: 2000 });
    }
  } else {
    // Add new
    const result = await holdingsStore.addHolding(
      holdingForm.ticker.toUpperCase(),
      holdingForm.shares,
      holdingForm.avgCost
    );
    if (result.success) {
      f7.toast.show({ text: `Added ${holdingForm.ticker}`, closeTimeout: 2000 });
    } else {
      f7.toast.show({ text: result.error || 'Failed to add', closeTimeout: 2000 });
    }
  }

  addHoldingSheetOpen.value = false;
}

async function removeHolding(holding: any) {
  const result = await holdingsStore.deleteHolding(holding.id);
  if (result.success) {
    f7.toast.show({ text: 'Holding removed', closeTimeout: 2000 });
  } else {
    f7.toast.show({ text: 'Failed to remove', closeTimeout: 2000 });
  }
}

function openHoldingDetail(holding: any) {
  logger.debug('Open holding detail:', holding.ticker);
  f7.views.main.router.navigate('/chart/', { props: { ticker: holding.ticker } });
}

function formatCurrency(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getColorForTicker(ticker: string): string {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Track failed logos to avoid infinite retry
const failedLogos = ref<Set<string>>(new Set());

function getAssetLogoUrl(item: any): string | null {
  if (failedLogos.value.has(item.ticker)) {
    return null;
  }

  if (item.iconUrl) {
    return item.iconUrl;
  }

  // For crypto, use CoinCap icons
  if (item.ticker.includes('-USD')) {
    const baseSymbol = item.ticker.split('-')[0].toLowerCase();
    return `https://assets.coincap.io/assets/icons/${baseSymbol}@2x.png`;
  }

  // For stocks, use Clearbit if website available
  if (item.website) {
    try {
      const url = new URL(item.website);
      const domain = url.hostname.replace('www.', '');
      return `https://logo.clearbit.com/${domain}`;
    } catch {
      // Invalid URL
    }
  }

  return null;
}

function onLogoError(event: Event, ticker: string) {
  failedLogos.value.add(ticker);
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
}

// -- Hold / Long Press Logic with Visual Feedback --
const holdingTicker = ref<string | null>(null);
let holdTimer: any = null;
const HOLD_DURATION = 600;

function startHold(item: any) {
  holdingTicker.value = item.ticker;

  holdTimer = setTimeout(() => {
    onItemHold(item);
    holdingTicker.value = null;
  }, HOLD_DURATION);
}

function cancelHold() {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
  holdingTicker.value = null;
}

function endHold() {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
  setTimeout(() => {
    holdingTicker.value = null;
  }, 100);
}

function onItemHold(holding: any) {
  f7.dialog.create({
    title: 'Remove Holding',
    text: `Remove ${holding.ticker} from portfolio?`,
    buttons: [
      {
        text: 'Cancel',
        color: 'gray'
      },
      {
        text: 'Remove',
        color: 'red',
        onClick: () => removeHolding(holding)
      }
    ]
  }).open();
}
</script>

<style scoped>
.portfolio-summary-card {
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  border-radius: 16px;
  padding: 24px;
  color: white;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-label {
  font-size: 14px;
  opacity: 0.9;
}

.summary-value {
  font-size: 36px;
  font-weight: 700;
  margin: 8px 0;
}

.summary-change {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  padding: 6px 12px;
  border-radius: 20px;
  width: fit-content;
}

.summary-change.positive {
  background: rgba(255, 255, 255, 0.2);
}

.summary-change.negative {
  background: rgba(239, 68, 68, 0.3);
}

.allocation-card {
  background: var(--f7-card-bg-color);
  border-radius: 12px;
  padding: 16px;
}

.allocation-card h4 {
  margin: 0 0 12px;
  font-size: 14px;
  opacity: 0.7;
}

.allocation-chart {
  display: flex;
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--f7-page-bg-color);
}

.allocation-bar {
  height: 100%;
  transition: width 0.3s ease;
}

.allocation-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-percent {
  opacity: 0.6;
}

.holdings-list {
  margin-top: 0;
}

.asset-icon-wrapper {
  width: 44px;
  height: 44px;
  position: relative;
}

.asset-logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--f7-page-bg-color);
}

.asset-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 14px;
}

.after-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.price-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.price-text {
  font-weight: 600;
  font-size: 14px;
}

.change-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
}

.change-badge.positive {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.change-badge.negative {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
}

.empty-state h3 {
  margin: 16px 0 8px;
}

.empty-state p {
  margin: 0 0 24px;
  opacity: 0.6;
}

.add-holding-sheet {
  height: auto;
  max-height: 60%;
}

/* Visual Feedback Class */
.item-holding {
  transform: scale(0.97);
  background-color: var(--f7-list-bg-color);
  filter: brightness(0.95);
  transition: all 0.2s ease-out;
}
</style>
