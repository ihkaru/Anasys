import { holdings, symbols, watchlistItems } from "@packages/db/src/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { Logger } from "../../utils/logger";
import { marketService } from "../market/market.service";

const logger = new Logger("SchedulerService");

export class SchedulerService {
	private syncIntervalId: Timer | null = null;
	private pruneIntervalId: Timer | null = null;
	private readonly SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 Minutes (Faster updates for trading)

	start() {
		logger.info("Scheduler started. Sync: 15m (VIP only)");

		// Run sync after short delay
		setTimeout(() => this.runSyncJob(), 5000);

		// Auto-prune disabled by user preference (keeping all historical data)
		// setTimeout(() => this.runPruneJob(), 60 * 60 * 1000);

		this.syncIntervalId = setInterval(() => this.runSyncJob(), this.SYNC_INTERVAL_MS);
		// this.pruneIntervalId = setInterval(() => this.runPruneJob(), this.PRUNE_INTERVAL_MS);
	}

	stop() {
		if (this.syncIntervalId) {
			clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}
		if (this.pruneIntervalId) {
			clearInterval(this.pruneIntervalId);
			this.pruneIntervalId = null;
		}
		logger.info("Scheduler stopped");
	}

	/**
	 * VIP-Only Sync: Only sync symbols in Watchlist or Holdings
	 */
	private async runSyncJob() {
		logger.info("Running VIP-only market sync...");
		try {
			// Get VIP symbol IDs (Watchlist + Holdings)
			const vipSymbolIds = await this.getVipSymbolIds();

			if (vipSymbolIds.length === 0) {
				logger.info("No VIP symbols to sync (empty watchlist/holdings).");
				return;
			}

			// Get symbols sorted by oldest sync
			const vipSymbols = await db
				.select()
				.from(symbols)
				.where(inArray(symbols.id, vipSymbolIds))
				.orderBy(asc(symbols.lastSyncedAt))
				.limit(30); // Max 30 per 15 min cycle = 120/hr (Very Safe)

			logger.info(`Syncing ${vipSymbols.length} VIP symbols (of ${vipSymbolIds.length} total)`);

			for (const symbol of vipSymbols) {
				try {
					await marketService.syncSymbolData(symbol.ticker, symbol.type as "STOCK" | "CRYPTO", "1d");
					await marketService.syncSymbolData(symbol.ticker, symbol.type as "STOCK" | "CRYPTO", "1h");
					await new Promise((resolve) => setTimeout(resolve, 3000)); // Rate limit
				} catch (e: any) {
					logger.error(`Sync failed for ${symbol.ticker}: ${e.message}`);
					await db.update(symbols).set({ lastSyncedAt: new Date() }).where(eq(symbols.id, symbol.id));
				}
			}
			logger.info("VIP sync completed.");
		} catch (e) {
			logger.error("Critical error in sync job", e);
		}
	}

	private async getVipSymbolIds(): Promise<number[]> {
		const watchlistIds = (await db.select({ id: watchlistItems.symbolId }).from(watchlistItems)).map((r) => r.id);
		const holdingIds = (await db.select({ id: holdings.symbolId }).from(holdings)).map((r) => r.id);

		return [...new Set([...watchlistIds, ...holdingIds])];
	}
}

export const schedulerService = new SchedulerService();
