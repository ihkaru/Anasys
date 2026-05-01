import { db } from "../db";
import { symbols, backfillProgress } from "../../../../packages/db/src/schema";
import { eq } from "drizzle-orm";
import axios from "axios";

/**
 * Anasys Market Discovery Script
 * Finds diverse symbols from TradingView and adds them to the harvesting queue.
 */

interface TVSymbol {
	symbol: string;
	description: string;
	type: string;
	exchange: string;
	currency_code: string;
	country?: string;
	source_id?: string;
}

const CATEGORIES = [
	{ text: "Forex", type: "FOREX" as const },
	{ text: "Indices", type: "INDEX" as const },
	{ text: "Commodities", type: "COMMODITY" as const },
	{ text: "Gold", type: "COMMODITY" as const },
	{ text: "Silver", type: "COMMODITY" as const },
	{ text: "Oil", type: "COMMODITY" as const },
	{ text: "S&P 500", type: "INDEX" as const },
	{ text: "Nasdaq 100", type: "INDEX" as const },
	{ text: "FTSE", type: "INDEX" as const },
	{ text: "DAX", type: "INDEX" as const },
	{ text: "Nikkei", type: "INDEX" as const },
	{ text: "BTC", type: "CRYPTO" as const },
	{ text: "ETH", type: "CRYPTO" as const },
	{ text: "USDT", type: "CRYPTO" as const },
];

async function discoverSymbols() {
	console.log("🔍 Starting Market Discovery...");

	for (const cat of CATEGORIES) {
		console.log(`📡 Searching for: ${cat.text} (${cat.type})...`);

		try {
			const response = await axios.get(`https://symbol-search.tradingview.com/symbol_search/v3/?text=${cat.text}`, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Origin: "https://www.tradingview.com",
					Referer: "https://www.tradingview.com/",
				},
			});

			const tvSymbols: TVSymbol[] = response.data.symbols || [];
			console.log(`   Found ${tvSymbols.length} potential candidates.`);

			for (const tv of tvSymbols) {
				// Skip if symbol name is empty
				if (!tv.symbol) continue;

				const canonicalExchange = tv.exchange || tv.source_id || "";

				// Check if already exists in our DB
				const existing = await db.select().from(symbols).where(eq(symbols.ticker, tv.symbol)).limit(1);

				if (existing.length === 0) {
					// Add new symbol
					console.log(`   ✨ Adding new symbol: ${tv.symbol} (${tv.description})`);

					const [inserted] = await db
						.insert(symbols)
						.values({
							ticker: tv.symbol,
							name: tv.description,
							type: cat.type,
							exchange: canonicalExchange,
							currency: tv.currency_code,
							country: tv.country,
							description: tv.description,
							tradingviewSymbol: tv.symbol,
							tradingviewExchange: canonicalExchange,
							provider: "tradingview",
							isActive: true,
						})
						.returning();

					// Immediately seed backfill progress for 1d, 1h, 15m, 1m
					const intervals = ["1d", "1h", "15m", "1m"];
					const tasks = intervals.map((interval) => ({
						symbolId: inserted.id,
						interval,
						targetStartDate: new Date("2025-01-01T00:00:00Z"),
						isCompleted: false,
					}));

					await db.insert(backfillProgress).values(tasks);
					console.log(`      ✅ Seeded 4 backfill tasks for ${tv.symbol}`);
				} else {
					// Update existing symbol metadata if it's missing
					if (!existing[0].exchange || !existing[0].description) {
						await db
							.update(symbols)
							.set({
								exchange: canonicalExchange,
								description: tv.description,
								tradingviewSymbol: tv.symbol,
								tradingviewExchange: canonicalExchange,
							})
							.where(eq(symbols.id, existing[0].id));
						console.log(`      📝 Updated metadata for ${tv.symbol}`);
					}
				}
			}
		} catch (err) {
			console.error(`   ❌ Failed to discover ${cat.text}:`, err);
		}
	}

	console.log("\n🎉 Market Discovery Complete!");
	process.exit(0);
}

discoverSymbols().catch(console.error);
