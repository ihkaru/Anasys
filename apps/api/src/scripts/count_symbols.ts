import { db } from "../db";
import { symbols } from "@packages/db/src/schema";
import { sql } from "drizzle-orm";

async function count() {
	const res = await db.select({ count: sql`count(*)` }).from(symbols);
	console.log(`Total symbols: ${res[0].count}`);
	process.exit(0);
}

count();
