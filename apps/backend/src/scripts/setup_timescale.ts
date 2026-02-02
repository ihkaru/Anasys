import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * setup_timescale.ts
 *
 * Configures TimescaleDB hypertables for time-series data.
 * This should be run after schema migration.
 */
async function setupTimescale() {
	console.log("⏳ Configuring TimescaleDB Hypertables...");

	try {
		// 1. market_data (partition by timestamp, 1 day chunks by default)
		// We use if_not_exists => TRUE to make it idempotent
		await db.execute(sql`
            SELECT create_hypertable(
                'market_data', 
                'timestamp', 
                chunk_time_interval => INTERVAL '1 day',
                if_not_exists => TRUE
            );
        `);
		console.log("   ✅ Hypertable 'market_data' configured");

		// 2. Add compression policy (optional, but good for older data)
		// Compress chunks older than 7 days
		await db
			.execute(sql`
            ALTER TABLE market_data SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'symbol_id'
            );
        `)
			.catch(() => {
				// Ignore error if already enabled
			});

		await db
			.execute(sql`
            SELECT add_compression_policy('market_data', INTERVAL '7 days', if_not_exists => TRUE);
        `)
			.catch((_e) => {
				// Ignore if policy already exists
			});
		console.log("   ✅ Compression policy enabled (7 days)");
	} catch (error) {
		console.error("❌ Failed to configure TimescaleDB:", error);
		process.exit(1);
	}

	console.log("✨ TimescaleDB setup complete");
	process.exit(0);
}

setupTimescale();
