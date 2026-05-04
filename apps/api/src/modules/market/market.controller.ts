import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { config, getJwtSecret } from "../../config";
import { Logger } from "../../utils/logger";
import { marketService } from "./market.service";
import { StreamMonitorService } from "../realtime/services/StreamMonitorService";

const logger = new Logger("MarketController");

export const marketController = new Elysia({ prefix: "/market" })
	.use(
		jwt({
			name: "jwt",
			secret: getJwtSecret(),
		}),
	)
	.use(cookie())
	.derive(async ({ jwt, cookie: { auth }, headers }) => {
		const isDev = process.env.NODE_ENV !== "production";
		const secret = headers["x-dev-secret"] ?? headers["X-Dev-Secret"];

		// Dev backdoor for testing
		if (isDev && secret === "dev_secret_123") {
			logger.info("🔓 Market Dev Backdoor Access GRANTED");
			return {
				user: { id: 9999, name: "Dev Superuser", email: "dev@analisis.local" },
				isDevAdmin: true,
			};
		}

		let token: string | undefined = auth?.value as string | undefined;
		const authHeader = headers.authorization;

		logger.debug(`Auth check: Cookie=${token ? "YES" : "NO"}, Header=${authHeader ? "YES" : "NO"}`);

		if (!token && authHeader?.startsWith("Bearer ")) {
			token = authHeader.substring(7);
		}

		if (!token) {
			return { user: null };
		}

		try {
			const profile = await jwt.verify(token);
			if (profile) {
				logger.debug(`Authenticated: ${profile.email}`);
			}
			return { user: profile || null };
		} catch (e) {
			logger.warn(`JWT verification failed`, e);
			return { user: null };
		}
	})
	// Auth guard for ALL routes
	.guard({
		beforeHandle: ({ user, set }: any) => {
			if (!user) {
				logger.warn(`Unauthorized access attempt to market endpoint`);
				set.status = 401;
				return { success: false, error: "Unauthorized" };
			}
		},
	})
	.get("/monitoring/stream-stats", () => {
		return {
			success: true,
			data: StreamMonitorService.getInstance().getStats(),
		};
	})
	// Market Overview (GET) - default indices
	.get("/overview", async () => {
		logger.debug("GET /overview");
		try {
			// Fetch latest prices for key indices
			const tickers = config.defaults.overviewTickers;
			const overview = await marketService.getMarketOverview(tickers);
			return { success: true, data: overview };
		} catch (e) {
			logger.error("Failed to get market overview", e);
			return { success: false, error: (e as Error).message };
		}
	})
	// Market Overview (POST) - dynamic tickers (NEW!)
	.post(
		"/overview",
		async ({ body }) => {
			logger.debug(
				`POST /overview for ${body.tickers?.length || 0} tickers (period=${body.period}, source=${body.source})`,
			);
			try {
				const tickers = body.tickers || [];
				if (tickers.length === 0) {
					return { success: true, data: [] };
				}
				// Pass source as undefined if not provided — getQuotes() will smart-route via DB
				// Never hardcode "YAHOO" here: it would bypass DB-pinned provider routing
				const quotes = await marketService.getQuotes(tickers, body.period || "7d", body.source || undefined);
				return { success: true, data: quotes };
			} catch (e) {
				logger.error("Failed to get quotes", e);
				return { success: false, error: (e as Error).message };
			}
		},
		{
			body: t.Object({
				tickers: t.Array(t.String()),
				period: t.Optional(t.String()),
				source: t.Optional(t.String()),
			}),
		},
	)
	// Real-time quotes for single or multiple tickers
	.get(
		"/quotes",
		async ({ query }) => {
			const tickers =
				query.tickers
					?.split(",")
					.map((t) => t.trim())
					.filter(Boolean) || [];
			logger.debug(`GET /quotes for ${tickers.length} tickers (period=${query.period})`);

			if (tickers.length === 0) {
				return { success: false, error: "No tickers provided" };
			}

			try {
				const quotes = await marketService.getQuotes(tickers, query.period || "7d");
				return { success: true, data: quotes };
			} catch (e) {
				logger.error("Failed to get quotes", e);
				return { success: false, error: (e as Error).message };
			}
		},
		{
			query: t.Object({
				tickers: t.String(), // Comma-separated list
				period: t.Optional(t.String()),
			}),
		},
	)
	// Search symbols
	.get(
		"/search",
		async ({ query }) => {
			const q = query.q || "";
			const limit = query.limit ? parseInt(query.limit, 10) : 15;

			logger.debug(`GET /search q="${q}" limit=${limit}`);

			if (q.length < 1) {
				return { success: false, error: "Query too short" };
			}

			try {
				const results = await marketService.searchSymbolsMultiSource(q, limit);
				return { success: true, data: results };
			} catch (e) {
				logger.error("Failed to search symbols", e);
				return { success: false, error: (e as Error).message };
			}
		},
		{
			query: t.Object({
				q: t.String(),
				limit: t.Optional(t.String()),
			}),
		},
	)
	// Trending symbols
	.get(
		"/trending",
		async ({ query }) => {
			const region = query.region || "US";
			const count = query.count ? parseInt(query.count, 10) : 10;

			logger.debug(`GET /trending region=${region} count=${count}`);

			try {
				const trending = await marketService.getTrendingSymbols(region, count);
				return { success: true, data: trending };
			} catch (e) {
				logger.error("Failed to get trending symbols", e);
				return { success: false, error: (e as Error).message };
			}
		},
		{
			query: t.Object({
				region: t.Optional(t.String()),
				count: t.Optional(t.String()),
			}),
		},
	)
	// Recommendations for a symbol
	.get("/recommendations/:ticker", async ({ params }) => {
		const ticker = params.ticker.toUpperCase();
		logger.debug(`GET /recommendations/${ticker}`);

		try {
			const recommendations = await marketService.getRecommendations(ticker);
			return { success: true, data: recommendations };
		} catch (e) {
			logger.error(`Failed to get recommendations for ${ticker}`, e);
			return { success: false, error: (e as Error).message };
		}
	})
	.get("/symbols", async () => {
		logger.debug("GET /symbols");
		const symbols = await marketService.getSymbols();
		return { success: true, data: symbols };
	})
	.get("/movers", async () => {
		logger.debug("GET /movers");
		try {
			const movers = await marketService.getTopMovers();
			return { success: true, data: movers };
		} catch (e) {
			logger.error("Failed to get market movers", e);
			return { success: false, error: (e as Error).message };
		}
	})
	.post(
		"/sync",
		async (context: any) => {
			const { body, user } = context;
			logger.info(`SYNC ${body.ticker} requested by ${user?.email || "Unknown"}`);
			try {
				// If source not provided, look up the symbol's pinned provider in DB
				// This prevents backfilling a TradingView symbol from Yahoo Finance
				const resolvedSource = body.source || (await marketService.resolveSymbolSource(body.ticker));
				const result = await marketService.syncSymbolData(
					body.ticker,
					body.type as "STOCK" | "CRYPTO",
					body.interval || "1d",
					undefined, // endDate
					resolvedSource,
				);
				return { success: true, ...result };
			} catch (e) {
				logger.error(`SYNC failed for ${body.ticker}`, e);
				return { success: false, error: (e as Error).message };
			}
		},
		{
			body: t.Object({
				ticker: t.String(),
				type: t.Union([t.Literal("STOCK"), t.Literal("CRYPTO")]),
				interval: t.Optional(t.String()),
				source: t.Optional(t.String()),
			}),
		},
	)
	.get(
		"/history/:ticker",
		async ({ params, query }) => {
			logger.debug(`GET /history/${params.ticker} interval=${query.interval} before=${query.before}`);
			try {
				const limit = query.limit ? parseInt(query.limit, 10) : 500;
				const data = await marketService.getOHLCV(
					params.ticker,
					query.interval || "1d",
					limit,
					query.before,
					query.source,
				);
				return { success: true, data };
			} catch (e) {
				logger.error(`GET /history/${params.ticker} failed`, e);
				return { success: false, error: (e as Error).message };
			}
		},
		{
			query: t.Object({
				limit: t.Optional(t.String()),
				interval: t.Optional(t.String()),
				before: t.Optional(t.String()), // ISO timestamp for pagination
				source: t.Optional(t.String()),
			}),
		},
	)
	// GET SINGLE SYMBOL with on-demand enrichment
	.get(
		"/symbols/:ticker",
		async ({ params, query }) => {
			const ticker = params.ticker.toUpperCase();
			logger.debug(`GET /symbols/${ticker} enrich=${query.enrich}`);

			try {
				let symbol = await marketService.getSymbolByTicker(ticker);

				if (!symbol) {
					return { success: false, error: "Symbol not found" };
				}

				// On-demand enrichment if requested (service handles stale check internally)
				if (query.enrich === "true") {
					symbol = await marketService.enrichSymbol(ticker);
				}

				return { success: true, data: symbol };
			} catch (e) {
				logger.error(`GET /symbols/${ticker} failed`, e);
				return { success: false, error: (e as Error).message };
			}
		},
		{
			query: t.Object({
				enrich: t.Optional(t.String()), // 'true' to trigger enrichment
			}),
		},
	)

	// Financial metrics for a symbol (PE, margins, EPS, etc)
	.get("/financials/:ticker", async ({ params }) => {
		const ticker = params.ticker.toUpperCase();
		logger.debug(`GET /financials/${ticker}`);

		try {
			const financials = await marketService.getFinancials(ticker);
			if (!financials) {
				return { success: false, error: "Symbol not found or no financial data available" };
			}
			return { success: true, data: financials };
		} catch (e) {
			logger.error(`GET /financials/${ticker} failed`, e);
			return { success: false, error: (e as Error).message };
		}
	})
	// Earnings data for a symbol (history, calendar, trend)
	.get("/earnings/:ticker", async ({ params }) => {
		const ticker = params.ticker.toUpperCase();
		logger.debug(`GET /earnings/${ticker}`);

		try {
			const earnings = await marketService.getEarnings(ticker);
			if (!earnings) {
				return { success: false, error: "Symbol not found or no earnings data available" };
			}
			return { success: true, data: earnings };
		} catch (e) {
			logger.error(`GET /earnings/${ticker} failed`, e);
			return { success: false, error: (e as Error).message };
		}
	})
	// Analyst ratings for a symbol (buy/hold/sell breakdown)
	.get("/analyst/:ticker", async ({ params }) => {
		const ticker = params.ticker.toUpperCase();
		logger.debug(`GET /analyst/${ticker}`);

		try {
			const ratings = await marketService.getAnalystRatings(ticker);
			if (!ratings) {
				return { success: false, error: "Symbol not found or no analyst data available" };
			}
			return { success: true, data: ratings };
		} catch (e) {
			logger.error(`GET /analyst/${ticker} failed`, e);
			return { success: false, error: (e as Error).message };
		}
	})
	// Single ticker quote (convenience endpoint)
	.get(
		"/quote/:ticker",
		async ({ params, query }) => {
			const ticker = params.ticker.toUpperCase();
			logger.debug(`GET /quote/${ticker} source=${query.source}`);

			try {
				// Pass source as undefined if not provided — getQuotes() will smart-route via DB
				// Never hardcode "YAHOO" here: it would bypass DB-pinned provider routing
				const quotes = await marketService.getQuotes([ticker], "1d", query.source || undefined);
				if (!quotes || quotes.length === 0) {
					return { success: false, error: "Quote not found" };
				}
				return { success: true, data: quotes[0] };
			} catch (e) {
				logger.error(`GET /quote/${ticker} failed`, e);
				return { success: false, error: (e as Error).message };
			}
		},
		{
			query: t.Object({
				source: t.Optional(t.String()),
			}),
		},
	)
	// High-performance history from QuestDB (Anasys Engine)
	.get(
		"/history/engine/:ticker",
		async ({ params, query }) => {
			const ticker = params.ticker.toUpperCase();
			logger.debug(`GET /history/engine/${ticker} interval=${query.interval} limit=${query.limit}`);
			try {
				const data = await marketService.getHistoricalOHLCV(
					ticker,
					query.interval || "1m",
					query.limit ? parseInt(query.limit, 10) : 100,
				);
				return { success: true, data };
			} catch (e) {
				logger.error(`GET /history/engine/${ticker} failed`, e);
				return { success: false, error: (e as Error).message };
			}
		},
		{
			query: t.Object({
				interval: t.Optional(t.String({ default: "1m" })),
				limit: t.Optional(t.String({ default: "100" })),
			}),
		},
	);

