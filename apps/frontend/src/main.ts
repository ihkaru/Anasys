// @ts-ignore - registerComponents is available in bundle but missing in types
import Framework7Vue, { registerComponents } from "framework7-vue/bundle";
import Framework7 from "framework7/bundle";
import "framework7/css/bundle";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { createLogger } from "./utils/logger";

import vue3GoogleLogin from "vue3-google-login";

// Initialize Framework7 with Vue plugin
Framework7.use(Framework7Vue);

const app = createApp(App);
const pinia = createPinia();

// Register all Framework7 Vue components
registerComponents(app);

app.use(vue3GoogleLogin, {
    clientId: "30564891683-3mgqkqfh09lmtuveo2g5096imbv8qr4u.apps.googleusercontent.com"
});

// Define custom elements for Capacitor SQLite Web Support
import { defineCustomElements as jeepSqlite } from "jeep-sqlite/loader";
jeepSqlite(window);

app.use(pinia);

const logger = createLogger('Main');
logger.info('Starting Application...');

app.mount("#app");
logger.info('App Mounted');
