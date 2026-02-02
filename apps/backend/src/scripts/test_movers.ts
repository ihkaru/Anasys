import { marketService } from "../modules/market/market.service";

console.log("Testing MoversService...");

try {
	const movers = await marketService.getTopMovers(5);
	console.log("Result:", JSON.stringify(movers, null, 2));
} catch (e) {
	console.error("Test Failed:", e);
}

process.exit(0);
