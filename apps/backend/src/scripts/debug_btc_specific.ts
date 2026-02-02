import { sql } from "drizzle-orm";
import { db } from "../db";

async function debugSpecificCandle() {
	console.log("🔍 Debugging BTC-USD specific candle...");

	const btcSymbol = await db.execute(sql`SELECT id FROM symbols WHERE ticker = 'BTC-USD' LIMIT 1`);
	const btcId = btcSymbol[0].id; // 1

	// Check specific timestamp range around 2025-11-11
	const candles = await db.execute(sql`
        SELECT timestamp, close, open, high, low, interval 
        FROM market_data 
        WHERE symbol_id = ${btcId} 
          AND timestamp BETWEEN '2025-11-10 00:00:00' AND '2025-11-12 00:00:00'
        ORDER BY timestamp ASC;
    `);

	console.table(candles);
	process.exit(0);
}

debugSpecificCandle();
