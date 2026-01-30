<template>
	<f7-app v-bind="f7params">

		<!-- Initialization Loading Screen -->
		<div v-if="!initialized"
			style="display: flex; justify-content: center; align-items: center; height: 100vh; background: var(--f7-page-bg-color);">
			<f7-preloader size="42"></f7-preloader>
		</div>

		<!-- Main Router View -->
		<f7-view v-else main class="safe-areas" url="/"></f7-view>
	</f7-app>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { routes } from "./router/routes";
import { sqliteService } from "./services/sqlite";
import { useAuthStore } from "./stores/auth";
import { useThemeStore } from "./stores/theme";
import { createLogger } from "./utils/logger";

const logger = createLogger('App');

const authStore = useAuthStore();
const themeStore = useThemeStore();
const initialized = ref(false);

const f7params = ref({
	name: "Finance App",
	theme: "auto",
	darkMode: false, // Disable auto dark mode detection by F7, we handle it manually
	routes: routes,
});

// Initialize theme immediately (sync, prevents flash)
themeStore.init();

onMounted(async () => {
	logger.info('App Mounted, Initializing services...');
	// Initialize SQLite
	try {
		await sqliteService.init();
		logger.info("SQLite initialized");

		// Hydrate Persisted Theme from SQLite (Source of Truth)
		await themeStore.hydrateFromSqlite();
	} catch (e) {
		logger.error("Failed to initialize SQLite", e);
	}

	await authStore.initGoogleAuth();
	await authStore.checkSession();

	// App Initialized!
	initialized.value = true;
	logger.info('App Initialization Complete');
});
</script>
