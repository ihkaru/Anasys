import { marketService } from "./apps/backend/src/modules/market/market.service";

async function run() {
	try {
		console.log("Fetching AAPL history...");
		const data = await marketService.getOHLCV("AAPL", "1d", 100, undefined, "YAHOO");
		console.log(`Received ${data.length} candles.`);
		if (data.length > 0) {
			console.log("Sample candle:", data[0]);
		}
	} catch (e) {
		console.error("Test failed", e);
	}
	process.exit(0);
}

run();
