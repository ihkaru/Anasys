import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [vue()],
	envDir: "../../", // Point to workspace root for .env
	root: ".",
	build: {
		outDir: "dist",
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		host: true,
		strictPort: true,
		proxy: {
			"/api": {
				target: "http://localhost:28081",
				changeOrigin: true,
				secure: false,
			},
			"/public": {
				target: "http://localhost:28081",
				changeOrigin: true,
				secure: false,
			},
		},
	},
	preview: {
		port: 4173,
		proxy: {
			"/api": {
				target: "http://localhost:28081",
				changeOrigin: true,
				secure: false,
			},
			"/public": {
				target: "http://localhost:28081",
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
