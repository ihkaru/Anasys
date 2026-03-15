import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * One-time cleanup: Delete all 1h candle data that was stored with
 * normalized (rounded) timestamps. These will be re-fetched with
 * correct raw timestamps on next chart load via auto-sync.
 *
 * Daily (1d) data is fine and preserved.
 */
async function cleanNormalizedData() {
	console.log("🧹 Database Cleanup: Removing corrupted 1h data with normalized timestamps\n");

	// 1. Count what we're about to delete
	const countQuery = sql`
		SELECT
			m.interval,
			COUNT(*) as candle_count,
			COUNT(DISTINCT m.symbol_id) as symbol_count
		FROM market_data m
		WHERE m.interval = '1h'
		GROUP BY m.interval;
	`;
	const counts = await db.execute(countQuery);

	if (counts.length === 0) {
		console.log("✅ No 1h data found — nothing to clean.");
		process.exit(0);
	}

	console.log("Data to delete:");
	console.table(counts);

	// 2. Delete all 1h data
	console.log("\n🗑️  Deleting all 1h candle data...");
	const deleteResult = await db.execute(sql`
		DELETE FROM market_data WHERE interval = '1h';
	`);
	console.log("✅ Deleted " + (deleteResult as any).rowCount + " rows.");

	// 3. Verify daily data is untouched
	const dailyCount = await db.execute(sql`
		SELECT COUNT(*) as remaining_daily FROM market_data WHERE interval = '1d';
	`);
	console.log("\n📊 Daily (1d) data preserved: " + (dailyCount as any)[0]?.remaining_daily + " candles");

	console.log("\nℹ  1h data will automatically re-sync (with correct raw timestamps) when charts are loaded.");
	process.exit(0);
}

cleanNormalizedData().catch((e) => {
	console.error("Cleanup error:", e);
	process.exit(1);
});
