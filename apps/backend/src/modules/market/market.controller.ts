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
    // Market Overview - get latest data for major indices
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
            
            // On-demand enrichment if requested and not yet enriched
            const shouldEnrich = query.enrich === 'true' && !symbol.metadataUpdatedAt;
            
            if (shouldEnrich) {
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
    });
