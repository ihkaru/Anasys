import { db } from "../../../db";
import { backfillProgress, symbols } from "../../../../../../packages/db/src/schema";
import { eq, and, asc } from "drizzle-orm";
import { Logger } from "../../../utils/logger";

const logger = new Logger("BackfillService");

export class BackfillService {
	/**
	 * Get pending backfill tasks.
	 * Returns symbols that haven't completed their target backfill range.
	 */
	async getPendingTasks(limit = 50) {
		// Use a join to find symbols and their progress, prioritizing those that haven't been updated recently.
		// This ensures fair distribution (Round-Robin) and prevents stuck tasks.
		const pending = await db
			.select({
				id: backfillProgress.id,
				symbolId: backfillProgress.symbolId,
				interval: backfillProgress.interval,
				targetStartDate: backfillProgress.targetStartDate,
				lastBackfilledAt: backfillProgress.lastBackfilledAt,
				isCompleted: backfillProgress.isCompleted,
				ticker: symbols.ticker,
				assetType: symbols.type,
				tradingviewSymbol: symbols.tradingviewSymbol,
				tradingviewExchange: symbols.tradingviewExchange,
			})
			.from(backfillProgress)
			.innerJoin(symbols, eq(backfillProgress.symbolId, symbols.id))
			.where(and(eq(symbols.isActive, true), eq(backfillProgress.isCompleted, false)))
			.orderBy(asc(backfillProgress.updatedAt))
			.limit(limit);

		// If we don't have enough pending tasks, we might need to initialize new ones
		// (Optional: In a real app, you'd seed the progress table first)
		if (pending.length < limit) {
			logger.debug(`Found only ${pending.length} tasks in progress table. Checking for new symbols...`);
			// This part is less critical if we've already seeded, but good for robustness
		}

		return pending;
	}

	/**
	 * Update progress for a specific backfill task.
	 */
	async updateProgress(id: number, lastTimestamp: string, isCompleted = false, metadata?: any) {
		logger.info(
			`Updating backfill progress for ID ${id}: last=${lastTimestamp}, completed=${isCompleted}, hasMeta=${!!metadata}`,
		);

		await db.transaction(async (tx) => {
			// 1. Update progress table
			await tx
				.update(backfillProgress)
				.set({
					lastBackfilledAt: new Date(lastTimestamp),
					isCompleted,
					updatedAt: new Date(),
				})
				.where(eq(backfillProgress.id, id));

			// 2. Update symbol metadata if provided
			if (metadata?.name) {
				// Find symbolId for this backfill record first
				const progress = await tx
					.select({ symbolId: backfillProgress.symbolId })
					.from(backfillProgress)
					.where(eq(backfillProgress.id, id))
					.limit(1);

				if (progress.length > 0) {
					logger.debug(`Updating symbol metadata for symbolId=${progress[0].symbolId}: ${metadata.name}`);
					await tx
						.update(symbols)
						.set({
							description: metadata.name,
							exchange: metadata.exchange,
							metadataUpdatedAt: new Date(),
						})
						.where(eq(symbols.id, progress[0].symbolId));
				}
			}
		});
	}
}

export const backfillService = new BackfillService();
