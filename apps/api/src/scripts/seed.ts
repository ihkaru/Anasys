import { seed as seedCategories } from "./seeds/categories";
import { seed as seedRaw } from "./seeds/market_data_raw";
import { seed as seedUs } from "./seeds/market_data_us";
import { seed as seedpopular } from "./seeds/popular_tickers";

async function main() {
	console.log("🚀 Starting Database Seeder...");

	try {
		// Always ensure popular tickers exist (fallback/lite mode)
		console.log("0️⃣  Seeding Popular Tickers (Lite)...");
		await seedpopular();

		console.log("1️⃣  Seeding Categories & Symbol Relations...");
		await seedCategories();

		console.log("2️⃣  Seeding Raw Data (Source A)...");
		await seedRaw();

		console.log("3️⃣  Seeding US Market Data (Source B)...");
		await seedUs();

		console.log("🎉 All Seeders Completed Successfully!");
		process.exit(0);
	} catch (e) {
		console.error("❌ Seeding Failed:", e);
		process.exit(1);
	}
}

main();
