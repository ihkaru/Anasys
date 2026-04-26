import { marketData, symbols } from "@packages/db/src/schema";
import { desc, eq } from "drizzle-orm";
import { db } from "./src/db";

const [s] = await db.select().from(symbols).where(eq(symbols.ticker, "MU"));
if (s) {
	const data = await db
		.select()
		.from(marketData)
		.where(eq(marketData.symbolId, s.id))
		.orderBy(desc(marketData.timestamp))
		.limit(1);
	console.log("Latest data:", data);
} else {
	console.log("Symbol MU not found");
}
process.exit(0);
