import { marketService } from "./src/modules/market/market.service";

async function test() {
	const ticker = "GOOGL";
	console.log(`--- Testing enrichment for ${ticker} ---`);
	await marketService.getFinancials(ticker);
	console.log("⏳ Waiting 5s...");
	await new Promise((r) => setTimeout(r, 5000));
	process.exit(0);
}
test();
