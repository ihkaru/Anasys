/**
 * Settings Store
 * Manages user preferences including timezone, currency, and default interval
 */

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { createLogger } from "../utils/logger";

const logger = createLogger("SettingsStore");

export type TimezoneMode = "local" | "exchange";

export interface ExchangeTimezone {
	name: string;
	offset: string;
	iana: string;
}

export const EXCHANGE_TIMEZONES: Record<string, ExchangeTimezone> = {
	US: { name: "US Eastern", offset: "EST/EDT", iana: "America/New_York" },
	EU: { name: "Central European", offset: "CET/CEST", iana: "Europe/Paris" },
	UK: { name: "London", offset: "GMT/BST", iana: "Europe/London" },
	JP: { name: "Japan", offset: "JST", iana: "Asia/Tokyo" },
	HK: { name: "Hong Kong", offset: "HKT", iana: "Asia/Hong_Kong" },
	CRYPTO: { name: "UTC", offset: "UTC", iana: "UTC" },
};

const SETTINGS_KEY = "app_settings";

interface SavedSettings {
	timezoneMode: TimezoneMode;
	currency: string;
	defaultInterval: string;
	notifications: boolean;
}

function loadSettings(): SavedSettings {
	try {
		const saved = localStorage.getItem(SETTINGS_KEY);
		if (saved) {
			return JSON.parse(saved);
		}
	} catch (e) {
		logger.warn("Failed to load settings from localStorage", e);
	}
	return {
		timezoneMode: "local",
		currency: "USD",
		defaultInterval: "1h",
		notifications: true,
	};
}

export const useSettingsStore = defineStore("settings", () => {
	const savedSettings = loadSettings();

	// State
	const timezoneMode = ref<TimezoneMode>(savedSettings.timezoneMode);
	const currency = ref(savedSettings.currency);
	const defaultInterval = ref(savedSettings.defaultInterval);
	const notifications = ref(savedSettings.notifications);

	// Computed
	const isLocalTimezone = computed(() => timezoneMode.value === "local");

	const timezoneLabel = computed(() => {
		if (timezoneMode.value === "local") {
			// Get local timezone abbreviation
			const formatter = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" });
			const parts = formatter.formatToParts(new Date());
			const tz = parts.find((p) => p.type === "timeZoneName")?.value || "Local";
			return tz;
		}
		return "EST"; // Default exchange timezone
	});

	const currentExchangeTimezone = computed(() => EXCHANGE_TIMEZONES.US);

	// Actions
	function setTimezoneMode(mode: TimezoneMode) {
		timezoneMode.value = mode;
		logger.info(`Timezone mode changed to: ${mode}`);
	}

	function setCurrency(val: string) {
		currency.value = val;
	}

	function setDefaultInterval(val: string) {
		defaultInterval.value = val;
	}

	function setNotifications(val: boolean) {
		notifications.value = val;
	}

	/**
	 * Format a timestamp for display based on current timezone setting
	 */
	function formatTime(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
		const d = new Date(date);
		const timezone = timezoneMode.value === "local" ? undefined : currentExchangeTimezone.value.iana;

		return d.toLocaleString("en-US", {
			...options,
			timeZone: timezone,
		});
	}

	/**
	 * Get timezone suffix for display (e.g., "EST" or "WIB")
	 */
	function getTimezoneSuffix(): string {
		return timezoneLabel.value;
	}

	// Persist to localStorage
	watch(
		[timezoneMode, currency, defaultInterval, notifications],
		() => {
			const settings: SavedSettings = {
				timezoneMode: timezoneMode.value,
				currency: currency.value,
				defaultInterval: defaultInterval.value,
				notifications: notifications.value,
			};
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
			logger.debug("Settings persisted to localStorage");
		},
		{ deep: true },
	);

	return {
		// State
		timezoneMode,
		currency,
		defaultInterval,
		notifications,

		// Computed
		isLocalTimezone,
		timezoneLabel,
		currentExchangeTimezone,

		// Actions
		setTimezoneMode,
		setCurrency,
		setDefaultInterval,
		setNotifications,
		formatTime,
		getTimezoneSuffix,
	};
});
