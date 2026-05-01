import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { corporateActions, insiderTransactions, symbols, symbolFinancials } from "../../../../packages/db/src/schema";
import { marketService } from "../modules/market/market.service";

async function main() {
	console.log("🔍 Checking Institutional Data...");

	// 1. Pick a high-profile ticker (e.g., AAPL or TSLA)
	const ticker = "AAPL";
	console.log(`\n--- Testing Enrichment for ${ticker} ---`);

	// Trigger enrichment
	await marketService.getFinancials(ticker);

	// Wait a bit for async tasks
	console.log("⏳ Waiting for async enrichment (5s)...");
	await new Promise((r) => setTimeout(r, 5000));

	// 2. Check Corporate Actions
	const actions = await db
		.select()
		.from(corporateActions)
		.innerJoin(symbols, eq(corporateActions.symbolId, symbols.id))
		.where(eq(symbols.ticker, ticker))
		.limit(5);

	console.log(`\n📈 Corporate Actions Found: ${actions.length}`);
	actions.forEach((a) => {
		console.log(
			`  - ${a.corporate_actions.type}: ${a.corporate_actions.amount || a.corporate_actions.ratio} on ${a.corporate_actions.executionDate}`,
		);
	});

	// 3. Check Insider Transactions
	const insiders = await db
		.select()
		.from(insiderTransactions)
		.innerJoin(symbols, eq(insiderTransactions.symbolId, symbols.id))
		.where(eq(symbols.ticker, ticker))
		.limit(5);

	console.log(`\n👤 Insider Transactions Found: ${insiders.length}`);
	insiders.forEach((i) => {
		console.log(
			`  - ${i.insider_transactions.insiderName} (${i.insider_transactions.position}): ${i.insider_transactions.transactionType} ${i.insider_transactions.shares} shares`,
		);
	});

	// 4. Check Global Stats
	console.log("\n--- Global Database Stats ---");
	const tables = ["symbols", "symbol_financials", "corporate_actions", "insider_transactions"];
	for (const table of tables) {
		const res = await db.execute(sql.raw(`SELECT count(*) FROM ${table}`));
		console.log(`${table.padEnd(20)}: ${res[0].count}`);
	}

	process.exit(0);
}

main().catch(console.error);
