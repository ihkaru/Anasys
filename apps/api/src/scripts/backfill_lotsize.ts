import { db } from "../db";
import { symbols } from "@packages/db/src/schema";
import { like, and, ne, sql } from "drizzle-orm";

async function backfillLotSize() {
	console.log("🛠️  Starting lotSize backfill for IDX symbols...");

	// 1. Dry run
	const targets = await db
		.select()
		.from(symbols)
		.where(and(like(symbols.ticker, "%.JK"), ne(symbols.lotSize, 100)));

	if (targets.length === 0) {
		console.log("✅ All IDX symbols already normalized. Nothing to do.");
		return;
	}

	console.log(`Found ${targets.length} symbols to update:`);
	console.table(targets.map((t) => ({ ticker: t.ticker, current: t.lotSize })));

	// 2. Perform Update
	const result = await db
		.update(symbols)
		.set({ lotSize: 100 })
		.where(and(like(symbols.ticker, "%.JK"), ne(symbols.lotSize, 100)));

	console.log("🎊 SUCCESS: lotSize backfill complete.");
}

backfillLotSize()
	.catch(console.error)
	.finally(() => process.exit());
