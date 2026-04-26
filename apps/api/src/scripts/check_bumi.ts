import { symbols } from "@packages/db/src/schema";
import { eq } from "drizzle-orm";
import { db } from "../db";

async function checkSymbol() {
	const ticker = "BUMI.JK";
	console.log(`Checking symbol: ${ticker}`);

	const result = await db.select().from(symbols).where(eq(symbols.ticker, ticker));

	if (result.length === 0) {
		console.log("Symbol not found in DB");
	} else {
		console.log("Symbol found:", JSON.stringify(result[0], null, 2));
	}
	process.exit(0);
}

checkSymbol();
