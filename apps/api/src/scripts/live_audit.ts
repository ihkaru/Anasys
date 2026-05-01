import { db } from "../db";
import * as schema from "../../../../packages/db/src/schema";
import { desc } from "drizzle-orm";

async function liveAudit() {
	console.log("\n" + "=".repeat(120));
	console.log("💎 ANASYS INSTITUTIONAL DATA DIVERSITY AUDIT");
	console.log("=".repeat(120) + "\n");

	const tables = [
		{ name: "SYMBOLS", schema: schema.symbols, sort: schema.symbols.id },
		{ name: "MARKET DATA (OHLCV)", schema: schema.marketData, sort: schema.marketData.timestamp },
		{ name: "FINANCIALS", schema: schema.symbolFinancials, sort: schema.symbolFinancials.updatedAt },
		{ name: "EARNINGS", schema: schema.symbolEarnings, sort: schema.symbolEarnings.updatedAt },
		{ name: "ANALYST RATINGS", schema: schema.analystRatings, sort: schema.analystRatings.updatedAt },
		{ name: "INSIDER TRANSACTIONS", schema: schema.insiderTransactions, sort: schema.insiderTransactions.createdAt },
		{ name: "BACKFILL PROGRESS", schema: schema.backfillProgress, sort: schema.backfillProgress.updatedAt },
		{ name: "MACRO DATA", schema: schema.macroData, sort: schema.macroData.createdAt },
	];

	for (const t of tables) {
		console.log(`\n🔹 TABLE: ${t.name}`);
		try {
			const data = await db
				.select()
				.from(t.schema as any)
				.orderBy(desc(t.sort as any))
				.limit(3);
			if (data.length === 0) {
				console.log("   (Empty / Awaiting Ingestion)");
				continue;
			}
			// Use Console Table for visual clarity
			console.table(data);
		} catch (e: any) {
			console.log(`   ❌ Error: ${e.message}`);
		}
	}

	console.log("\n" + "=".repeat(120));
	console.log(`✅ Audit Complete. Verification Timestamp: ${new Date().toISOString()}`);
	console.log("=".repeat(120) + "\n");
	process.exit(0);
}

liveAudit().catch(console.error);
