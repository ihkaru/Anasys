import { symbols, watchlistItems, watchlists } from "@packages/db/src/schema";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { Logger } from "../../utils/logger";

const logger = new Logger("WatchlistService");

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
		source: string;
		addedAt: Date;
	}[];
}

export class WatchlistService {
	// Get all watchlists for a user
	async getUserWatchlists(userId: number) {
		logger.debug(`Getting watchlists for user ${userId}`);

		const result = await db
			.select()
			.from(watchlists)
			.where(eq(watchlists.userId, userId))
			.orderBy(desc(watchlists.isDefault), watchlists.name);

		return result;
	}

	// Get single watchlist with items
	async getWatchlistWithItems(watchlistId: number, userId: number): Promise<WatchlistWithItems | null> {
		logger.debug(`Getting watchlist ${watchlistId} for user ${userId}`);

		const [watchlist] = await db
			.select()
			.from(watchlists)
			.where(and(eq(watchlists.id, watchlistId), eq(watchlists.userId, userId)))
			.limit(1);

		if (!watchlist) return null;

		// Get items with symbol details including logo info
		const items = await db
			.select({
				ticker: symbols.ticker,
				name: symbols.name,
				type: symbols.type,
				website: symbols.website,
				iconUrl: symbols.iconUrl,
				currency: symbols.currency,
				exchange: symbols.exchange,
				addedAt: watchlistItems.addedAt,
				source: watchlistItems.source, // Select source
			})
			.from(watchlistItems)
			.innerJoin(symbols, eq(watchlistItems.symbolId, symbols.id))
			.where(eq(watchlistItems.watchlistId, watchlistId))
			.orderBy(desc(watchlistItems.addedAt));

		// Enrich items missing currency BEFORE returning
		// This ensures users see correct currency on first load
		const missingCurrency = items.filter((i) => !i.currency);
		if (missingCurrency.length > 0) {
			logger.info(`Enriching ${missingCurrency.length} symbols with missing currency...`);
			const { marketService } = await import("../market/market.service");

			// Enrich in parallel for speed
			const enrichPromises = missingCurrency.map(async (item) => {
				try {
					const enriched = await marketService.enrichSymbol(item.ticker);
					if (enriched?.currency) {
						// Update the item in our response
						item.currency = enriched.currency;
					}
				} catch (e) {
					logger.warn(`Failed to enrich ${item.ticker}:`, e);
				}
			});

			await Promise.all(enrichPromises);
		}

		const result = {
			id: watchlist.id,
			name: watchlist.name,
			isDefault: watchlist.isDefault,
			items,
		};

		return result;
	}

	// Create new watchlist
	async createWatchlist(input: CreateWatchlistInput) {
		logger.info(`Creating watchlist "${input.name}" for user ${input.userId}`);

		// If this is marked as default, unset other defaults
		if (input.isDefault) {
			await db.update(watchlists).set({ isDefault: false }).where(eq(watchlists.userId, input.userId)).execute();
		}

		const [created] = await db
			.insert(watchlists)
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
		const [existing] = await db
			.select()
			.from(watchlists)
			.where(and(eq(watchlists.id, watchlistId), eq(watchlists.userId, userId)))
			.limit(1);

		if (!existing) {
			throw new Error("Watchlist not found");
		}

		// If setting as default, unset others
		if (updates.isDefault) {
			await db.update(watchlists).set({ isDefault: false }).where(eq(watchlists.userId, userId)).execute();
		}

		const [updated] = await db
			.update(watchlists)
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

		const [existing] = await db
			.select()
			.from(watchlists)
			.where(and(eq(watchlists.id, watchlistId), eq(watchlists.userId, userId)))
			.limit(1);

		if (!existing) {
			throw new Error("Watchlist not found");
		}

		if (existing.isDefault) {
			throw new Error("Cannot delete default watchlist");
		}

		await db.delete(watchlists).where(eq(watchlists.id, watchlistId)).execute();

		return { success: true };
	}

