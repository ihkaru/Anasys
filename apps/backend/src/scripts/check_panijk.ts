import { sql } from "drizzle-orm";
import { db } from "../db";

async function verifyFlatCandlePattern() {
	console.log("=== Verifying Flat Candle Timestamps ===\n");

	// Check if all flat candles share the same hour (e.g. closing auction)
	const query = sql`
		SELECT 
			EXTRACT(HOUR FROM m.timestamp) as hour_utc,
			COUNT(*) as flat_count
		FROM market_data m
		JOIN symbols s ON m.symbol_id = s.id
		WHERE s.ticker = 'PANI.JK'
		AND m.interval = '1h'
		AND m.open = m.high AND m.high = m.low AND m.low = m.close
		GROUP BY EXTRACT(HOUR FROM m.timestamp)
		ORDER BY flat_count DESC;
	`;
	const results = await db.execute(query);
	console.log("Flat candle distribution by hour (UTC):");
	console.table(results);

	// Check normal candle hours for comparison
	const normalQuery = sql`
		SELECT 
			EXTRACT(HOUR FROM m.timestamp) as hour_utc,
			COUNT(*) as normal_count
		FROM market_data m
		JOIN symbols s ON m.symbol_id = s.id
		WHERE s.ticker = 'PANI.JK'
		AND m.interval = '1h'
		AND NOT (m.open = m.high AND m.high = m.low AND m.low = m.close)
		GROUP BY EXTRACT(HOUR FROM m.timestamp)
		ORDER BY hour_utc;
	`;
	const normalResults = await db.execute(normalQuery);
	console.log("\nNormal candle distribution by hour (UTC):");
	console.table(normalResults);

	// Look at specific examples - compare daily vs hourly for same date
	console.log("\n=== Compare Daily vs 1h candles for recent dates ===");
	const compareQuery = sql`
		SELECT 
			DATE(m.timestamp) as date,
			m.interval,
			EXTRACT(HOUR FROM m.timestamp) as hour_utc,
			ROUND(m.open::numeric, 2) as open,
			ROUND(m.high::numeric, 2) as high,
			ROUND(m.low::numeric, 2) as low,
			ROUND(m.close::numeric, 2) as close,
			m.volume,
			CASE WHEN m.open = m.high AND m.high = m.low AND m.low = m.close
				THEN 'FLAT' ELSE 'NORMAL' END as status
		FROM market_data m
		JOIN symbols s ON m.symbol_id = s.id
		WHERE s.ticker = 'PANI.JK'
		AND m.timestamp >= NOW() - INTERVAL '7 days'
		ORDER BY m.timestamp DESC, m.interval ASC;
	`;
	const compareResults = await db.execute(compareQuery);
	console.table(compareResults);

	process.exit(0);
}

verifyFlatCandlePattern().catch((e) => {
	console.error("Error:", e);
	process.exit(1);
});
