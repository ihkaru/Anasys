<template>
  <f7-page style="height: 100vh;">
    <!-- Views/Tabs Wrapper -->

    <f7-tabs swipeable style="height: 100%;">
      <f7-tab id="tab-home" tab-active>
        <HomePage />
      </f7-tab>
      <f7-tab id="tab-portfolio">
        <PortfolioPage />
      </f7-tab>
      <f7-tab id="tab-strategy">
        <StrategyPage />
      </f7-tab>
      <f7-tab id="tab-explore">
        <ExplorePage />
      </f7-tab>
      <f7-tab id="tab-settings">
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
      <f7-link tab-link="#tab-settings" icon-ios="f7:gear_alt_fill" icon-md="material:settings" text="Settings">
      </f7-link>
    </f7-toolbar>
  </f7-page>
</template>

<script setup lang="ts">
import ExplorePage from '../pages/explore/ExplorePage.vue';
import HomePage from '../pages/home/HomePage.vue';
import PortfolioPage from '../pages/portfolio/PortfolioPage.vue';
import SettingsPage from '../pages/settings/SettingsPage.vue';
import StrategyPage from '../pages/strategy/StrategyPage.vue';
</script>

<style scoped>
.main-tabbar {
  --f7-toolbar-bg-color: var(--f7-bars-bg-color);
}
</style>
