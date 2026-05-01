import { db } from "../db";
import { sql } from "drizzle-orm";

const QUESTDB_URL = process.env.QUESTDB_URL || "http://localhost:9000";

async function runReset() {
	console.log("⚠️  Starting Database Wipe for Fresh Harvesting...");

	// Wipe PostgreSQL
	console.log("🗑️  Truncating backfill_progress in PostgreSQL...");
	await db.execute(sql`TRUNCATE TABLE backfill_progress RESTART IDENTITY CASCADE;`);

	// Wipe QuestDB
	console.log("🗑️  Truncating candles in QuestDB...");
	const res = await fetch(`${QUESTDB_URL}/exec?query=${encodeURIComponent("TRUNCATE TABLE candles;")}`);
	if (!res.ok) {
		const errText = await res.text();
		// Ignore error if table doesn't exist yet
		if (!errText.includes("table does not exist")) {
			throw new Error(`QuestDB HTTP ${res.status}: ${errText}`);
		}
	}

	console.log("✅ Databases wiped successfully.");
	process.exit(0);
}

runReset().catch((err) => {
	console.error("❌ Reset Failed:", err);
	process.exit(1);
});
