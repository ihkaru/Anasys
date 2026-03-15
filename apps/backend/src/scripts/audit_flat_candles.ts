import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Audit Flat Candles — Retroactive Cleanup Script
 *
 * Scans ALL stock symbols for flat (O=H=L=C) hourly candles.
 * These are typically closing auction artifacts from Yahoo Finance.
 *
 * Usage:
 *   bun run --env-file=../../.env src/scripts/audit_flat_candles.ts          # Dry run (report only)
 *   bun run --env-file=../../.env src/scripts/audit_flat_candles.ts --fix    # Delete flat candles
 */

const shouldFix = process.argv.includes("--fix");

async function auditFlatCandles() {
	console.log("🔍 Scanning for flat candles (O=H=L=C) across all stock symbols...\n");
	console.time("Audit Duration");

	// Find all flat 1h candles for STOCK symbols
	const query = sql`
		SELECT
			s.ticker,
			COUNT(*) as flat_count,
			MIN(m.timestamp) as oldest_flat,
			MAX(m.timestamp) as newest_flat
		FROM market_data m
		JOIN symbols s ON m.symbol_id = s.id
		WHERE s.type = 'STOCK'
		AND m.interval = '1h'
		AND m.open = m.high
		AND m.high = m.low
		AND m.low = m.close
		GROUP BY s.ticker
		ORDER BY flat_count DESC;
	`;

	const results = await db.execute(query);

	if (results.length === 0) {
		console.log("✅ No flat candles found. All stock data is clean.");
		console.timeEnd("Audit Duration");
		process.exit(0);
	}

	// Summary
	const totalFlat = results.reduce((sum: number, r: any) => sum + Number(r.flat_count), 0);
	console.log("Found flat candles in " + results.length + " symbols (" + totalFlat + " total):\n");
	console.table(results.slice(0, 20));

	if (results.length > 20) {
		console.log("... and " + (results.length - 20) + " more symbols");
	}

	if (shouldFix) {
		console.log("\n🗑️  Deleting flat candles...\n");

		const deleteQuery = sql`
			DELETE FROM market_data m
			USING symbols s
			WHERE m.symbol_id = s.id
			AND s.type = 'STOCK'
			AND m.interval = '1h'
			AND m.open = m.high
			AND m.high = m.low
			AND m.low = m.close;
		`;

		const deleteResult = await db.execute(deleteQuery);
		console.log("✅ Deleted " + (deleteResult as any).rowCount + " flat candles.");
		console.log("ℹ  These symbols will repopulate clean data on next chart load (auto-sync).");
	} else {
		console.log("\nℹ  This was a dry run. Use --fix to delete flat candles.");
	}

	console.timeEnd("Audit Duration");
	process.exit(0);
}

auditFlatCandles().catch((e) => {
	console.error("Audit error:", e);
	process.exit(1);
});
