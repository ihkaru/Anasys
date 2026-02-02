import { sql } from "drizzle-orm";
import { db } from "../db";

async function verifyClean() {
	console.log("🔍 Verifying BTC-USD integrity...");

	// Get BTC ID
	const btcSymbol = await db.execute(sql`SELECT id FROM symbols WHERE ticker = 'BTC-USD' LIMIT 1`);
	if (btcSymbol.length === 0) {
		console.log("❌ BTC-USD symbol not found!");
		process.exit(1);
	}
	const btcId = btcSymbol[0].id;

	// Check for any remaining anomalies
	const anomalies = await db.execute(sql`
        SELECT timestamp, close 
        FROM market_data 
        WHERE symbol_id = ${btcId} 
          AND close < 1000 
          AND timestamp > '2020-01-01'
        ORDER BY timestamp DESC
        LIMIT 5;
    `);

	if (anomalies.length === 0) {
		console.log("✅ VERIFIED: No BTC-USD prices under $1000 found after 2020.");
	} else {
		console.log("❌ FAILED: Found lingering anomalies:");
		console.table(anomalies);
	}

	process.exit(0);
}

verifyClean();
