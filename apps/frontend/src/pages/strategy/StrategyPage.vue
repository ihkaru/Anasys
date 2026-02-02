<template>
  <!-- Strategy Browser Page -->
  <div class="page-content strategy-browser-page">
    <f7-navbar title="Strategies" :sliding="false"></f7-navbar>

    <!-- Strategy Categories/Filters could go here -->
    
    <!-- Strategy List -->
    <div class="strategy-list">
      <div 
        v-for="strategy in strategies" 
        :key="strategy.id" 
        class="strategy-card"
        @click="openStrategy(strategy)"
      >
        <div class="card-header-bg" :style="{ backgroundColor: strategy.color }">
          <f7-icon :ios="strategy.icon" :md="strategy.iconMd" size="32" color="white"></f7-icon>
        </div>
        <div class="card-content">
          <div class="card-top">
            <h3>{{ strategy.name }}</h3>
            <span class="risk-badge" :class="strategy.risk.toLowerCase()">{{ strategy.risk }} Risk</span>
          </div>
          <p class="description">{{ strategy.description }}</p>
          <div class="card-metrics">
            <div class="metric">
              <span class="label">1Y Return</span>
              <span class="value positive">+{{ strategy.returnYear }}%</span>
            </div>
            <div class="metric">
              <span class="label">Followers</span>
              <span class="value">{{ strategy.followers }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { f7 } from "framework7-vue";
import { ref } from "vue";

const strategies = ref([
	{
		id: "1",
		name: "Big Tech Momentum",
		description: "Trend following strategy for large cap tech stocks.",
		returnYear: 42.5,
		risk: "High",
		followers: "12.4k",
		color: "#3b82f6",
		icon: "f7:rocket_fill",
		iconMd: "material:rocket_launch",
	},
	{
		id: "2",
		name: "Dividend Aristocrats",
		description: "Safe, high-yield dividend paying companies.",
		returnYear: 12.8,
		risk: "Low",
		followers: "8.1k",
		color: "#10b981",
		icon: "f7:money_dollar_circle_fill",
		iconMd: "material:attach_money",
	},
	{
		id: "3",
		name: "Crypto Swing",
		description: "Active swing trading for top 10 cryptocurrencies.",
		returnYear: 85.2,
		risk: "Very High",
		followers: "24.5k",
		color: "#8b5cf6",
		icon: "f7:bitcoin_circle_fill",
		iconMd: "material:currency_bitcoin",
	},
]);

function openStrategy(strategy: any) {
	f7.views.main.router.navigate(`/strategy/${strategy.id}/`);
}
</script>

<style scoped>
.strategy-list {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.strategy-card {
  background: var(--f7-card-bg-color);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  cursor: pointer;
  transition: transform 0.2s;
}

.strategy-card:active {
  transform: scale(0.98);
}

.card-header-bg {
  height: 80px;
  padding: 16px;
  display: flex;
  align-items: flex-end;
}

.card-content {
  padding: 16px;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.card-top h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.risk-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.risk-badge.low { background: #d1fae5; color: #059669; }
.risk-badge.high { background: #fee2e2; color: #ef4444; }
.risk-badge.very { background: #f3e8ff; color: #7c3aed; }

.description {
  margin: 0 0 16px;
  font-size: 14px;
  opacity: 0.7;
  line-height: 1.4;
}

.card-metrics {
  display: flex;
  gap: 24px;
}

.metric {
  display: flex;
  flex-direction: column;
}

.metric .label {
  font-size: 11px;
  opacity: 0.5;
  text-transform: uppercase;
  font-weight: 600;
}

.metric .value {
  font-size: 16px;
  font-weight: 700;
}

.metric .value.positive {
  color: #10b981;
}
</style>
