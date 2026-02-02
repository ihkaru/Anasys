import { symbols } from "@packages/db/src/schema";
import { isNull } from "drizzle-orm";
import { db } from "../db";
import { logoService } from "../modules/market/services/logo.service";
import { Logger } from "../utils/logger";

const logger = new Logger("PopulateLogos");

const BATCH_SIZE = 10; // Process 10 logos concurrently
const DELAY_BETWEEN_BATCHES = 500; // 500ms between batches

async function main() {
	logger.info("🎨 Starting Logo Population...");

	// Find symbols without iconUrl
	const targets = await db.select().from(symbols).where(isNull(symbols.iconUrl));

	logger.info(`Found ${targets.length} symbols needing logos.`);

	let successCount = 0;
	let failCount = 0;

	// Process in batches for faster completion
	for (let i = 0; i < targets.length; i += BATCH_SIZE) {
		const batch = targets.slice(i, i + BATCH_SIZE);
		const batchNum = Math.floor(i / BATCH_SIZE) + 1;
		const totalBatches = Math.ceil(targets.length / BATCH_SIZE);

		logger.info(`[Batch ${batchNum}/${totalBatches}] Processing ${batch.map((s) => s.ticker).join(", ")}...`);

		// Process batch concurrently
		const results = await Promise.allSettled(batch.map((sym) => logoService.ensureLogo(sym.id, sym.ticker, sym.type)));

		// Count results
		for (const result of results) {
			if (result.status === "fulfilled" && result.value) {
				successCount++;
			} else {
				failCount++;
			}
		}

		// Progress update every 100 batches
		if (batchNum % 100 === 0) {
			logger.info(
				`Progress: ${i + batch.length}/${targets.length} (${(((i + batch.length) / targets.length) * 100).toFixed(1)}%) - Success: ${successCount}, Failed: ${failCount}`,
			);
		}

		// Short delay between batches to avoid rate limiting
		await Bun.sleep(DELAY_BETWEEN_BATCHES);
	}

	logger.info(`🏁 Logo Population Complete! Success: ${successCount}, Failed: ${failCount}`);
	process.exit(0);
}

main().catch((e) => {
	logger.error("Fatal error:", e);
	process.exit(1);
});
