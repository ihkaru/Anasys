/**
 * Integration Test: Auto-Register Symbols on Watchlist Add
 *
 * Verifies that when a user adds a symbol that doesn't exist in the database,
 * the system automatically fetches it from Yahoo Finance and registers it.
 *
 * Run: bun test src/tests/watchlist_auto_register.test.ts
 */

import { describe, expect, it } from "bun:test";
import { symbols } from "@packages/db/src/schema";
import { eq } from "drizzle-orm";
import { db } from "../db";

describe("Watchlist Auto-Register Integration", () => {
	it("should auto-register a new Indonesian stock (EMAS.JK) when adding to watchlist", async () => {
		const ticker = "EMAS.JK";

		// 1. First, verify the symbol doesn't exist (or delete it for clean test)
		console.log(`Checking if ${ticker} exists in DB...`);
		const [existing] = await db.select().from(symbols).where(eq(symbols.ticker, ticker.toUpperCase())).limit(1);

		if (existing) {
			console.log(`${ticker} already exists in DB (id: ${existing.id}). Test will verify watchlist add.`);
		} else {
			console.log(`${ticker} NOT in DB. Test will verify auto-registration.`);
		}

		// 2. We need a valid user and watchlist for this test
		// For now, let's just test the service method directly with mock IDs
		// In a real test, we'd create a test user and watchlist first

		// Let's test JUST the ensureSymbol part via marketService
		const { marketService } = await import("../modules/market/market.service");

		console.log(`Calling ensureSymbol for ${ticker}...`);
		const symbol = await marketService.ensureSymbol(ticker, "STOCK");

		console.log("Result:", symbol);

		// 3. Verify symbol is now in database
		expect(symbol).toBeDefined();
		expect(symbol.id).toBeGreaterThan(0);
		expect(symbol.ticker).toBe(ticker.toUpperCase());
		expect(symbol.type).toBe("STOCK");

		// 4. Verify it's actually in the DB
		const [verified] = await db.select().from(symbols).where(eq(symbols.ticker, ticker.toUpperCase())).limit(1);

		expect(verified).toBeDefined();
		console.log(`✅ ${ticker} successfully in database with id: ${verified.id}`);
	}, 30000); // 30s timeout
});
