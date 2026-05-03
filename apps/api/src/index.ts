import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { config, validateConfig } from "./config";
import { apiRateLimiter } from "./middleware/rateLimiter";
import { errorHandler, requestLogger, securityHeaders } from "./middleware/security";
import { analysisController } from "./modules/analysis/analysis.controller";
import { authController } from "./modules/auth/auth.controller";
import { holdingsController } from "./modules/holdings/holdings.controller";
import { internalMarketController, marketController } from "./modules/market/market.controller";
import { realtimeController } from "./modules/realtime/realtime.controller";
import { watchlistController } from "./modules/watchlist/watchlist.controller";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { redisConnection } from "./modules/scheduler/queue";

// Validate configuration at startup
validateConfig();

// Setup Bull Board
// const serverAdapter = new ElysiaAdapter({ basePath: "/admin/queues" });
// createBullBoard({
// 	queues: [new BullMQAdapter(harvestQueue)],
// 	serverAdapter,
// });

const app = new Elysia()
	// Global middleware
	.use(errorHandler)
	.use(securityHeaders)
	.use(requestLogger)
	.use(
		cors({
			origin: config.corsOrigin,
			credentials: true,
		}),
	)
	.use(
		swagger({
			documentation: {
				info: {
					title: "Analisis API",
					version: "1.0.0",
					description: "High Performance Finance App API",
				},
			},
		}),
	)

	// Register Bull Board UI (no auth for now on internal dev/admin network)
	// .use((app) => {
	// 	try {
	// 		return app.use(serverAdapter.registerPlugin());
	// 	} catch (e) {
	// 		console.error("Failed to register Bull Board plugin:", e);
	// 		return app;
	// 	}
	// })

	// Health check (Deep Healthcheck for production orchestration)
	.get("/health", async ({ set }) => {
		const checks: Record<string, any> = {
			api: "ok",
			timestamp: new Date().toISOString(),
		};

		// 1. Check PostgreSQL (via Drizzle)
		try {
			await db.execute(sql`SELECT 1`);
			checks.postgres = "connected";
		} catch (e) {
			checks.postgres = "disconnected";
		}

		// 2. Check Redis
		try {
			const status = await redisConnection.ping();
			checks.redis = status === "PONG" ? "connected" : "error";
		} catch (e) {
			checks.redis = "disconnected";
		}

		// 3. Check QuestDB (REST API)
		try {
			const res = await fetch(`${config.questdbUrl}/`);
			checks.questdb = res.ok ? "connected" : "error";
		} catch (e) {
			checks.questdb = "disconnected";
		}

		const isHealthy = Object.values(checks).every((v) => v === "ok" || v === "connected");

		if (!isHealthy) {
			set.status = 503;
		}

		return {
			status: isHealthy ? "healthy" : "unhealthy",
			...checks,
		};
	})

	// Serve static files (logos)
	.get("/public/*", async ({ params, set }) => {
		const filePath = params["*"];

		// Use import.meta.dir to get absolute path to src/ directory
		// Then go up one level to apps/backend root, then into public/
		// This works regardless of where the app is launched from (CWD safe)
		const projectRoot = import.meta.dir.replace("/src", "");
		const absPath = `${projectRoot}/public/${filePath}`;

		const staticFile = Bun.file(absPath);

		const exists = await staticFile.exists();
		if (!exists) {
			console.log(`[Static] 404 Not Found: ${filePath} (cwd: ${process.cwd()})`);
			set.status = 404;
			return "File not found";
		}

		return staticFile;
	})

	// WebSocket real-time routes (no rate limiting needed)
	.use(realtimeController)
	// Auth routes with stricter rate limiting
	.group("/api", (api) =>
		api
			.use(apiRateLimiter)
			.use(internalMarketController)
			.use(authController)
			.use(marketController)
			.use(analysisController)
			.use(watchlistController)
			.use(holdingsController),
	);

import { schedulerService } from "./modules/scheduler/scheduler.service";

if (import.meta.main) {
	const port = process.env.PORT || 3000;
	app.listen({ port, hostname: "0.0.0.0" });
	console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
	console.log(`📡 WebSocket available at ws://localhost:${port}/ws/market`);

	// Start scheduler after API is ready
	schedulerService.start();
}

export type App = typeof app;
export { app };
