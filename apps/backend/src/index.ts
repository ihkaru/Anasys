import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";

import { analysisController } from "./modules/analysis/analysis.controller";
import { authController } from "./modules/auth/auth.controller";
import { holdingsController } from "./modules/holdings/holdings.controller";
import { marketController } from "./modules/market/market.controller";
import { watchlistController } from "./modules/watchlist/watchlist.controller";

import { config, validateConfig } from "./config";
import { apiRateLimiter } from "./middleware/rateLimiter";
import { errorHandler, requestLogger, securityHeaders } from "./middleware/security";

// Validate configuration at startup
validateConfig();

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
    
    // Serve static files (logos)
    .get("/public/*", async ({ params, set }) => {
        const filePath = params['*'];
        
        // Use import.meta.dir to get absolute path to src/ directory
        // Then go up one level to apps/backend root, then into public/
        // This works regardless of where the app is launched from (CWD safe)
        const projectRoot = import.meta.dir.replace('/src', '');
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

