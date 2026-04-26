import { Elysia } from "elysia";
import { Logger } from "../utils/logger";

const logger = new Logger("RateLimiter");

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of store.entries()) {
		if (entry.resetAt < now) {
			store.delete(key);
		}
	}
}, 60000); // Clean every minute

export interface RateLimitConfig {
	windowMs?: number; // Time window in milliseconds
	maxRequests?: number; // Max requests per window
	keyPrefix?: string; // For differentiating different limiters
}

export const rateLimiter = (config: RateLimitConfig = {}) => {
	const {
		windowMs = 60000, // 1 minute default
		maxRequests = 100, // 100 requests per minute default
		keyPrefix = "global",
	} = config;

	return new Elysia({ name: `rateLimit-${keyPrefix}` })
		.derive(({ request, set }) => {
			// Get client identifier (IP or user ID if authenticated)
			const forwarded = request.headers.get("x-forwarded-for");
			const ip = forwarded?.split(",")[0]?.trim() || "unknown";
			const key = `${keyPrefix}:${ip}`;

			const now = Date.now();
			let entry = store.get(key);

			if (!entry || entry.resetAt < now) {
				// New window
				entry = { count: 1, resetAt: now + windowMs };
				store.set(key, entry);
			} else {
				entry.count++;
			}

			// Add headers for client awareness
			const remaining = Math.max(0, maxRequests - entry.count);
			const resetInSeconds = Math.ceil((entry.resetAt - now) / 1000);

			set.headers["X-RateLimit-Limit"] = String(maxRequests);
			set.headers["X-RateLimit-Remaining"] = String(remaining);
			set.headers["X-RateLimit-Reset"] = String(resetInSeconds);

			if (entry.count > maxRequests) {
				logger.warn(`Rate limit exceeded`, { ip, key, count: entry.count });
				set.status = 429;
				set.headers["Retry-After"] = String(resetInSeconds);
				return {
					rateLimited: true,
					error: {
						success: false,
						error: "Too many requests. Please try again later.",
						retryAfter: resetInSeconds,
					},
				};
			}

			return { rateLimited: false };
		})
		.onBeforeHandle(({ rateLimited }) => {
			if (rateLimited) {
				// Already set status 429 in derive
				return (rateLimited as any).error;
			}
		});
};

// Preset configurations
export const apiRateLimiter = rateLimiter({
	windowMs: 60000,
	maxRequests: 60,
	keyPrefix: "api",
});

export const authRateLimiter = rateLimiter({
	windowMs: 300000, // 5 minutes
	maxRequests: 10, // 10 login attempts per 5 min
	keyPrefix: "auth",
});

export const heavyRateLimiter = rateLimiter({
	windowMs: 60000,
	maxRequests: 10, // Heavy operations like sync/analysis
	keyPrefix: "heavy",
});
