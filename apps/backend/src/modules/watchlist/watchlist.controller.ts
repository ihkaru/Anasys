import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { getJwtSecret } from "../../config";
import { Logger } from "../../utils/logger";
import { watchlistService } from "./watchlist.service";

const logger = new Logger('WatchlistController');

export const watchlistController = new Elysia({ prefix: "/watchlists" })
    .use(jwt({
        name: "jwt",
        secret: getJwtSecret()
    }))
    .use(cookie())
    .derive(async ({ jwt, cookie: { auth }, headers }) => {
        let token: string | undefined = auth?.value as string | undefined;
        const authHeader = headers['authorization'];
        
        if (!token && authHeader?.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
        
        if (!token) {
            return { user: null };
        }
        
        try {
            const profile = await jwt.verify(token);
            return { user: profile || null };
        } catch (e) {
            return { user: null };
        }
    })
    // Auth guard for all routes
    .guard({
        beforeHandle: ({ user, set }: any) => {
            if (!user) {
                set.status = 401;
                return { success: false, error: "Unauthorized" };
            }
        }
    })
    // GET all watchlists for current user
    .get("/", async ({ user }: any) => {
        logger.debug(`GET /watchlists for user ${user.id}`);
        try {
            const watchlists = await watchlistService.getUserWatchlists(user.id);
            return { success: true, data: watchlists };
        } catch (e) {
            logger.error("Failed to get watchlists", e);
            return { success: false, error: (e as Error).message };
        }
    })
    // GET single watchlist with items
    .get("/:id", async ({ params, user }: any) => {
        logger.debug(`GET /watchlists/${params.id}`);
        try {
            const watchlist = await watchlistService.getWatchlistWithItems(
                parseInt(params.id),
                user.id
            );
            if (!watchlist) {
                return { success: false, error: "Watchlist not found" };
            }
            return { success: true, data: watchlist };
        } catch (e) {
            logger.error("Failed to get watchlist", e);
            return { success: false, error: (e as Error).message };
        }
    })
    // CREATE new watchlist
    .post("/", async ({ body, user }: any) => {
        logger.info(`POST /watchlists - ${body.name}`);
        try {
            const watchlist = await watchlistService.createWatchlist({
                userId: user.id,
                name: body.name,
                isDefault: body.isDefault || false,
            });
            return { success: true, data: watchlist };
        } catch (e) {
            logger.error("Failed to create watchlist", e);
            return { success: false, error: (e as Error).message };
        }
    }, {
        body: t.Object({
            name: t.String(),
            isDefault: t.Optional(t.Boolean())
        })
    })
    // UPDATE watchlist
    .patch("/:id", async ({ params, body, user }: any) => {
        logger.info(`PATCH /watchlists/${params.id}`);
        try {
            const watchlist = await watchlistService.updateWatchlist(
                parseInt(params.id),
                user.id,
                body
            );
            return { success: true, data: watchlist };
        } catch (e) {
            logger.error("Failed to update watchlist", e);
            return { success: false, error: (e as Error).message };
        }
    }, {
        body: t.Object({
            name: t.Optional(t.String()),
            isDefault: t.Optional(t.Boolean())
        })
    })
    // DELETE watchlist
    .delete("/:id", async ({ params, user }: any) => {
        logger.info(`DELETE /watchlists/${params.id}`);
        try {
            await watchlistService.deleteWatchlist(parseInt(params.id), user.id);
            return { success: true };
        } catch (e) {
            logger.error("Failed to delete watchlist", e);
            return { success: false, error: (e as Error).message };
        }
    })
    // ADD symbol to watchlist (auto-registers new symbols from Yahoo Finance)
    .post("/:id/symbols", async ({ params, body, user }: any) => {
        logger.info(`POST /watchlists/${params.id}/symbols - ${body.ticker} (${body.source || 'YAHOO'})`);
        try {
            const result = await watchlistService.addSymbolToWatchlist(
                parseInt(params.id),
                user.id,
                body.ticker,
                body.type,
                body.source || 'YAHOO'
            );
            return { success: true, symbol: result.symbol };
        } catch (e) {
            logger.error("Failed to add symbol", e);
            return { success: false, error: (e as Error).message };
        }
    }, {
        body: t.Object({
            ticker: t.String(),
            type: t.Optional(t.Union([t.Literal('STOCK'), t.Literal('CRYPTO')])),
            source: t.Optional(t.String())
        })
    })
    // REMOVE symbol from watchlist
    .delete("/:id/symbols/:ticker", async ({ params, user }: any) => {
        logger.info(`DELETE /watchlists/${params.id}/symbols/${params.ticker}`);
        try {
            await watchlistService.removeSymbolFromWatchlist(
                parseInt(params.id),
                user.id,
                params.ticker
            );
            return { success: true };
        } catch (e) {
            logger.error("Failed to remove symbol", e);
            return { success: false, error: (e as Error).message };
        }
    });
