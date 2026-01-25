import { symbols, watchlistItems, watchlists } from "@packages/db/src/schema";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { Logger } from "../../utils/logger";

const logger = new Logger('WatchlistService');

export interface CreateWatchlistInput {
    userId: number;
    name: string;
    isDefault?: boolean;
}

export interface WatchlistWithItems {
    id: number;
    name: string;
    isDefault: boolean;
    items: {
        ticker: string;
        name: string | null;
        type: string;
        addedAt: Date;
    }[];
}

export class WatchlistService {

    // Get all watchlists for a user
    async getUserWatchlists(userId: number) {
        logger.debug(`Getting watchlists for user ${userId}`);
        
        const result = await db.select()
            .from(watchlists)
            .where(eq(watchlists.userId, userId))
            .orderBy(desc(watchlists.isDefault), watchlists.name);
        
        return result;
    }

    // Get single watchlist with items
    async getWatchlistWithItems(watchlistId: number, userId: number): Promise<WatchlistWithItems | null> {
        logger.debug(`Getting watchlist ${watchlistId} for user ${userId}`);
        
        const [watchlist] = await db.select()
            .from(watchlists)
            .where(and(
                eq(watchlists.id, watchlistId),
                eq(watchlists.userId, userId)
            ))
            .limit(1);
        
        if (!watchlist) return null;
        
        // Get items with symbol details including logo info
        const items = await db.select({
            ticker: symbols.ticker,
            name: symbols.name,
            type: symbols.type,
            website: symbols.website,
            iconUrl: symbols.iconUrl,
            addedAt: watchlistItems.addedAt,
        })
            .from(watchlistItems)
            .innerJoin(symbols, eq(watchlistItems.symbolId, symbols.id))
            .where(eq(watchlistItems.watchlistId, watchlistId))
            .orderBy(desc(watchlistItems.addedAt));
        
        return {
            id: watchlist.id,
            name: watchlist.name,
            isDefault: watchlist.isDefault,
            items,
        };
    }

    // Create new watchlist
    async createWatchlist(input: CreateWatchlistInput) {
        logger.info(`Creating watchlist "${input.name}" for user ${input.userId}`);
        
        // If this is marked as default, unset other defaults
        if (input.isDefault) {
            await db.update(watchlists)
                .set({ isDefault: false })
                .where(eq(watchlists.userId, input.userId))
                .execute();
        }
        
        const [created] = await db.insert(watchlists)
            .values({
                userId: input.userId,
                name: input.name,
                isDefault: input.isDefault || false,
            })
            .returning();
        
        return created;
    }

    // Update watchlist
    async updateWatchlist(watchlistId: number, userId: number, updates: { name?: string; isDefault?: boolean }) {
        logger.info(`Updating watchlist ${watchlistId}`);
        
        // Verify ownership
        const [existing] = await db.select()
            .from(watchlists)
            .where(and(
                eq(watchlists.id, watchlistId),
                eq(watchlists.userId, userId)
            ))
            .limit(1);
        
        if (!existing) {
            throw new Error("Watchlist not found");
        }
        
        // If setting as default, unset others
        if (updates.isDefault) {
            await db.update(watchlists)
                .set({ isDefault: false })
                .where(eq(watchlists.userId, userId))
                .execute();
        }
        
        const [updated] = await db.update(watchlists)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .where(eq(watchlists.id, watchlistId))
            .returning();
        
        return updated;
    }

    // Delete watchlist
    async deleteWatchlist(watchlistId: number, userId: number) {
        logger.info(`Deleting watchlist ${watchlistId}`);
        
        const [existing] = await db.select()
            .from(watchlists)
            .where(and(
                eq(watchlists.id, watchlistId),
                eq(watchlists.userId, userId)
            ))
            .limit(1);
        
        if (!existing) {
            throw new Error("Watchlist not found");
        }
        
        if (existing.isDefault) {
            throw new Error("Cannot delete default watchlist");
        }
        
        await db.delete(watchlists)
            .where(eq(watchlists.id, watchlistId))
            .execute();
        
        return { success: true };
    }

    // Add symbol to watchlist
    async addSymbolToWatchlist(watchlistId: number, userId: number, ticker: string) {
        logger.info(`Adding ${ticker} to watchlist ${watchlistId}`);
        
        // Verify watchlist ownership
        const [watchlist] = await db.select()
            .from(watchlists)
            .where(and(
                eq(watchlists.id, watchlistId),
                eq(watchlists.userId, userId)
            ))
            .limit(1);
        
        if (!watchlist) {
            throw new Error("Watchlist not found");
        }
        
        // Find symbol
        const [symbol] = await db.select()
            .from(symbols)
            .where(eq(symbols.ticker, ticker.toUpperCase()))
            .limit(1);
        
        if (!symbol) {
            throw new Error("Symbol not found");
        }
        
        // Add to watchlist (ignore if already exists)
        await db.insert(watchlistItems)
            .values({
                watchlistId,
                symbolId: symbol.id,
            })
            .onConflictDoNothing()
            .execute();
        
        return { success: true };
    }

    // Remove symbol from watchlist
    async removeSymbolFromWatchlist(watchlistId: number, userId: number, ticker: string) {
        logger.info(`Removing ${ticker} from watchlist ${watchlistId}`);
        
        // Verify watchlist ownership
        const [watchlist] = await db.select()
            .from(watchlists)
            .where(and(
                eq(watchlists.id, watchlistId),
                eq(watchlists.userId, userId)
            ))
            .limit(1);
        
        if (!watchlist) {
            throw new Error("Watchlist not found");
        }
        
        // Find symbol
        const [symbol] = await db.select()
            .from(symbols)
            .where(eq(symbols.ticker, ticker.toUpperCase()))
            .limit(1);
        
        if (!symbol) {
            throw new Error("Symbol not found");
        }
        
        await db.delete(watchlistItems)
            .where(and(
                eq(watchlistItems.watchlistId, watchlistId),
                eq(watchlistItems.symbolId, symbol.id)
            ))
            .execute();
        
        return { success: true };
    }

    // Ensure user has a default watchlist
    async ensureDefaultWatchlist(userId: number) {
        const existing = await db.select()
            .from(watchlists)
            .where(eq(watchlists.userId, userId))
            .limit(1);
        
        if (existing.length === 0) {
            logger.info(`Creating default watchlist for user ${userId}`);
            return this.createWatchlist({
                userId,
                name: 'My Watchlist',
                isDefault: true,
            });
        }
        
        return existing[0];
    }
}

export const watchlistService = new WatchlistService();
