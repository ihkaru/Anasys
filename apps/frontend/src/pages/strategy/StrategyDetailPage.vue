<template>
  <f7-page name="strategy-detail">
    <f7-navbar :title="strategy?.name || 'Strategy'" back-link="Back">
      <f7-nav-right>
        <f7-link icon-ios="f7:share" icon-md="material:share"></f7-link>
        <f7-link :icon-ios="isFollowing ? 'f7:checkmark_circle_fill' : 'f7:plus_circle'"
          :icon-md="isFollowing ? 'material:check_circle' : 'material:add_circle'" @click="toggleFollow"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <div v-if="strategy">
      <!-- Strategy Header -->
      <div class="strategy-header" :style="{ backgroundColor: strategy.color }">
        <div class="header-content">
          <f7-icon :ios="strategy.icon" :md="strategy.iconMd" size="48" color="white"></f7-icon>
          <h1>{{ strategy.name }}</h1>
          <div class="badges">
            <span class="badge-pill white-text">+{{ strategy.returnYear }}% 1Y</span>
            <span class="badge-pill white-text">{{ strategy.risk }} Risk</span>
          </div>
        </div>
      </div>

      <!-- Thesis Section -->
      <f7-block-title>Investment Thesis</f7-block-title>
      <f7-block strong inset>
        <p>{{ strategy.thesis }}</p>
        <div class="tags">
          <f7-chip v-for="tag in strategy.tags" :key="tag" :text="tag" outline></f7-chip>
        </div>
      </f7-block>

      <!-- Chart Section -->
      <f7-block-title>Performance & Signals</f7-block-title>
      <f7-block class="chart-block">
        <div class="chart-container">
          <!-- Placeholder for Interactive Chart -->
          <div class="mock-chart">
            <div class="chart-controls">
              <f7-segmented round small>
                <f7-button active>1D</f7-button>
                <f7-button>1W</f7-button>
                <f7-button>1M</f7-button>
                <f7-button>1Y</f7-button>
              </f7-segmented>
              <f7-button small fill @click="toggleFullScreen">
                <f7-icon ios="f7:arrow_up_left_arrow_down_right" md="material:fullscreen"></f7-icon>
              </f7-button>
            </div>

            <div class="chart-viz">
              <!-- Simple SVG Mock Chart with Markers -->
              <svg width="100%" height="200" viewBox="0 0 300 100" preserveAspectRatio="none">
                <path d="M0,80 Q30,70 60,85 T120,60 T180,70 T240,40 T300,20" fill="none" stroke="#10b981"
                  stroke-width="2" />
                <!-- Buy Marker -->
                <circle cx="120" cy="60" r="4" fill="#10b981" />
                <text x="120" y="50" font-size="8" fill="#10b981" text-anchor="middle">BUY</text>
                <!-- Sell Marker -->
                <circle cx="240" cy="40" r="4" fill="#ef4444" />
                <text x="240" y="30" font-size="8" fill="#ef4444" text-anchor="middle">SELL</text>
              </svg>
            </div>

            <div class="chart-legend">
              <span><span class="dot buy"></span> Buy Signal</span>
              <span><span class="dot sell"></span> Sell Signal</span>
            </div>
          </div>
        </div>
      </f7-block>

      <!-- Actionable Advice -->
      <f7-block-title>Your Portfolio Action Plan</f7-block-title>
      <f7-list media-list inset>
        <f7-list-item title="Buy AAPL" subtitle="Strategy aligns with increasing AAPL position.">
          <template #media>
            <f7-icon ios="f7:cart_fill" md="material:shopping_cart" color="green"></f7-icon>
          </template>
          <template #after>
            <div class="action-row">
              <span>Target: 15%</span>
            </div>
          </template>
        </f7-list-item>
        <f7-list-item title="Trim MSFT" subtitle="Rebalancing required to match target allocation.">
          <template #media>
            <f7-icon ios="f7:scissors" md="material:content_cut" color="orange"></f7-icon>
          </template>
          <template #after>
            <div class="action-row">
              <span>Target: 10%</span>
            </div>
          </template>
        </f7-list-item>
      </f7-list>

      <f7-block>
        <f7-button fill large raised @click="toggleFollow" :color="isFollowing ? 'red' : 'blue'">
          {{ isFollowing ? 'Unfollow Strategy' : 'Follow Strategy' }}
        </f7-button>
      </f7-block>
    </div>
  </f7-page>
