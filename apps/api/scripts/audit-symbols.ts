import { db } from "../src/db";
import { symbols } from "@packages/db/src/schema";
import { eq, isNull, or, and } from "drizzle-orm";
import { Logger } from "../src/utils/logger";

const logger = new Logger("SymbolAudit");

/**
 * Anasys Symbol Audit & Repair Script
 * Resolves Yahoo Finance suffixes to TradingView Exchange/Symbol pairs
 */
async function runAudit() {
	logger.info("🚀 Starting Symbol Mapping Audit...");

	const targets = await db
		.select()
		.from(symbols)
		.where(or(isNull(symbols.tradingviewSymbol), isNull(symbols.tradingviewExchange)));

	logger.info(`Found ${targets.length} symbols needing mapping repair.`);

	let repaired = 0;

	for (const sym of targets) {
		let tvExchange: string | null = null;
		let tvSymbol: string = sym.ticker;

		const ticker = sym.ticker.toUpperCase();

		// Mapping Logic
		if (ticker.endsWith(".JK")) {
			tvExchange = "IDX";
			tvSymbol = ticker.replace(".JK", "");
		} else if (ticker.endsWith(".HK")) {
			tvExchange = "HKEX";
			tvSymbol = ticker.replace(".HK", "");
		} else if (ticker.endsWith(".L")) {
			tvExchange = "LSE";
			tvSymbol = ticker.replace(".L", "");
		} else if (ticker.endsWith(".SS")) {
			tvExchange = "SSE";
			tvSymbol = ticker.replace(".SS", "");
		} else if (ticker.endsWith(".SZ")) {
			tvExchange = "SZSE";
			tvSymbol = ticker.replace(".SZ", "");
		} else if (ticker.endsWith("-USD") || ticker.endsWith("-USDT")) {
			tvExchange = "BINANCE";
			tvSymbol = ticker.replace("-", "");
		} else if (!ticker.includes(".")) {
			// US Stocks - Try to guess from sym.exchange if present
			const knownExchanges = ["NASDAQ", "NYSE", "AMEX", "ARCA"];
			tvExchange = knownExchanges.includes(sym.exchange || "") ? sym.exchange : "NASDAQ";
			tvSymbol = ticker;
		}

		if (tvExchange) {
			await db
				.update(symbols)
				.set({
					tradingviewSymbol: tvSymbol,
					tradingviewExchange: tvExchange,
				})
				.where(eq(symbols.id, sym.id));

			logger.info(`✅ Repaired ${sym.ticker} -> ${tvExchange}:${tvSymbol}`);
			repaired++;
		}
	}

	logger.info(`Audit complete. Repaired ${repaired} symbols.`);
	process.exit(0);
}

runAudit().catch((err) => {
	logger.error("Audit failed", err);
	process.exit(1);
});
