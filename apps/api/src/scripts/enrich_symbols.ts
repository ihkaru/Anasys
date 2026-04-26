/**
 * Enrich Symbols Script
 * Fetches company metadata from Yahoo Finance (quoteSummary) and updates the database.
 *
 * Usage: bun run src/scripts/enrich_symbols.ts [--batch=50] [--delay=1000]
 */

import { symbols } from "@packages/db/src/schema";
import { eq, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { Logger } from "../utils/logger";
import { marketService } from "../modules/market/market.service";

const logger = new Logger("EnrichSymbols");

interface EnrichmentResult {
	ticker: string;
	success: boolean;
	error?: string;
}

async function enrichSymbol(ticker: string): Promise<EnrichmentResult> {
	try {
		await marketService.enrichSymbol(ticker);
		return { ticker, success: true };
	} catch (error: any) {
		// Handle rate limiting
		if (error?.message?.includes("Too Many Requests") || error?.response?.status === 429) {
			logger.warn(`Rate limited on ${ticker}. Will retry later.`);
			return { ticker, success: false, error: "rate_limited" };
		}

		logger.warn(`Could not enrich ${ticker}: ${error?.message || "Unknown error"}`);
		return { ticker, success: false, error: error?.message };
	}
}

async function main() {
	const args = process.argv.slice(2);

	// Parse arguments
	let batchSize = 50;
	let delayMs = 1500; // 1.5 second delay between requests to avoid rate limiting

	for (const arg of args) {
		if (arg.startsWith("--batch=")) {
			batchSize = parseInt(arg.split("=")[1], 10);
		}
		if (arg.startsWith("--delay=")) {
			delayMs = parseInt(arg.split("=")[1], 10);
		}
	}

	logger.info(`Starting symbol enrichment (batch=${batchSize}, delay=${delayMs}ms)`);

	const pendingSymbols = await db.select().from(symbols).where(eq(symbols.ticker, "GC=F")).limit(batchSize);

	logger.info(`Found ${pendingSymbols.length} symbols to enrich`);

	if (pendingSymbols.length === 0) {
		logger.info("All symbols are already enriched!");
		return;
	}

	let successCount = 0;
	let failCount = 0;
	let rateLimited = false;

	for (const symbol of pendingSymbols) {
		if (rateLimited) {
			logger.warn("Stopping due to rate limiting. Run again later.");
			break;
		}

		const result = await enrichSymbol(symbol.ticker);

		if (result.success) {
			successCount++;
		} else {
			failCount++;
			if (result.error === "rate_limited") {
				rateLimited = true;
			}
		}

		// Delay between requests
		if (!rateLimited) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	logger.info("=".repeat(50));
	logger.info(`Enrichment complete: ${successCount} success, ${failCount} failed`);
	logger.info(`Remaining: ${pendingSymbols.length - successCount - (rateLimited ? 1 : 0)} to process`);
}

main()
	.then(() => {
		logger.info("Done.");
		process.exit(0);
	})
	.catch((err) => {
		logger.error("Fatal error", err);
		process.exit(1);
	});
