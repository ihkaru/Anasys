import { seed as seedCategories } from "./seeds/categories";
import { seed as seedpopular } from "./seeds/popular_tickers";

async function main() {
	console.log("🚀 Starting Database Seeder...");

	try {
		// Always ensure popular tickers exist (fallback/lite mode)
		console.log("0️⃣  Seeding Popular Tickers (Lite)...");
		await seedpopular();

		console.log("1️⃣  Seeding Categories & Symbol Relations...");
		await seedCategories();

		console.log("🎉 All Seeders Completed Successfully!");
		process.exit(0);
	} catch (e) {
		console.error("❌ Seeding Failed:", e);
		process.exit(1);
	}
}

main();

