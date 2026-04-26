import { db } from "../../../db";
import { backfillProgress, symbols } from "../../../../../../packages/db/src/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { Logger } from "../../../utils/logger";

const logger = new Logger("BackfillService");

export class BackfillService {
	/**
	 * Get pending backfill tasks.
	 * Returns symbols that haven't completed their target backfill range.
	 */
	async getPendingTasks(limit = 50) {
		// Fetch active symbols that need backfilling
		const symbolsToProcess = await db.select().from(symbols).where(eq(symbols.isActive, true)).limit(200);

		const tasks = [];

		for (const symbol of symbolsToProcess) {
			// Backfill Daily (10 years) and 1h (1 year)
			const intervals = [
				{ interval: "1d", years: 10 },
				{ interval: "1h", years: 1 },
			];

			for (const config of intervals) {
				const targetStartDate = new Date();
				targetStartDate.setFullYear(targetStartDate.getFullYear() - config.years);

				const progress = await db
					.select()
					.from(backfillProgress)
					.where(and(eq(backfillProgress.symbolId, symbol.id), eq(backfillProgress.interval, config.interval)))
					.limit(1);

				if (progress.length === 0) {
					const [newProgress] = await db
						.insert(backfillProgress)
						.values({
							symbolId: symbol.id,
							interval: config.interval,
							targetStartDate,
							isCompleted: false,
						})
						.returning();
					tasks.push({ ...newProgress, ticker: symbol.ticker });
				} else if (!progress[0].isCompleted) {
					tasks.push({ ...progress[0], ticker: symbol.ticker });
				}

				if (tasks.length >= limit) return tasks;
			}
		}

		return tasks;
	}

	/**
	 * Update progress for a specific backfill task.
	 */
	async updateProgress(id: number, lastTimestamp: string, isCompleted = false) {
		logger.info(`Updating backfill progress for ID ${id}: last=${lastTimestamp}, completed=${isCompleted}`);

		await db
			.update(backfillProgress)
			.set({
				lastBackfilledAt: new Date(lastTimestamp),
				isCompleted,
				updatedAt: new Date(),
			})
			.where(eq(backfillProgress.id, id));
	}
}

export const backfillService = new BackfillService();
