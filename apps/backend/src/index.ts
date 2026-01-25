import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";

import { analysisController } from "./modules/analysis/analysis.controller";
import { authController } from "./modules/auth/auth.controller";
import { holdingsController } from "./modules/holdings/holdings.controller";
import { marketController } from "./modules/market/market.controller";
import { watchlistController } from "./modules/watchlist/watchlist.controller";

import { apiRateLimiter } from "./middleware/rateLimiter";
import { errorHandler, requestLogger, securityHeaders } from "./middleware/security";

const app = new Elysia()
    // Global middleware
    .use(errorHandler)
    .use(securityHeaders)
    .use(requestLogger)
    .use(
        cors({
            origin: process.env.CORS_ORIGIN || "http://localhost:5173",
            credentials: true,
        }),
    )
    .use(swagger({
        documentation: {
            info: {
                title: "Analisis API",
                version: "1.0.0",
                description: "High Performance Finance App API"
            }
        }
    }))
    
    // Health check (no rate limit, no auth)
    .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
    
    // Auth routes with stricter rate limiting
    .group("/api", (api) => 
        api
            .use(apiRateLimiter)
            .use(authController)
            .use(marketController)
            .use(analysisController)
            .use(watchlistController)
            .use(holdingsController)
    );

import { schedulerService } from "./modules/scheduler/scheduler.service";
// Start scheduler
schedulerService.start();

if (import.meta.main) {
    const port = process.env.PORT || 3000;
    app.listen(port);
    console.log(
        `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
    );
}

export type App = typeof app;
export { app };

