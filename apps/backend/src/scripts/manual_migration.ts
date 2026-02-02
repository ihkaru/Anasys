import { sql } from "drizzle-orm";
import { db } from "../db";

async function migrate() {
	console.log("Starting Manual Migration...");

	try {
		// 1. Create Enum (Use exception catch if exists)
		try {
			await db.execute(sql`CREATE TYPE "public"."data_source" AS ENUM('YAHOO', 'TRADINGVIEW', 'CCXT')`);
			console.log("Enum created.");
		} catch (e: any) {
			console.log("Enum likely 'data_source' already exists:", e.message);
		}

		// 2. Add Column (Safe if not exists)
		try {
			await db.execute(sql`ALTER TABLE "market_data" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'YAHOO' NOT NULL`);
			console.log("Column 'source' added.");
		} catch (e: any) {
			console.log("Column add failed:", e.message);
		}

		// 3. Drop Old PK
		try {
			await db.execute(
				sql`ALTER TABLE "market_data" DROP CONSTRAINT IF EXISTS "market_data_symbol_id_timestamp_interval_pk"`,
			);
			console.log("Old PK dropped.");
		} catch (e: any) {
			console.log("Drop PK failed (maybe already dropped):", e.message);
		}

		// 4. Add New PK
		try {
			console.log("Adding New PK...");
			await db.execute(
				sql`ALTER TABLE "market_data" ADD CONSTRAINT "market_data_symbol_id_timestamp_interval_source_pk" PRIMARY KEY("symbol_id","timestamp","interval","source")`,
			);
			console.log("New PK added.");
		} catch (e: any) {
			console.dir(e); // Print full error structure
			console.log("Add New PK failed:", e.message);
		}

		console.log("Migration Complete.");
		process.exit(0);
	} catch (e) {
		console.error("Migration Error:", e);
		process.exit(1);
	}
}

migrate();
