<template>
  <div class="page-content settings-page-content">
    <f7-navbar title="Settings" :sliding="false"></f7-navbar>

    <!-- Profile Section -->
    <f7-block class="profile-block">
      <div class="profile-card">
        <div class="profile-avatar">
          <f7-icon ios="f7:person_circle_fill" md="material:account_circle" size="72" color="primary"></f7-icon>
        </div>
        <div class="profile-info">
          <h2 class="profile-name">{{ auth.user?.name || 'Guest User' }}</h2>
          <p class="profile-email">{{ auth.user?.email || 'Not signed in' }}</p>
        </div>
        <f7-button fill round small class="edit-profile-btn" v-if="auth.user">Edit Profile</f7-button>
      </div>
    </f7-block>

    <!-- Preferences -->
    <f7-block-title>Preferences</f7-block-title>
    <f7-list inset>
      <f7-list-item title="Appearance" :after="themeStore.themeLabel" link="#" @click="showThemePicker">
        <template #media>
          <f7-icon :ios="themeStore.themeIcon.ios" :md="themeStore.themeIcon.md"
            :color="themeStore.isDark ? 'purple' : 'orange'"></f7-icon>
        </template>
      </f7-list-item>
      <f7-list-item title="Default Currency" :after="settingsStore.currency" link="#" @click="showCurrencyPicker">
        <template #media>
          <f7-icon ios="f7:dollarsign_circle_fill" md="material:attach_money" color="green"></f7-icon>
        </template>
      </f7-list-item>
      <f7-list-item title="Notifications" :after="settingsStore.notifications ? 'Enabled' : 'Disabled'">
        <template #media>
          <f7-icon ios="f7:bell_fill" md="material:notifications" color="orange"></f7-icon>
        </template>
        <template #after>
          <f7-toggle :checked="settingsStore.notifications" @toggle:change="toggleNotifications"></f7-toggle>
        </template>
      </f7-list-item>
      <f7-list-item title="Default Interval" :after="settingsStore.defaultInterval" link="#" @click="showIntervalPicker">
        <template #media>
          <f7-icon ios="f7:clock_fill" md="material:schedule" color="blue"></f7-icon>
        </template>
      </f7-list-item>
      <f7-list-item title="Chart Timezone" :after="timezoneDisplayLabel" link="#" @click="showTimezonePicker">
        <template #media>
          <f7-icon ios="f7:globe" md="material:public" color="teal"></f7-icon>
        </template>
      </f7-list-item>
    </f7-list>

    <!-- Data & Storage -->
    <f7-block-title>Data & Storage</f7-block-title>
    <f7-list inset>
      <f7-list-item title="Sync Market Data" footer="Last synced: Never" link="#" @click="syncData">
        <template #media>
          <f7-icon ios="f7:arrow_2_circlepath" md="material:sync" color="blue"></f7-icon>
        </template>
      </f7-list-item>
      <f7-list-item title="Clear Cache" footer="Free up storage space" link="#" @click="clearCache">
        <template #media>
          <f7-icon ios="f7:trash_circle" md="material:cleaning_services" color="gray"></f7-icon>
        </template>
      </f7-list-item>
      <f7-list-item title="Clear SQLite Database" footer="Delete all local data" link="#" @click="clearDB">
        <template #media>
          <f7-icon ios="f7:trash_circle_fill" md="material:delete_forever" color="red"></f7-icon>
        </template>
      </f7-list-item>
    </f7-list>

    <!-- About -->
    <f7-block-title>About</f7-block-title>
    <f7-list inset>
      <f7-list-item title="App Version" :after="appVersion">
        <template #media>
          <f7-icon ios="f7:info_circle_fill" md="material:info" color="gray"></f7-icon>
        </template>
      </f7-list-item>
      <f7-list-item title="Terms of Service" link="#">
        <template #media>
          <f7-icon ios="f7:doc_text_fill" md="material:description" color="gray"></f7-icon>
        </template>
      </f7-list-item>
      <f7-list-item title="Privacy Policy" link="#">
        <template #media>
          <f7-icon ios="f7:shield_fill" md="material:privacy_tip" color="gray"></f7-icon>
        </template>
      </f7-list-item>
      <f7-list-item title="Open Source Licenses" link="#">
        <template #media>
          <f7-icon ios="f7:chevron_left_slash_chevron_right" md="material:code" color="gray"></f7-icon>
        </template>
      </f7-list-item>
    </f7-list>

    <!-- Account Actions -->
    <f7-block-title>Account</f7-block-title>
    <f7-list inset>
      <f7-list-item v-if="auth.user" title="Sign Out" link="#" @click="handleLogout" class="text-color-red">
        <template #media>
          <f7-icon ios="f7:square_arrow_right" md="material:logout" color="red"></f7-icon>
        </template>
      </f7-list-item>
      <f7-list-item v-else title="Sign In" link="#" @click="handleLogin">
        <template #media>
          <f7-icon ios="f7:square_arrow_left" md="material:login" color="primary"></f7-icon>
        </template>
      </f7-list-item>
    </f7-list>

    <!-- Footer -->
    <f7-block class="settings-footer">
      <p>Made with ❤️ for investors</p>
      <p class="footer-version">v{{ appVersion }}</p>
    </f7-block>
  </div>
</template>

<script setup lang="ts">
import { f7 } from "framework7-vue";
import { computed, ref } from "vue";
import { api } from "../../api/client";
import { sqliteService } from "../../services/sqlite";
import { useAuthStore } from "../../stores/auth";
import { useSettingsStore } from "../../stores/settings";
import { useThemeStore } from "../../stores/theme";
import { createLogger } from "../../utils/logger";

