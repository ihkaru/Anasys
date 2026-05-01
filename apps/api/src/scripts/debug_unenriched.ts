import { db } from "../db";
import { symbols, symbolFinancials } from "@packages/db/src/schema";
import { eq, isNull, sql } from "drizzle-orm";

async function check() {
	const unenrichedSymbols = await db
		.select({ id: symbols.id, ticker: symbols.ticker, type: symbols.type })
		.from(symbols)
		.leftJoin(symbolFinancials, eq(symbolFinancials.symbolId, symbols.id))
		.where(isNull(symbolFinancials.symbolId))
		.orderBy(sql`RANDOM()`)
		.limit(20);

	console.log(`Found ${unenrichedSymbols.length} unenriched symbols.`);
	if (unenrichedSymbols.length > 0) {
		console.log(
			"Samples:",
			unenrichedSymbols.slice(0, 5).map((s) => s.ticker),
		);
	}
	process.exit(0);
}

check();