// ---------------------------------------------------------------------------
// INTERNAL: Backfill Management (Used by Engine)
// ---------------------------------------------------------------------------
export const internalMarketController = new Elysia({ prefix: "/market/internal" })
	.get("/stats", async () => {
		console.log("[InternalMarketController] GET /stats hit!");
		try {
			const stats = await marketService.getMarketStats();
			return { success: true, data: stats };
		} catch (e) {
			return { success: false, error: (e as Error).message };
		}
	})
	.get("/monitoring", async () => {
		try {
			const stats = await marketService.getMonitoringStats();
			return { success: true, data: stats };
		} catch (e) {
			return { success: false, error: (e as Error).message };
		}
	})
	.group("/backfill", (app) =>
		app
			.get("/tasks", async () => {
				const { backfillService } = await import("./services/backfill.service");
				const tasks = await backfillService.getPendingTasks();
				return { success: true, data: tasks };
			})
			.post(
				"/report",
				async ({ body }) => {
					const { backfillService } = await import("./services/backfill.service");
					await backfillService.updateProgress(body.id, body.lastTimestamp, body.isCompleted, body.metadata);
					return { success: true };
				},
				{
					body: t.Object({
						id: t.Number(),
						lastTimestamp: t.String(),
						isCompleted: t.Optional(t.Boolean()),
						metadata: t.Optional(t.Any()),
					}),
				},
			)
			// DIAGNOSTICS: Check provider health
			.get("/diagnostics", async () => {
				const { YahooFinanceProvider } = await import("./providers/yahoo-finance.provider");
				const { TradingViewPythonProvider } = await import("./providers/tradingview-python.provider");

				const yahoo = new YahooFinanceProvider();
				const tv = new TradingViewPythonProvider();

				const [yahooStatus, tvStatus] = await Promise.allSettled([yahoo.search("AAPL", 1), tv.search("AAPL", 1)]);

				return {
					success: true,
					timestamp: new Date().toISOString(),
					providers: {
						yahoo: {
							status: yahooStatus.status,
							works: yahooStatus.status === "fulfilled" && yahooStatus.value.length > 0,
							error: yahooStatus.status === "rejected" ? yahooStatus.reason?.message : null,
							sample: yahooStatus.status === "fulfilled" ? yahooStatus.value[0] : null,
						},
						tradingview: {
							status: tvStatus.status,
							works: tvStatus.status === "fulfilled" && tvStatus.value.length > 0,
							error: tvStatus.status === "rejected" ? tvStatus.reason?.message : null,
							sample: tvStatus.status === "fulfilled" ? tvStatus.value[0] : null,
						},
					},
					env: {
						NODE_ENV: process.env.NODE_ENV,
						PYTHON_PATH: process.env.PYTHON_PATH || "python3",
					},
				};
			}),
	);
