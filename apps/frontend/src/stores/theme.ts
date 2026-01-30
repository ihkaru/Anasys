import { f7ready } from 'framework7-vue';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'app-theme-mode';

/**
 * Theme Store - Manages dark/light/system mode preference
 * Uses localStorage for persistence (fast, sync, device-specific)
 */
export const useThemeStore = defineStore('theme', () => {
    // State
    const mode = ref<ThemeMode>('system');
    const systemPrefersDark = ref(false);

    // Computed
    const isDark = computed(() => {
        if (mode.value === 'system') {
            return systemPrefersDark.value;
        }
        return mode.value === 'dark';
    });

    const themeLabel = computed(() => {
        switch (mode.value) {
            case 'light': return 'Light';
            case 'dark': return 'Dark';
            case 'system': return 'System';
        }
    });

    const themeIcon = computed(() => {
        switch (mode.value) {
            case 'light': return { ios: 'f7:sun_max_fill', md: 'material:light_mode' };
            case 'dark': return { ios: 'f7:moon_fill', md: 'material:dark_mode' };
            case 'system': return { ios: 'f7:gear', md: 'material:settings_suggest' };
        }
    });

    // Actions
    async function setMode(newMode: ThemeMode) {
        mode.value = newMode;
        
        // 1. Save to LocalStorage (Immediate sync for next boot)
        localStorage.setItem(THEME_STORAGE_KEY, newMode);
        
        // 2. Apply classes
        applyTheme();

        // 3. Save to SQLite (Async persistence)
        try {
            // Kita import dynamic agar tidak cycle dependency jika sqlite import store lain (meski saat ini aman)
            const { sqliteService } = await import('../services/sqlite');
            await sqliteService.setItem(THEME_STORAGE_KEY, newMode);
        } catch (e) {
            console.warn('Failed to save theme to SQLite:', e);
        }
    }

    function cycleMode() {
        const modes: ThemeMode[] = ['system', 'light', 'dark'];
        const currentIndex = modes.indexOf(mode.value);
        const nextIndex = (currentIndex + 1) % modes.length;
        setMode(modes[nextIndex]);
    }

    function applyTheme() {
        const dark = isDark.value;
        console.log('[ThemeStore] Applying theme. Dark:', dark, 'Mode:', mode.value);
        
        // 1. Manual DOM classes (IMMEDIATE)
        // Prevent FOUC (Flash of Unstyled Content)
        document.documentElement.classList.toggle('dark', dark);
        document.documentElement.classList.toggle('theme-dark', dark);

        // 2. Framework7 API (DEFERRED/SAFE)
        // Ensure F7 internal state matches our state when it becomes ready
        f7ready((f7Instance) => {
            if (f7Instance && typeof f7Instance.setDarkMode === 'function') {
                // Only call if state mismatch to avoid loops, though setDarkMode usually checks internally
                // But f7.darkMode might confuse 'auto' vs explicit, so we just set it.
                f7Instance.setDarkMode(dark);
            }
        });
        
        // Update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', dark ? '#0f0f23' : '#ffffff');
        }
    }

    function init() {
        console.log('[ThemeStore] Initializing...');
        
        // 1. Load sync from LocalStorage
        const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
        console.log('[ThemeStore] LocalStorage loaded:', saved);
        
        if (saved && ['light', 'dark', 'system'].includes(saved)) {
            mode.value = saved;
        }

        // 2. Detect system preference
        if (typeof window !== 'undefined') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            systemPrefersDark.value = mediaQuery.matches;
            console.log('[ThemeStore] System prefers dark:', systemPrefersDark.value);

            // Listen for system changes
            mediaQuery.addEventListener('change', (e) => {
                systemPrefersDark.value = e.matches;
                if (mode.value === 'system') {
                    applyTheme();
                }
            });
        }

        // Apply initial theme
        applyTheme();
    }

    /**
     * Called after SQLite is initialized to sync definitive state
     */
    async function hydrateFromSqlite() {
        try {
            const { sqliteService } = await import('../services/sqlite');
            const saved = await sqliteService.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
            if (saved && ['light', 'dark', 'system'].includes(saved)) {
                // Only update if different to avoid unnecessary repaints
                if (mode.value !== saved) {
                    mode.value = saved;
                    // Also sync back to localStorage to keep them in parity for next boot
                    localStorage.setItem(THEME_STORAGE_KEY, saved);
                    applyTheme();
                }
            }
        } catch (e) {
            console.warn('Failed to hydrate theme from SQLite:', e);
        }
    }

    // Watch for mode changes internal reactive logic
    watch(isDark, () => {
        applyTheme();
    });

    return {
        // State
        mode,
        systemPrefersDark,
        
        // Computed
        isDark,
        themeLabel,
        themeIcon,
        
        // Actions
        setMode,
        cycleMode,
        init,
        hydrateFromSqlite, 
    };
});
