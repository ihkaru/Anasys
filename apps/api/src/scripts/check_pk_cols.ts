import { sql } from "drizzle-orm";
import { db } from "../db";

async function checkPKCols() {
	console.log("Checking PK Columns...");
	try {
		const cols = await db.execute(sql`
            SELECT a.attname 
            FROM pg_index i 
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) 
            WHERE i.indrelid = 'market_data'::regclass AND i.indisprimary
        `);
		console.log(
			"PK Columns:",
			cols.map((c) => c.attname),
		);
	} catch (e) {
		console.log(e);
	}
	process.exit(0);
}
checkPKCols();