	// Add symbol to watchlist
	async addSymbolToWatchlist(
		watchlistId: number,
		userId: number,
		ticker: string,
		type?: "STOCK" | "CRYPTO",
		source: string = "YAHOO",
		/** User-selected exchange from search results (e.g. "BMV", "NASDAQ").
		 *  For TRADINGVIEW source, this becomes the confirmed tv mapping, overriding auto-discovery. */
		exchange?: string,
	) {
		logger.info(`Adding ${ticker} (${source}, exchange=${exchange || "auto"}) to watchlist ${watchlistId}`);

		// Verify watchlist ownership
		const [watchlist] = await db
			.select()
			.from(watchlists)
			.where(and(eq(watchlists.id, watchlistId), eq(watchlists.userId, userId)))
			.limit(1);

		if (!watchlist) {
			throw new Error("Watchlist not found");
		}

		// Find symbol in DB first
		let [symbol] = await db.select().from(symbols).where(eq(symbols.ticker, ticker.toUpperCase())).limit(1);

		const { marketService } = await import("../market/market.service");

		// If not found, auto-register
		if (!symbol) {
			logger.info(`Symbol ${ticker} not in DB. Auto-registering...`);
			const symbolType = type ?? (ticker.includes("-") ? "CRYPTO" : "STOCK");
			symbol = await marketService.ensureSymbol(ticker.toUpperCase(), symbolType);
		}

		// If user explicitly chose a TRADINGVIEW exchange, persist it immediately as a
		// confirmed mapping — this overrides the heuristic auto-discovery.
		if (source === "TRADINGVIEW" && exchange) {
			const tvExchangeChanged = symbol.tradingviewExchange !== exchange;
			if (tvExchangeChanged) {
				logger.info(
					`[${ticker}] User-confirmed TV exchange: ${exchange} (was: ${symbol.tradingviewExchange || "unset"})`,
				);
				await db
					.update(symbols)
					.set({
						tradingviewExchange: exchange,
						tradingviewSymbol: ticker.toUpperCase(), // Clean ticker without exchange prefix
					})
					.where(eq(symbols.id, symbol.id))
					.execute();
				// Refresh symbol record so the returned data is current
				const [updated] = await db.select().from(symbols).where(eq(symbols.id, symbol.id)).limit(1);
				if (updated) symbol = updated;
			}
		}

		// Ensure symbol has currency data before adding to watchlist
		// This ensures user sees correct currency on first load
		if (!symbol.currency) {
			logger.info(`Symbol ${ticker} missing currency. Enriching before add...`);
			try {
				const enriched = await marketService.enrichSymbol(ticker.toUpperCase());
				if (enriched) {
					symbol = enriched;
				}
			} catch (err) {
				logger.warn(`Failed to enrich ${ticker} currency, will continue with null currency`, err);
			}
		}

		// Add to watchlist with SOURCE
		await db
			.insert(watchlistItems)
			.values({
				watchlistId,
				symbolId: symbol.id,
				source: source, // Save source
			})
			// Update conflict handling to do nothing if (watchlistId, symbolId, source) matches
			.onConflictDoNothing()
			.execute();

		// Add symbol to real-time harvest set in Redis
		try {
			const { redisConnection } = await import("../scheduler/queue");
			await redisConnection.sadd("harvest:realtime:symbols", ticker.toUpperCase());
			logger.info(`Added ${ticker.toUpperCase()} to Redis real-time harvest set`);
		} catch (err) {
			logger.error(`Failed to add ${ticker.toUpperCase()} to Redis real-time harvest set:`, err);
		}

		return { success: true, symbol };
	}

	// Remove symbol from watchlist
	async removeSymbolFromWatchlist(watchlistId: number, userId: number, ticker: string, source?: string) {
		logger.info(`Removing ${ticker} (source=${source || "any"}) from watchlist ${watchlistId}`);

		// Verify watchlist ownership
		const [watchlist] = await db
			.select()
			.from(watchlists)
			.where(and(eq(watchlists.id, watchlistId), eq(watchlists.userId, userId)))
			.limit(1);

		if (!watchlist) {
			throw new Error("Watchlist not found");
		}

		// Find symbol
		const [symbol] = await db.select().from(symbols).where(eq(symbols.ticker, ticker.toUpperCase())).limit(1);

		if (!symbol) {
			throw new Error("Symbol not found");
		}

		// Build delete conditions
		const conditions = [eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.symbolId, symbol.id)];

		// If source is specified, only delete that specific source entry
		if (source) {
			conditions.push(eq(watchlistItems.source, source));
		}

		await db
			.delete(watchlistItems)
			.where(and(...conditions))
			.execute();

		return { success: true };
	}

	// Ensure user has a default watchlist
	async ensureDefaultWatchlist(userId: number) {
		const existing = await db.select().from(watchlists).where(eq(watchlists.userId, userId)).limit(1);

		if (existing.length === 0) {
			logger.info(`Creating default watchlist for user ${userId}`);
			return this.createWatchlist({
				userId,
				name: "My Watchlist",
				isDefault: true,
			});
		}

		return existing[0];
	}
}

export const watchlistService = new WatchlistService();
