import { Capacitor } from "@capacitor/core";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import { f7 } from "framework7-vue";
import { defineStore } from "pinia";
import { ref } from "vue";
import { googleTokenLogin } from "vue3-google-login";
import { api } from "../api/client";
import { sqliteService } from "../services/sqlite";

import { createLogger } from "../utils/logger";

interface User {
	id: number;
	email: string;
	name: string;
}

export const useAuthStore = defineStore("auth", () => {
	const logger = createLogger("AuthStore");
	const user = ref<User | null>(null);
	const isAuthenticated = ref(false);
	const loading = ref(false);

	// Only needed for Capacitor Native
	async function initGoogleAuth() {
		if (Capacitor.isNativePlatform()) {
			GoogleAuth.initialize({
				clientId: "30564891683-3mgqkqfh09lmtuveo2g5096imbv8qr4u.apps.googleusercontent.com",
				scopes: ["profile", "email"],
				grantOfflineAccess: true,
			});
		}
	}

	async function login() {
		try {
			loading.value = true;
			let token = "";

			if (Capacitor.isNativePlatform()) {
				// NATIVE: Use Capacitor Plugin
				const googleUser = await GoogleAuth.signIn();
				token = googleUser.authentication.idToken;
			} else {
				// WEB: Use vue3-google-login (Pop-up flow)
				const response = await googleTokenLogin();
				token = response.access_token;
			}

			// Send Token (ID Token OR Access Token) to backend
			const response = await api.post("/auth/google", {
				token: token,
			});

			if (response.data.success) {
				// Save Session Token to SQLite
				const sessionToken = response.data.token;
				if (sessionToken) {
					await sqliteService.setItem("auth_token", sessionToken);
					api.defaults.headers.common.Authorization = `Bearer ${sessionToken}`;
				}

				user.value = response.data.user;
				isAuthenticated.value = true;

				// Force router to re-evaluate route "/" to switch from Login component to Home component
				f7.views.main.router.navigate("/", {
					reloadCurrent: true,
					ignoreCache: true,
				});
			}
		} catch (error) {
			logger.error("Login failed", error);
			f7.dialog.alert(`Login Failed: ${error instanceof Error ? error.message : "Unknown error"}`);
		} finally {
			loading.value = false;
		}
	}

	async function checkSession() {
		try {
			logger.debug("Checking session...");
			loading.value = true;
			// Ensure DB is ready
			try {
				await sqliteService.init();
				logger.debug("SQLite initialized");
			} catch (e) {
				logger.error("DB Init error", e);
			}

			// Load Token
			const token = await sqliteService.getItem("auth_token");
			logger.debug("Token from SQLite:", token ? `FOUND (${token.length} chars)` : "NULL");

			if (token) {
				api.defaults.headers.common.Authorization = `Bearer ${token}`;
			} else {
				logger.debug("No token found, checking cookie/backend...");
			}

			logger.debug("Calling /auth/me...");
			const response = await api.get("/auth/me");
			logger.debug("/auth/me response status:", response.status);

			if (response.data.success) {
				logger.info("Session VALID. User:", response.data.user.email);
				user.value = response.data.user;
				isAuthenticated.value = true;
				// Navigation will be handled by App.vue reactivity when 'initialized' becomes true
			}
		} catch (error) {
			logger.warn("Session check failed:", error);
			// Session invalid or expired
			isAuthenticated.value = false;
			user.value = null;
			// Clear invalid token
			await sqliteService.removeItem("auth_token");
			delete api.defaults.headers.common.Authorization;
		} finally {
			loading.value = false;
		}
	}

	async function logout() {
		if (Capacitor.isNativePlatform()) {
			await GoogleAuth.signOut();
		}

		// Call Backend Logout to clear cookie
		try {
			await api.post("/auth/logout");
		} catch (e) {
			logger.warn("Logout backend failed", e);
		}

		// Clear SQLite
		await sqliteService.removeItem("auth_token");
		delete api.defaults.headers.common.Authorization;

		user.value = null;
		isAuthenticated.value = false;
		// Navigation handled by Router/App.vue state
		window.location.href = "/"; // Hard reload to clear everything clean
	}

	return {
		user,
		isAuthenticated,
		loading,
		initGoogleAuth,
		checkSession,
		login,
		logout,
	};
});
