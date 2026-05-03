<template>
  <f7-page style="height: 100vh;">
    <!-- Views/Tabs Wrapper -->
    <f7-tabs animated style="height: 100%;">
      <f7-tab id="tab-home" class="page-content" tab-active>
        <HomePage />
      </f7-tab>
      <f7-tab id="tab-portfolio" class="page-content">
        <PortfolioPage />
      </f7-tab>
      <f7-tab id="tab-strategy" class="page-content">
        <StrategyPage />
      </f7-tab>
      <f7-tab id="tab-explore" class="page-content">
        <ExplorePage />
      </f7-tab>
      <f7-tab id="tab-monitoring" class="page-content">
        <MonitoringPage />
      </f7-tab>
      <f7-tab id="tab-settings" class="page-content">
        <SettingsPage />
      </f7-tab>
    </f7-tabs>


    <!-- Bottom Tabbar -->
    <f7-toolbar tabbar icons bottom class="main-tabbar">
      <f7-link tab-link="#tab-home" tab-link-active icon-ios="f7:house_fill" icon-md="material:home" text="Home">
      </f7-link>
      <f7-link tab-link="#tab-portfolio" icon-ios="f7:chart_pie_fill" icon-md="material:pie_chart" text="Assets">
      </f7-link>
      <f7-link tab-link="#tab-strategy" icon-ios="f7:chart_bar_square_fill" icon-md="material:analytics"
        text="Strategy">
      </f7-link>
      <f7-link tab-link="#tab-explore" icon-ios="f7:compass_fill" icon-md="material:explore" text="Explore">
      </f7-link>
      <f7-link tab-link="#tab-monitoring" icon-ios="f7:bolt_fill" icon-md="material:bolt" text="Harvest">
      </f7-link>
      <f7-link tab-link="#tab-settings" icon-ios="f7:gear_alt_fill" icon-md="material:settings" text="Settings">
      </f7-link>
    </f7-toolbar>
  </f7-page>
</template>

<script setup lang="ts">
import { onUpdated } from "vue";
import ExplorePage from "../pages/explore/ExplorePage.vue";
import HomePage from "../pages/home/HomePage.vue";
import PortfolioPage from "../pages/portfolio/PortfolioPage.vue";
import MonitoringPage from "../pages/monitoring/MonitoringPage.vue";
import SettingsPage from "../pages/settings/SettingsPage.vue";
import StrategyPage from "../pages/strategy/StrategyPage.vue";
import { createLogger } from "../utils/logger";

const logger = createLogger("MainLayout");

onUpdated(() => {
	logger.info("[Perf] MainLayout Updated");
});
</script>

<style scoped>
.main-tabbar {
  --f7-toolbar-bg-color: var(--f7-bars-bg-color);
}

/* Tab content transition */
:deep(.tab) {
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

:deep(.tab.tab-active) {
  opacity: 1;
  pointer-events: auto;
}

/* Active tab link indicator animation */
:deep(.tab-link-active) {
  transition: color 0.2s ease;
}

:deep(.tab-link-active .icon) {
  transform: scale(1.05);
  transition: transform 0.15s ease;
}

/* Subtle press effect on tab icon */
:deep(.tabbar .link:active .icon) {
  transform: scale(0.9);
  transition: transform 0.1s ease;
}
</style>
