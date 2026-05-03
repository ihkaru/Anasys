import { db } from "../db";
import { sql } from "drizzle-orm";

const QUESTDB_URL = process.env.QUESTDB_URL || "http://localhost:9000";

async function runMigration() {
	console.log("🚀 Starting Postgres to QuestDB Migration...");

	// 1. Get total rows to migrate
	const countRes = await db.execute(sql`SELECT count(*) as count FROM market_data`);
	const totalRows = countRes[0].count;
	console.log(`📊 Found ${totalRows} rows in market_data (Postgres).`);

	if (totalRows === 0) {
		console.log("✅ Nothing to migrate!");
		process.exit(0);
	}

	// 2. Fetch data in batches and insert to QuestDB using ILP
	const limit = 5000;
	let offset = 215000;
	let totalMigrated = 0;

	while (true) {
		const dataRes = await db.execute(sql`
      SELECT m.*, s.ticker as symbol
      FROM market_data m
      JOIN symbols s ON m.symbol_id = s.id
      ORDER BY m.symbol_id ASC, m.timestamp ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

		const rows = dataRes;
		if (rows.length === 0) break;

		let ilpPayload = "";

		for (const row of rows) {
			let symbol = row.symbol as string;
			let interval = row.interval as string;
			let source = (row.source as string) || "UNKNOWN";

			// Escape ILP tag values: comma, equals, space
			symbol = symbol.replace(/([,=\s])/g, "\\$1");
			interval = interval.replace(/([,=\s])/g, "\\$1");
			source = source.replace(/([,=\s])/g, "\\$1");

			const open = row.open as number;
			const high = row.high as number;
			const low = row.low as number;
			const close = row.close as number;
			const volume = row.volume as number;

			// ILP timestamp needs to be in nanoseconds
			// Postgres timestamp gives a JS Date object
			const date = new Date(row.timestamp as string);
			const timestampNanos = date.getTime() * 1000000;

			ilpPayload += `candles,symbol=${symbol},interval=${interval},source=${source} open=${open},high=${high},low=${low},close=${close},volume=${volume} ${timestampNanos}\n`;
		}

		try {
			const res = await fetch(`${QUESTDB_URL}/write`, {
				method: "POST",
				body: ilpPayload,
			});

			if (!res.ok) {
				throw new Error(`QuestDB HTTP ${res.status}: ${await res.text()}`);
			}

			totalMigrated += rows.length;
			console.log(`✅ Migrated batch: ${totalMigrated} / ${totalRows} rows...`);
		} catch (err) {
			console.error(`❌ Failed to send ILP batch to QuestDB at offset ${offset}:`, err);
			process.exit(1);
		}

		offset += limit;
	}

	console.log(`\n🎉 Migration complete! Successfully migrated ${totalMigrated} rows.`);
	process.exit(0);
}

runMigration().catch((err) => {
	console.error("❌ Migration Failed:", err);
	process.exit(1);
});
