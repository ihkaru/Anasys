import { db } from "../db";
import { symbolFinancials } from "@packages/db/src/schema";
import { sql } from "drizzle-orm";

async function count() {
	const res = await db.select({ count: sql`count(*)` }).from(symbolFinancials);
	console.log(`Enriched symbols count: ${res[0].count}`);
	process.exit(0);
}

count();
