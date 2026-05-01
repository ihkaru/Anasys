import { db } from "../db";
import { backfillProgress, symbols } from "@packages/db/src/schema";
import { eq, and, asc } from "drizzle-orm";

async function inspect() {
	console.log("🔍 Inspecting Top 20 Pending Tasks...");
	const tasks = await db
		.select({
			id: backfillProgress.id,
			ticker: symbols.ticker,
			interval: backfillProgress.interval,
			updatedAt: backfillProgress.updatedAt,
			isCompleted: backfillProgress.isCompleted,
		})
		.from(backfillProgress)
		.innerJoin(symbols, eq(backfillProgress.symbolId, symbols.id))
		.where(eq(backfillProgress.isCompleted, false))
		.orderBy(asc(backfillProgress.updatedAt))
		.limit(20);

	console.table(tasks);
	process.exit(0);
}

inspect();