</template>

<script setup lang="ts">
import { f7 } from "framework7-vue";
import { computed, ref } from "vue";

const props = defineProps<{
	id: string;
}>();

const isFollowing = ref(false);

// Formatting dummy data based on ID
const strategy = computed(() => {
	// Mock Data store
	const strategies: Record<string, any> = {
		"1": {
			id: "1",
			name: "Big Tech Momentum",
			description: "Trend following strategy for large cap tech stocks.",
			returnYear: 42.5,
			risk: "High",
			color: "#3b82f6",
			icon: "f7:rocket_fill",
			iconMd: "material:rocket_launch",
			thesis:
				"This strategy capitalizes on the momentum of mega-cap technology stocks. By utilizing a 50/200 day SMA crossover technique combined with RSI filters, we identify strong uptrends while avoiding overbought conditions. The current market environment favors scalable tech infrastructure.",
			tags: ["Growth", "Tech", "Momentum"],
		},
		"2": {
			id: "2",
			name: "Dividend Aristocrats",
			description: "Safe, high-yield dividend paying companies.",
			returnYear: 12.8,
			risk: "Low",
			color: "#10b981",
			icon: "f7:money_dollar_circle_fill",
			iconMd: "material:attach_money",
			thesis:
				"In uncertain economic times, cash flow is king. This strategy focuses on companies with a 25+ year history of increasing dividends. It provides steady income with lower volatility than the broader market.",
			tags: ["Income", "Stability", "Value"],
		},
		"3": {
			id: "3",
			name: "Crypto Swing",
			description: "Active swing trading for top 10 cryptocurrencies.",
			returnYear: 85.2,
			risk: "Very High",
			color: "#8b5cf6",
			icon: "f7:bitcoin_circle_fill",
			iconMd: "material:currency_bitcoin",
			thesis:
				"Crypto markets exhibit strong volatility cycles. This strategy uses Bollinger Bands and MACD to capture swings in major crypto assets like BTC and ETH, taking profits during rapid expansions.",
			tags: ["Crypto", "Swing", "High Risk"],
		},
	};
	return strategies[props.id] || strategies["1"];
});

function toggleFollow() {
	isFollowing.value = !isFollowing.value;
	if (isFollowing.value) {
		f7.toast.show({ text: "Strategy Followed!", closeTimeout: 2000, position: "center" });
	} else {
		f7.toast.show({ text: "Unfollowed Strategy", closeTimeout: 2000, position: "center" });
	}
}

function toggleFullScreen() {
	// Mock full screen - ideally opens a popup or rotates
	f7.dialog.alert("Chart Full Screen Mode (Mock)", "Chart View");
}
</script>

<style scoped>
.strategy-header {
  padding: 40px 20px;
  color: white;
  text-align: center;
}

.header-content h1 {
  margin: 16px 0 8px;
  font-size: 28px;
}

.badges {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 12px;
}

.badge-pill {
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 12px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 14px;
}

.tags {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.chart-container {
  background: var(--f7-card-bg-color);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.chart-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.chart-viz {
  height: 200px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.chart-legend {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 12px;
  font-size: 12px;
  opacity: 0.7;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}

.dot.buy {
  background: #10b981;
}

.dot.sell {
  background: #ef4444;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-row span {
  font-size: 13px;
  color: var(--f7-label-color);
}
</style>
