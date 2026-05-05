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
import Redis from "ioredis";

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

	// ── Liveness probe (/ping) ─────────────────────────────────────────────
	// Used exclusively by Docker healthcheck. Returns instantly — no DB I/O.
	// Traefik will use this to decide if traffic should be routed here.
	.get("/ping", () => ({ status: "ok" }))

	// ── Readiness / Deep-health probe (/health) ───────────────────────────
	// Used by monitoring dashboards and /internal tools.
	// Checks all dependencies with a hard 3-second timeout per check.
	.get("/health", async ({ set }) => {
		const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
			Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

		const checks: Record<string, any> = {
			api: "ok",
			timestamp: new Date().toISOString(),
		};

		// 1. Check PostgreSQL (via Drizzle) — 3s timeout
		try {
			await withTimeout(db.execute(sql`SELECT 1`), 3000);
			checks.postgres = "connected";
		} catch (_e) {
			checks.postgres = "disconnected";
		}

		// 2. Check Redis — 3s timeout
		// NOTE: Do NOT reuse `redisConnection` (BullMQ's shared connection with lazyConnect=true
		// and maxRetriesPerRequest=null). That connection may be in "reconnecting" state
		// which causes ping() to queue indefinitely, racing against our timeout.
		// Use a fresh, dedicated connection that is closed immediately after.
		try {
			const healthRedis = new Redis(config.redisUrl, { connectTimeout: 2500 });
			const status = await withTimeout(healthRedis.ping(), 3000);
			healthRedis.disconnect();
			checks.redis = status === "PONG" ? "connected" : "error";
		} catch (_e) {
			checks.redis = "disconnected";
		}

		// 3. Check QuestDB (REST API) — 3s timeout
		// NOTE: fetch("/") hangs because QuestDB root serves a large HTML page
		// that uses chunked transfer and never closes the connection in Bun.
		// Use /exec?query=SELECT+1 which returns a small, finite JSON response.
		try {
			const res = await withTimeout(fetch(`${config.questdbUrl}/exec?query=SELECT+1`), 3000);
			checks.questdb = res.ok ? "connected" : "error";
		} catch (_e) {
			checks.questdb = "disconnected";
		}

		// Only evaluate service-specific fields, not metadata (timestamp, api)
		const serviceChecks = { postgres: checks.postgres, redis: checks.redis, questdb: checks.questdb };
		const isHealthy = Object.values(serviceChecks).every((v) => v === "connected");

		if (!isHealthy) {
			set.status = 503;
		}

		return {
			status: isHealthy ? "healthy" : "degraded",
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
