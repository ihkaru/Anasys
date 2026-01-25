import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { Logger } from "../../utils/logger";
import { holdingsService } from "./holdings.service";

const logger = new Logger('HoldingsController');

export const holdingsController = new Elysia({ prefix: "/holdings" })
    .use(jwt({
        name: "jwt",
        secret: process.env.JWT_SECRET || "secret_key_change_me"
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
    // Auth guard
    .guard({
        beforeHandle: ({ user, set }: any) => {
            if (!user) {
                set.status = 401;
                return { success: false, error: "Unauthorized" };
            }
        }
    })
    // GET all holdings for current user
    .get("/", async ({ user }: any) => {
        logger.debug(`GET /holdings for user ${user.id}`);
        try {
            const holdings = await holdingsService.getUserHoldings(user.id);
            return { success: true, data: holdings };
        } catch (e) {
            logger.error("Failed to get holdings", e);
            return { success: false, error: (e as Error).message };
        }
    })
    // GET portfolio summary
    .get("/summary", async ({ user }: any) => {
        logger.debug(`GET /holdings/summary for user ${user.id}`);
        try {
            const summary = await holdingsService.getPortfolioSummary(user.id);
            return { success: true, data: summary };
        } catch (e) {
            logger.error("Failed to get portfolio summary", e);
            return { success: false, error: (e as Error).message };
        }
    })
    // CREATE new holding
    .post("/", async ({ body, user }: any) => {
        logger.info(`POST /holdings - ${body.ticker}`);
        try {
            const result = await holdingsService.createHolding({
                userId: user.id,
                ticker: body.ticker,
                shares: body.shares,
                avgCost: body.avgCost,
            });
            if (!result.success) {
                return { success: false, error: result.error };
            }
            return { success: true, data: { id: result.id } };
        } catch (e) {
            logger.error("Failed to create holding", e);
            return { success: false, error: (e as Error).message };
        }
    }, {
        body: t.Object({
            ticker: t.String(),
            shares: t.Number(),
            avgCost: t.Number()
        })
    })
    // UPDATE holding
    .patch("/:id", async ({ params, body, user }: any) => {
        logger.info(`PATCH /holdings/${params.id}`);
        try {
            const holding = await holdingsService.updateHolding(
                parseInt(params.id),
                user.id,
                body
            );
            return { success: true, data: holding };
        } catch (e) {
            logger.error("Failed to update holding", e);
            return { success: false, error: (e as Error).message };
        }
    }, {
        body: t.Object({
            shares: t.Optional(t.Number()),
            avgCost: t.Optional(t.Number())
        })
    })
    // DELETE holding
    .delete("/:id", async ({ params, user }: any) => {
        logger.info(`DELETE /holdings/${params.id}`);
        try {
            await holdingsService.deleteHolding(parseInt(params.id), user.id);
            return { success: true };
        } catch (e) {
            logger.error("Failed to delete holding", e);
            return { success: false, error: (e as Error).message };
        }
    });
