import { db } from "../db";
import { backfillProgress } from "../../../../packages/db/src/schema";
import { sql } from "drizzle-orm";

async function runSeeder() {
	console.log("🌱 Starting Seed Script for Missing Backfill Tasks...");

	const intervals = ["1m", "15m", "1h", "1d"];

	// Find all (symbol_id, interval) pairs that are MISSING from backfill_progress
	console.log("🔍 Checking for missing symbol-interval pairs...");
	const missingPairsQuery = await db.execute(sql`
    SELECT s.id as symbol_id, i.interval
    FROM symbols s
    CROSS JOIN (
      SELECT unnest(ARRAY['1d', '1h', '15m', '1m']) as interval
    ) i
    LEFT JOIN backfill_progress bp ON bp.symbol_id = s.id AND bp.interval = i.interval
    WHERE bp.id IS NULL
  `);

	const missingPairs = missingPairsQuery as unknown as { symbol_id: number; interval: string }[];
	console.log(`Found ${missingPairs.length} missing tasks.`);

	if (missingPairs.length === 0) {
		console.log("✅ All tasks are already seeded!");
		process.exit(0);
	}

	const defaultTargetDate = new Date("2018-01-01T00:00:00Z");

	const batchSize = 1000;
	let totalInserted = 0;

	for (let i = 0; i < missingPairs.length; i += batchSize) {
		const batch = missingPairs.slice(i, i + batchSize);
		const tasksToInsert = batch.map((p) => ({
			symbolId: p.symbol_id,
			interval: p.interval,
			targetStartDate: defaultTargetDate,
			isCompleted: false,
		}));

		try {
			await db.insert(backfillProgress).values(tasksToInsert);
			totalInserted += tasksToInsert.length;
			console.log(`✅ Inserted batch: ${totalInserted} tasks so far...`);
		} catch (err) {
			console.error(`❌ Failed to insert batch starting at index ${i}:`, err);
		}
	}

	console.log(`\n🎉 Seeding complete! Inserted ${totalInserted} tasks.`);

	// Verify total count
	const verifyRes = await db.execute(sql`SELECT count(*) as count FROM backfill_progress`);
	console.log(`📊 Total rows in backfill_progress: ${verifyRes[0].count}`);

	process.exit(0);
}

runSeeder().catch((err) => {
	console.error("❌ Seeder Failed:", err);
	process.exit(1);
});
