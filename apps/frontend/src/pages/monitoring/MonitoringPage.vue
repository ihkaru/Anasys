<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { api } from "../../api/client";

const stats = ref<any>(null);
const loading = ref(true);
const error = ref<string | null>(null);
let timer: any = null;

const fetchStats = async () => {
	try {
		const res = await api.get("/market/internal/monitoring");
		if (res.data.success) {
			stats.value = res.data.data;
			error.value = null;
		}
	} catch (err: any) {
		console.error("Failed to fetch monitoring stats:", err);
		error.value = "Connection Lost";
	} finally {
		loading.value = false;
	}
};

onMounted(() => {
	fetchStats();
	timer = setInterval(fetchStats, 5000);
});

onUnmounted(() => {
	if (timer) clearInterval(timer);
});

const progressPercent = computed(() => {
	if (!stats.value) return 0;
	return parseFloat(stats.value.tasks.percentage);
});
</script>

<template>
  <div class="monitoring-container">
    <div class="header">
      <div class="title-group">
        <h1>Engine Harvest Monitor</h1>
        <div class="live-indicator">
          <span class="dot"></span>
          LIVE
        </div>
      </div>
      <div v-if="stats" class="timestamp">
        Last Update: {{ new Date(stats.timestamp).toLocaleTimeString() }}
      </div>
    </div>

    <div v-if="loading && !stats" class="loading-state">
      <div class="spinner"></div>
      <p>Establishing Telemetry...</p>
    </div>

    <div v-else-if="error && !stats" class="error-state">
      <p>⚠️ {{ error }}</p>
      <button @click="fetchStats">Retry Connection</button>
    </div>

    <div v-if="stats" class="bento-grid">
      <!-- Throughput Card -->
      <div class="card throughput">
        <div class="card-label">Real-time Throughput</div>
        <div class="main-val">{{ stats.candles.cps }}</div>
        <div class="sub-label">Candles / sec</div>
        
        <div class="mini-stats">
          <div class="mini-item">
            <span class="m-label">Task Velocity</span>
            <span class="m-val">{{ stats.tasks.tps }} /s</span>
          </div>
        </div>
      </div>

      <!-- Progress Card -->
      <div class="card progress">
        <div class="card-label">Backfill Completion</div>
        <div class="progress-circle-container">
          <svg viewBox="0 0 36 36" class="circular-chart">
            <path class="circle-bg"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path class="circle"
              :stroke-dasharray="`${progressPercent}, 100`"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <text x="18" y="20.35" class="percentage">{{ progressPercent }}%</text>
          </svg>
        </div>
        <div class="mini-item center">
          <span class="m-label">Tasks Done</span>
          <span class="m-val">{{ stats.tasks.completed.toLocaleString() }} / {{ stats.tasks.total.toLocaleString() }}</span>
        </div>
      </div>

      <!-- Estimate Card -->
      <div class="card estimate">
        <div class="card-label">ETA to Completion</div>
        <div class="eta-val">{{ stats.estimate.timeRemaining }}</div>
        <div class="eta-icon">⏳</div>
      </div>

      <!-- Status Table Card -->
      <div class="card table-card full-width">
        <div class="card-label">Interval Status Breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Interval</th>
              <th>Progress</th>
              <th>Total Tasks</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in stats.breakdown" :key="item.interval">
              <td><code>{{ item.interval }}</code></td>
              <td class="table-progress">
                <div class="p-bar-bg">
                  <div class="p-bar-fill" :style="{ width: (item.completed/item.total * 100) + '%' }"></div>
                </div>
                <span>{{ ((item.completed/item.total) * 100).toFixed(1) }}%</span>
              </td>
              <td>{{ item.total.toLocaleString() }}</td>
              <td>
                <span :class="['status-tag', item.completed === item.total ? 'done' : 'active']">
                  {{ item.completed === item.total ? 'Completed' : 'Harvesting' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.monitoring-container {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
  color: #fff;
  font-family: 'Inter', sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 32px;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 16px;
}

h1 {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #fff 0%, #aaa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.live-indicator {
  background: rgba(0, 255, 100, 0.1);
  border: 1px solid rgba(0, 255, 100, 0.2);
  color: #00ff64;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 6px;
  height: 6px;
  background: #00ff64;
  border-radius: 50%;
  box-shadow: 0 0 10px #00ff64;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}

.timestamp {
  font-size: 12px;
  color: #666;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border-radius: 24px;
  padding: 24px;
  transition: transform 0.3s ease, border-color 0.3s ease;
}

.card:hover {
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.full-width {
  grid-column: span 3;
}

.card-label {
  font-size: 13px;
  font-weight: 500;
  color: #888;
  margin-bottom: 20px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.main-val {
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -1px;
  margin-bottom: 4px;
}

.sub-label {
  color: #666;
  font-size: 14px;
  margin-bottom: 24px;
}

.mini-stats {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 16px;
}

.mini-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.center {
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
}

.m-label {
  font-size: 12px;
  color: #666;
}

.m-val {
  font-size: 14px;
  font-weight: 600;
  color: #ccc;
}

/* Progress Circle */
.progress-circle-container {
  display: flex;
  justify-content: center;
  height: 120px;
}

.circular-chart {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  max-height: 120px;
}

.circle-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.05);
  stroke-width: 2.8;
}

.circle {
  fill: none;
  stroke: #3b82f6;
  stroke-width: 2.8;
  stroke-linecap: round;
  transition: stroke-dasharray 1s ease;
}

.percentage {
  fill: #fff;
  font-size: 8px;
  font-weight: 700;
  text-anchor: middle;
}

.eta-val {
  font-size: 32px;
  font-weight: 700;
  color: #3b82f6;
}

.eta-icon {
  font-size: 24px;
  margin-top: 12px;
  opacity: 0.5;
}

/* Table */
table {
  width: 100%;
  border-collapse: collapse;
}

th {
  text-align: left;
  font-size: 12px;
  color: #555;
  padding: 12px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

td {
  padding: 16px 8px;
  font-size: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.table-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 200px;
}

.p-bar-bg {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  overflow: hidden;
}

.p-bar-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 10px;
  transition: width 1s ease;
}

code {
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  color: #3b82f6;
}

.status-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.status-tag.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.status-tag.done {
  background: rgba(0, 255, 100, 0.1);
  color: #00ff64;
}

/* Loading/Error States */
.loading-state, .error-state {
  height: 400px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 24px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(59, 130, 246, 0.1);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

button {
  background: #3b82f6;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
}

@media (max-width: 900px) {
  .bento-grid {
    grid-template-columns: 1fr;
  }
  .full-width {
    grid-column: span 1;
  }
}
</style>
