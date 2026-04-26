/**
 * Clean up non-standard 1h timestamps in batches
 * Safe for TimescaleDB hypertables
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

const BATCH_SIZE = 1000;
const DELAY_MS = 500;

async function cleanBadTimestamps() {
	console.log("🧹 Cleaning non-standard 1h timestamps (batch mode)...\n");

	let totalDeleted = 0;
	let batchNum = 0;

	while (true) {
		batchNum++;

		// Find and delete a batch of bad records
		const _result = await db.execute(sql`
            WITH bad_records AS (
                SELECT ctid FROM market_data 
                WHERE interval = '1h' 
                AND EXTRACT(MINUTE FROM timestamp) != 0
                LIMIT ${BATCH_SIZE}
            )
            DELETE FROM market_data 
            WHERE ctid IN (SELECT ctid FROM bad_records)
        `);

		// Check how many were deleted
		const countResult = await db.execute(sql`
            SELECT COUNT(*) as remaining FROM market_data 
            WHERE interval = '1h' 
            AND EXTRACT(MINUTE FROM timestamp) != 0
        `);

		const remaining = Number(countResult[0]?.remaining || 0);

		if (remaining === 0) {
			console.log(`\n✅ All non-standard timestamps cleaned!`);
			console.log(`   Total batches: ${batchNum}`);
			console.log(`   Total deleted: ${totalDeleted}`);
			break;
		}

		totalDeleted += BATCH_SIZE;
		process.stdout.write(`\r   Batch ${batchNum}: ~${totalDeleted} deleted, ${remaining} remaining...`);

		// Small delay to avoid overwhelming the DB
		await new Promise((r) => setTimeout(r, DELAY_MS));
	}

	// Final count
	const finalCount = await db.execute(sql`
        SELECT COUNT(*) as count FROM market_data WHERE interval = '1h'
    `);
	console.log(`\n📊 Final 1h record count: ${finalCount[0]?.count}`);
}

cleanBadTimestamps()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
