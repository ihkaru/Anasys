import { marketService } from "../modules/market/market.service";

const symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "BTC-USD", "ETH-USD"];
for (const s of symbols) {
	try {
		await marketService.syncSymbolData(s, s.includes("-USD") ? "CRYPTO" : "STOCK", "1d");
		console.log("Synced", s);
	} catch (e) {
		console.error("Failed", s, e);
	}
}
process.exit(0);
