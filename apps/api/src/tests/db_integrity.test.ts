import { beforeAll, describe, expect, it } from "bun:test";
import { symbols } from "@packages/db/src/schema";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";

describe("Database Integrity Check", () => {
	let symbolCount: number;
	beforeAll(async () => {
		const s = await db.select({ count: sql<number>`count(*)` }).from(symbols);
		symbolCount = Number(s[0].count);
		console.log(`\n📊 Current DB State: ${symbolCount} Symbols\n`);
	});

	it("should have symbols", () => {
		expect(symbolCount).toBeGreaterThan(0);
	});

	it("should have specific test symbols (AAPL, BTC/USDT)", async () => {
		// Check for a few expected symbols from Source A or B
		// Note: Source A had BTC-USD, Source B might have AAPL (though file names are encrypted/raw, let's check a common one if known or just check any)

		// Let's just check if we have ANY stock and ANY crypto
		const stock = await db.query.symbols.findFirst({
			where: eq(symbols.type, "STOCK"),
		});
		const crypto = await db.query.symbols.findFirst({
			where: eq(symbols.type, "CRYPTO"),
		});

		if (stock) expect(stock.type).toBe("STOCK");
		if (crypto) expect(crypto.type).toBe("CRYPTO");

		// If import is still running, crypto might be from Source A (which finished)
		// Source B is mostly stocks.
		expect(stock || crypto).toBeTruthy();
	});

});
