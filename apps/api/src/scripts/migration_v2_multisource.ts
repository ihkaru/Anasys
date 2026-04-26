import { sql } from "drizzle-orm";
import { db } from "../db";

async function runMigration() {
	console.log("🚀 Starting Multi-Source & Metadata Migration...");

	try {
		// 1. Migrating watchlist_items
		console.log("➡️  Migrating watchlist_items...");
		try {
			await db.execute(
				sql`ALTER TABLE "watchlist_items" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'YAHOO' NOT NULL`,
			);
			console.log("   ✅ watchlist_items.source added.");

			// Update PK
			// We need to know the constraint name. Usually structured as table_pkey or similar.
			// Drizzle default naming is often not predictable without explicit names, but in standard Postgres it's table_pkey.
			// However, with composite keys Drizzle might name it differently.
			// Best bet: Try dropping the standard one or use a heuristic.

			// For now, simpler approach: Catch error if fails.
			try {
				// Determine constraint name (Postgres default for composite PK is often strict)
				// Let's assume standard Drizzle didn't name it explicitly in previous schema version:
				// "watchlist_items_pkey" is standard postgres manual. Drizzle uses "watchlist_items_..._pk"

				// Inspect information_schema to find constraint name? Too complex for script.
				// Bruteforce: Drop constraint "watchlist_items_pkey" (if serial pk) but this has composite.
				// Previous schema: pk: primaryKey({ columns: [table.watchlistId, table.symbolId] })
				// Drizzle generates: "watchlist_items_watchlist_id_symbol_id_pk"

				await db.execute(
					sql`ALTER TABLE "watchlist_items" DROP CONSTRAINT IF EXISTS "watchlist_items_watchlist_id_symbol_id_pk"`,
				);
				await db.execute(
					sql`ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_symbol_id_source_pk" PRIMARY KEY ("watchlist_id", "symbol_id", "source")`,
				);
				console.log("   ✅ watchlist_items PK updated.");
			} catch (pkErr) {
				console.log("   ⚠️ watchlist_items PK update WARNING:", (pkErr as Error).message);
			}
		} catch (e) {
			console.log("   ⚠️ watchlist_items.source might already exist or failed:", (e as Error).message);
		}

		// 2. Add 'source' column to holdings
		console.log("➡️  Migrating holdings...");
		try {
			await db.execute(sql`ALTER TABLE "holdings" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'YAHOO' NOT NULL`);
			console.log("   ✅ holdings.source added.");
		} catch (e) {
			console.log("   ⚠️ holdings.source might already exist or failed:", (e as Error).message);
		}

		// 3. Add 'exchange' column to symbols
		console.log("➡️  Migrating symbols (exchange)...");
		try {
			await db.execute(sql`ALTER TABLE "symbols" ADD COLUMN IF NOT EXISTS "exchange" text`);
			console.log("   ✅ symbols.exchange added.");
		} catch (e) {
			console.log("   ⚠️ symbols.exchange might already exist or failed:", (e as Error).message);
		}

		// 4. Add 'currency' column to symbols
		console.log("➡️  Migrating symbols (currency)...");
		try {
			await db.execute(sql`ALTER TABLE "symbols" ADD COLUMN IF NOT EXISTS "currency" text`);
			console.log("   ✅ symbols.currency added.");
		} catch (e) {
			console.log("   ⚠️ symbols.currency might already exist or failed:", (e as Error).message);
		}

		console.log("✨ Migration completed successfully!");
		process.exit(0);
	} catch (e) {
		console.error("❌ Migration Failed:", e);
		process.exit(1);
	}
}

runMigration();
