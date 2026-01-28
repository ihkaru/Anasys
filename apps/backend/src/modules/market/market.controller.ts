import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { marketService } from "./market.service";

import { Logger } from "../../utils/logger";

const logger = new Logger('MarketController');

export const marketController = new Elysia({ prefix: "/market" })
    .use(jwt({ 
        name: "jwt", 
        secret: process.env.JWT_SECRET || "secret_key_change_me" 
    }))
    .use(cookie())
    .derive(async ({ jwt, cookie: { auth }, headers, request }) => {
        let token: string | undefined = auth?.value as string | undefined;
        const authHeader = headers['authorization'];
        
        logger.debug(`Auth check: Cookie=${token ? 'YES' : 'NO'}, Header=${authHeader ? 'YES' : 'NO'}`);
        
        if (!token && authHeader?.startsWith('Bearer ')) {
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
    // Market Overview (GET) - default indices
    .get("/overview", async () => {
        logger.debug("GET /overview");
        try {
            // Fetch latest prices for key indices
            const tickers = ['SPY', 'QQQ', 'BTC-USD'];
            const overview = await marketService.getMarketOverview(tickers);
            return { success: true, data: overview };
        } catch (e) {
            logger.error("Failed to get market overview", e);
            return { success: false, error: (e as Error).message };
        }
    })
    // Market Overview (POST) - dynamic tickers (NEW!)
    .post("/overview", async ({ body }) => {
        logger.debug(`POST /overview for ${body.tickers?.length || 0} tickers`);
        try {
            const tickers = body.tickers || [];
            if (tickers.length === 0) {
                return { success: true, data: [] };
            }
            // Use real-time quotes service instead of DB-based overview
            const quotes = await marketService.getQuotes(tickers);
            return { success: true, data: quotes };
        } catch (e) {
            logger.error("Failed to get quotes", e);
            return { success: false, error: (e as Error).message };
        }
    }, {
        body: t.Object({
            tickers: t.Array(t.String())
        })
    })
    // Real-time quotes for single or multiple tickers
    .get("/quotes", async ({ query }) => {
        const tickers = query.tickers?.split(',').map(t => t.trim()).filter(Boolean) || [];
        logger.debug(`GET /quotes for ${tickers.length} tickers`);
        
        if (tickers.length === 0) {
            return { success: false, error: "No tickers provided" };
        }
        
        try {
            const quotes = await marketService.getQuotes(tickers);
            return { success: true, data: quotes };
        } catch (e) {
            logger.error("Failed to get quotes", e);
            return { success: false, error: (e as Error).message };
        }
    }, {
        query: t.Object({
            tickers: t.String() // Comma-separated list
        })
    })
    // Search symbols
    .get("/search", async ({ query }) => {
        const q = query.q || '';
        const limit = query.limit ? parseInt(query.limit) : 15;
        
        logger.debug(`GET /search q="${q}" limit=${limit}`);
        
        if (q.length < 1) {
            return { success: false, error: "Query too short" };
        }
        
        try {
            const results = await marketService.searchSymbols(q, limit);
            return { success: true, data: results };
        } catch (e) {
            logger.error("Failed to search symbols", e);
            return { success: false, error: (e as Error).message };
        }
    }, {
        query: t.Object({
            q: t.String(),
            limit: t.Optional(t.String())
        })
    })
    // Trending symbols
    .get("/trending", async ({ query }) => {
        const region = query.region || 'US';
        const count = query.count ? parseInt(query.count) : 10;
        
        logger.debug(`GET /trending region=${region} count=${count}`);
        
        try {
            const trending = await marketService.getTrendingSymbols(region, count);
            return { success: true, data: trending };
        } catch (e) {
            logger.error("Failed to get trending symbols", e);
            return { success: false, error: (e as Error).message };
        }
    }, {
        query: t.Object({
            region: t.Optional(t.String()),
            count: t.Optional(t.String())
        })
    })
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
    .post("/sync", async (context: any) => {
        const { body, user } = context;
        logger.info(`SYNC ${body.ticker} requested by ${user?.email || 'Unknown'}`);
        try {
            const result = await marketService.syncSymbolData(body.ticker, body.type as 'STOCK' | 'CRYPTO', body.interval || '1d');
            return { success: true, ...result };
        } catch (e) {
            logger.error(`SYNC failed for ${body.ticker}`, e);
            return { success: false, error: (e as Error).message };
        }
    }, {
        beforeHandle: (context: any) => {
            const { user, set, request } = context;
            if (!user) {
                logger.warn(`SYNC Unauthorized attempt. URL: ${request.url}`);
                logger.debug("Missing user in context. Available keys:", Object.keys(context));
                set.status = 401;
                return { success: false, error: "Unauthorized" };
            }
        },
        body: t.Object({
            ticker: t.String(),
            type: t.Union([t.Literal('STOCK'), t.Literal('CRYPTO')]),
            interval: t.Optional(t.String())
        })
    })
    .get("/history/:ticker", async ({ params, query }) => {
        logger.debug(`GET /history/${params.ticker} interval=${query.interval} before=${query.before}`);
        try {
            const limit = query.limit ? parseInt(query.limit) : 100;
            const data = await marketService.getOHLCV(
                params.ticker, 
                query.interval || '1d', 
                limit, 
                query.before // Pass the before timestamp
            );
            return { success: true, data };
        } catch (e) {
             logger.error(`GET /history/${params.ticker} failed`, e);
             return { success: false, error: (e as Error).message };
        }
    }, {
        query: t.Object({
            limit: t.Optional(t.String()),
            interval: t.Optional(t.String()),
            before: t.Optional(t.String()) // ISO timestamp
        })
    })
    // GET SINGLE SYMBOL with on-demand enrichment
    .get("/symbols/:ticker", async ({ params, query }) => {
        const ticker = params.ticker.toUpperCase();
        logger.debug(`GET /symbols/${ticker} enrich=${query.enrich}`);
        
        try {
            let symbol = await marketService.getSymbolByTicker(ticker);
            
            if (!symbol) {
                return { success: false, error: "Symbol not found" };
            }
            
            // On-demand enrichment if requested (service handles stale check internally)
            if (query.enrich === 'true') {
                symbol = await marketService.enrichSymbol(ticker);
            }
            
            return { success: true, data: symbol };
        } catch (e) {
            logger.error(`GET /symbols/${ticker} failed`, e);
            return { success: false, error: (e as Error).message };
        }
    }, {
        query: t.Object({
            enrich: t.Optional(t.String()) // 'true' to trigger enrichment
        })
    })

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
    .get("/quote/:ticker", async ({ params }) => {
        const ticker = params.ticker.toUpperCase();
        logger.debug(`GET /quote/${ticker}`);
        
        try {
            const quotes = await marketService.getQuotes([ticker]);
            if (!quotes || quotes.length === 0) {
                return { success: false, error: "Quote not found" };
            }
            return { success: true, data: quotes[0] };
        } catch (e) {
            logger.error(`GET /quote/${ticker} failed`, e);
            return { success: false, error: (e as Error).message };
        }
    });

