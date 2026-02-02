import { symbols } from "@packages/db/src/schema";
import { db } from "../../db";

const POPULAR_TICKERS = [
	// Tech / US Large Cap
	"AAPL",
	"MSFT",
	"GOOGL",
	"AMZN",
	"NVDA",
	"TSLA",
	"META",
	"BRK.B",
	"LLY",
	"V",
	"JPM",
	"XOM",
	"WMT",
	"MA",
	"UNH",
	"PG",
	"JNJ",
	"AVGO",
	"HD",
	"CVX",
	"MRK",
	"ABBV",
	"COST",
	"PEP",
	"KO",
	"ADBE",
	"AMD",
	"NFLX",
	"CRM",
	"INTC",

	// Crypto
	"BTC-USD",
	"ETH-USD",
	"SOL-USD",
	"BNB-USD",
	"XRP-USD",
	"DOGE-USD",
	"ADA-USD",

	// ETFs
	"SPY",
	"QQQ",
	"IWM",
	"DIA",
	"VTI",
	"VOO",
	"TLT",
	"GLD",
	"SLV",
];

export async function seed() {
	console.log("🌱 Seeding Popular Tickers (Lite Mode)...");

	let count = 0;
	for (const ticker of POPULAR_TICKERS) {
		// Determine type roughly
		let type = "STOCK";
		if (ticker.includes("-USD")) type = "CRYPTO";

		await db
			.insert(symbols)
			.values({
				ticker,
				name: ticker,
				type: type as any,
				isActive: true,
				provider: "lite_seed",
			})
			.onConflictDoNothing()
			.execute();
		count++;
	}

	console.log(`✅ Seeded ${count} popular tickers.`);
}
