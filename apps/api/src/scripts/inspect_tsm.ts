import { sql } from "drizzle-orm";
import { db } from "../db";

async function inspectTSM() {
	console.log("🔍 Inspecting TSM Data...");

	// Get Symbol ID
	const symbolResult = await db.execute(sql`SELECT id FROM symbols WHERE ticker = 'TSM'`);
	if (symbolResult.length === 0) {
		console.error("❌ TSM symbol not found in DB");
		return;
	}
	const symbolId = symbolResult[0].id;
	console.log(`✅ TSM Symbol ID: ${symbolId}`);

	// Get Recent Data
	const data = await db.execute(sql`
        SELECT * FROM market_data 
        WHERE symbol_id = ${symbolId} AND interval = '1d'
        ORDER BY timestamp DESC 
        LIMIT 10
    `);

	console.table(data);

	process.exit(0);
}

inspectTSM();
