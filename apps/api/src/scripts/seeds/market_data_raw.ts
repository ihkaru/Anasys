import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { marketData, symbols } from "@packages/db/src/schema";
import { eq } from "drizzle-orm";
import { db } from "../../db";

const RAW_DIR = join(import.meta.dir, "../../../data/raw");

export async function seed() {
	if (!existsSync(RAW_DIR)) {
		console.warn(`⚠️  [Source A] Skipping: Directory ${RAW_DIR} not found.`);
		return;
	}
	console.log(`📂 [Source A] Scanning ${RAW_DIR}...`);
	try {
		const files = await readdir(RAW_DIR);
		const csvFiles = files.filter((f) => f.endsWith(".csv"));
		console.log(`Found ${csvFiles.length} CSV files.`);

		// Process sequentially to be safe with DB connections
		for (const file of csvFiles) {
			// Parse filename: TICKER_INTERVAL.csv
			// Example: AAPL_1h.csv, BTC-USD_1h.csv
			const match = file.match(/^(.*)_(.*)\.csv$/);
			if (!match) {
				console.warn(`Skipping invalid filename: ${file}`);
				continue;
			}

			const [_, ticker, interval] = match;
			// Guess type
			const type =
				ticker.includes("-") && (ticker.includes("USD") || ticker.includes("BTC") || ticker.includes("ETH"))
					? "CRYPTO"
					: "STOCK";

			console.log(`Processing ${ticker} (${interval}) - ${type} from ${file}`);

			// Ensure Symbol
			let symbolId: number;

			// Try insert (upsert)
			// Note: Postgres returning on conflict do update works comfortably
			const [inserted] = await db
				.insert(symbols)
				.values({
					ticker,
					name: ticker,
					type: type as any,
					isActive: true,
					provider: type === "CRYPTO" ? "ccxt" : "yahoo",
				})
				.onConflictDoUpdate({
					target: symbols.ticker,
					set: { isActive: true }, // Update dummy field to ensure return
				})
				.returning();

			if (inserted) {
				symbolId = inserted.id;
			} else {
				// Should not happen with onConflictDoUpdate, but fallback
				const [_existing] = await db.select().from(symbols).where(eq(symbols.ticker, ticker)).limit(1); // Wait, where condition syntax?
				// drizzle where accepts expression directly
				// Actually if returning failed, fetch it properly
				// But Drizzle Returning with OnConflictDoUpdate works reliably in recent Postgres
				console.error(`Failed to get symbol ID for ${ticker}`);
				continue;
			}

			// Read File
			const content = await Bun.file(join(RAW_DIR, file)).text();
			const lines = content.trim().split("\n");
			if (lines.length < 2) continue; // Empty or just header

			const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
			// Normalize header: Datetime -> datetime, open -> open, etc.

			const colMap: Record<string, number> = {};
			header.forEach((h, i) => (colMap[h] = i));

			// Required cols (allow date or datetime)
			const requiredBase = ["open", "high", "low", "close", "volume"];
			const hasDate = colMap.datetime !== undefined || colMap.date !== undefined;

			if (!hasDate || !requiredBase.every((r) => colMap[r] !== undefined)) {
				console.error(`Missing columns in ${file}. Header: ${header.join(",")}`);
				continue;
			}

			const dataValues = [];

			for (let i = 1; i < lines.length; i++) {
				const row = lines[i].split(",");
				if (row.length < header.length) continue;

				const dateStr = row[colMap.datetime] || row[colMap.date];
				const open = parseFloat(row[colMap.open]);
				const high = parseFloat(row[colMap.high]);
				const low = parseFloat(row[colMap.low]);
				const close = parseFloat(row[colMap.close]);
				const volume = parseFloat(row[colMap.volume]);

				if (Number.isNaN(open) || Number.isNaN(close) || !dateStr) continue;

				dataValues.push({
					symbolId: symbolId,
					timestamp: new Date(dateStr),
					open,
					high,
					low,
					close,
					volume,
					interval: interval,
				});
			}

			if (dataValues.length > 0) {
				// Batch insert
				const CHUNK_SIZE = 1000;
				for (let i = 0; i < dataValues.length; i += CHUNK_SIZE) {
					const chunk = dataValues.slice(i, i + CHUNK_SIZE);
					await db.insert(marketData).values(chunk).onConflictDoNothing().execute();
				}
				console.log(`✅ Imported ${dataValues.length} rows for ${ticker}`);
			}
		}

		console.log("🏁 Import complete");
	} catch (e) {
		console.error("Critical error:", e);
		throw e;
	}
}
