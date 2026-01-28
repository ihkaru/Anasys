<template>
  <f7-page class="portfolio-page">
    <f7-navbar title="Portfolio" :sliding="false">
      <template #right>
        <f7-link icon-ios="f7:plus_circle" icon-md="material:add_circle" @click="showAddSheet"></f7-link>
      </template>
    </f7-navbar>

    <div class="page-content-inner">
      <PortfolioSummaryCard :total-value="totalValue" :change-amount="totalChange" :change-percent="totalChangePercent"
        :show-balance="showBalance" @toggle-balance="toggleBalance" />

      <AllocationChart :data="allocationData" :colors="allocationColors" />

      <HoldingsList :holdings="enrichedHoldings" @item-click="openHoldingDetail" @item-edit="handleEdit"
        @item-delete="handleDelete" @item-hold="handleHold" @add="showAddSheet" />
    </div>

    <AddHoldingSheet :opened="sheetOpen" :editing="editingHolding" @close="closeSheet" @save="handleSave" />
  </f7-page>
</template>

<script setup lang="ts">
import { f7 } from 'framework7-vue';
import { computed, onMounted, ref } from 'vue';
import { useHoldingsStore, type Holding } from '../../stores/holdings';
import { createLogger } from '../../utils/logger';
import AddHoldingSheet, { type HoldingFormData } from './components/AddHoldingSheet.vue';
import AllocationChart from './components/AllocationChart.vue';
import HoldingsList from './components/HoldingsList.vue';
import PortfolioSummaryCard from './components/PortfolioSummaryCard.vue';

const logger = createLogger('PortfolioPage');
const holdingsStore = useHoldingsStore();

onMounted(async () => {
  logger.debug('PortfolioPage Mounted');
  await holdingsStore.initialize();
});

// UI State
const showBalance = ref(true);
const sheetOpen = ref(false);
const editingHolding = ref<Holding | null>(null);

// Computed from store
const totalValue = computed(() => holdingsStore.totalValue);
const totalChange = computed(() => holdingsStore.totalPnl);
const totalChangePercent = computed(() => holdingsStore.totalPnlPercent);

const allocationData = computed(() =>
  holdingsStore.allocation.map(a => ({
    label: a.ticker,
    percent: a.percent,
  }))
);

// We assume holding object in store matches what HoldingItem expects or has enough fields
// Enriched holdings logic (sparkline fallback, etc)
const enrichedHoldings = computed(() =>
  holdingsStore.holdings.map(h => ({
    ...h,
    sparkline: h.sparkline && h.sparkline.length > 0
      ? h.sparkline
      : generateFallbackSparkline(h.pnlPercent >= 0),
  }))
);

const allocationColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
];

// Fallback sparkline
function generateFallbackSparkline(positive: boolean): number[] {
  // Simple straight line or slight curve simulation
  return positive ? [100, 102, 104, 103, 105, 108] : [100, 98, 96, 97, 95, 92];
}

// UI Actions
function toggleBalance() {
  showBalance.value = !showBalance.value;
}

function showAddSheet() {
  editingHolding.value = null;
  sheetOpen.value = true;
}

function closeSheet() {
  sheetOpen.value = false;
  editingHolding.value = null;
}

// Holdings Actions
function handleEdit(holding: Holding) {
  editingHolding.value = holding;
  sheetOpen.value = true;
}

async function handleSave(formData: HoldingFormData) {
  if (editingHolding.value) {
    const result = await holdingsStore.updateHolding(editingHolding.value.id, {
      shares: formData.shares,
      avgCost: formData.avgCost,
    });

    if (result.success) {
      f7.toast.show({ text: 'Holding updated', closeTimeout: 2000 });
    } else {
      f7.toast.show({ text: result.error || 'Failed to update', closeTimeout: 2000 });
    }
  } else {
    const result = await holdingsStore.addHolding(
      formData.ticker.toUpperCase(),
      formData.shares,
      formData.avgCost
    );

    if (result.success) {
      f7.toast.show({ text: `Added ${formData.ticker}`, closeTimeout: 2000 });
    } else {
      f7.toast.show({ text: result.error || 'Failed to add', closeTimeout: 2000 });
    }
  }

  closeSheet();
}

async function handleDelete(holding: Holding) {
  const result = await holdingsStore.deleteHolding(holding.id);

  if (result.success) {
    f7.toast.show({ text: 'Holding removed', closeTimeout: 2000 });
  } else {
    f7.toast.show({ text: 'Failed to remove', closeTimeout: 2000 });
  }
}

function handleHold(holding: Holding) {
  f7.dialog.create({
    title: 'Remove Holding',
    text: `Remove ${holding.ticker} from portfolio?`,
    buttons: [
      { text: 'Cancel', color: 'gray' },
      { text: 'Remove', color: 'red', onClick: () => handleDelete(holding) }
    ]
  }).open();
}

function openHoldingDetail(holding: Holding) {
  logger.debug('Open holding detail:', holding.ticker);
  f7.views.main.router.navigate('/chart/', { props: { ticker: holding.ticker } });
}
</script>

<style scoped>
.portfolio-page {
  background: var(--f7-page-bg-color);
}

.page-content-inner {
  padding-bottom: 80px;
  /* Space for bottom tabbar */
}
</style>