const auth = useAuthStore();
const themeStore = useThemeStore();
const settingsStore = useSettingsStore();
const _logger = createLogger("SettingsPage");

const _appVersion = ref("1.0.0");

// Computed labels
const _timezoneDisplayLabel = computed(() => {
	return settingsStore.timezoneMode === "local"
		? `Local (${settingsStore.timezoneLabel})`
		: `Exchange (${settingsStore.timezoneLabel})`;
});

function _showThemePicker() {
	f7.dialog
		.create({
			title: "Appearance",
			text: "Choose your preferred theme",
			buttons: [
				{
					text: "☀️ Light",
					onClick: () => {
						themeStore.setMode("light");
						f7.toast.show({ text: "Light mode enabled", closeTimeout: 1500 });
					},
				},
				{
					text: "🌙 Dark",
					onClick: () => {
						themeStore.setMode("dark");
						f7.toast.show({ text: "Dark mode enabled", closeTimeout: 1500 });
					},
				},
				{
					text: "🖥️ System",
					onClick: () => {
						themeStore.setMode("system");
						f7.toast.show({ text: "Following system preference", closeTimeout: 1500 });
					},
				},
				{ text: "Cancel", color: "gray" },
			],
			verticalButtons: true,
		})
		.open();
}

function _toggleNotifications(value: boolean) {
	settingsStore.setNotifications(value);
	f7.toast.show({ text: `Notifications ${value ? "enabled" : "disabled"}`, closeTimeout: 1500 });
}

function _showCurrencyPicker() {
	f7.dialog
		.create({
			title: "Select Currency",
			buttons: [
				{
					text: "USD ($)",
					onClick: () => {
						settingsStore.setCurrency("USD");
					},
				},
				{
					text: "EUR (€)",
					onClick: () => {
						settingsStore.setCurrency("EUR");
					},
				},
				{
					text: "GBP (£)",
					onClick: () => {
						settingsStore.setCurrency("GBP");
					},
				},
				{
					text: "IDR (Rp)",
					onClick: () => {
						settingsStore.setCurrency("IDR");
					},
				},
				{ text: "Cancel", color: "gray" },
			],
			verticalButtons: true,
		})
		.open();
}

function _showIntervalPicker() {
	f7.dialog
		.create({
			title: "Default Chart Interval",
			buttons: [
				{
					text: "1 Hour",
					onClick: () => {
						settingsStore.setDefaultInterval("1h");
					},
				},
				{
					text: "1 Day",
					onClick: () => {
						settingsStore.setDefaultInterval("1d");
					},
				},
				{
					text: "1 Week",
					onClick: () => {
						settingsStore.setDefaultInterval("1w");
					},
				},
				{ text: "Cancel", color: "gray" },
			],
			verticalButtons: true,
		})
		.open();
}

function _showTimezonePicker() {
	f7.dialog
		.create({
			title: "Chart Timezone",
			text: "Choose how times are displayed on charts",
			buttons: [
				{
					text: "🌍 Local Time",
					onClick: () => {
						settingsStore.setTimezoneMode("local");
						f7.toast.show({ text: "Using local timezone", closeTimeout: 1500 });
					},
				},
				{
					text: "🏛️ Exchange Time (EST)",
					onClick: () => {
						settingsStore.setTimezoneMode("exchange");
						f7.toast.show({ text: "Using US market timezone (EST)", closeTimeout: 1500 });
					},
				},
				{ text: "Cancel", color: "gray" },
			],
			verticalButtons: true,
		})
		.open();
}

function _syncData() {
	f7.dialog.preloader("Syncing data...");
	setTimeout(() => {
		f7.dialog.close();
		f7.toast.show({ text: "Data synced successfully", closeTimeout: 2000 });
	}, 2000);
}

function _clearCache() {
	f7.dialog.confirm("Clear all cached data?", "Clear Cache", () => {
		f7.toast.show({ text: "Cache cleared", closeTimeout: 2000 });
	});
}

const _clearDB = () => {
	f7.dialog.confirm(
		"Are you sure you want to delete the database? This action cannot be undone.",
		"Warning",
		async () => {
			f7.dialog.preloader("Clearing database...");
			try {
				try {
					await api.post("/auth/logout");
				} catch {}
				await sqliteService.clearDatabase();
			} catch (_e) {
				f7.dialog.close();
				f7.dialog.alert("Failed to clear database");
			}
		},
	);
};

const _handleLogout = () => {
	f7.dialog.confirm("Are you sure you want to sign out?", () => {
		auth.logout();
	});
};

const _handleLogin = () => {
	f7.views.main.router.navigate("/login/");
};
</script>

<style scoped>
.profile-block {
  padding-top: 20px;
}

.profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--f7-card-bg-color);
  border-radius: 16px;
  padding: 24px;
  text-align: center;
}

.profile-avatar {
  margin-bottom: 12px;
}

.profile-info {
  margin-bottom: 16px;
}

.profile-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.profile-email {
  margin: 4px 0 0;
  font-size: 14px;
  opacity: 0.6;
}

.edit-profile-btn {
  min-width: 120px;
}

.settings-footer {
  text-align: center;
  padding: 32px 16px;
  opacity: 0.5;
}

.settings-footer p {
  margin: 4px 0;
  font-size: 12px;
}

.footer-version {
  font-family: monospace;
}
</style>
