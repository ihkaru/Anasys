import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { marketData, symbols } from "@packages/db/src/schema";
import { sql } from "drizzle-orm";
import { db } from "../db";

const US_DATA_DIR = join(import.meta.dir, "../../data/us");

// Helper to convert PER to interval string
function perToInterval(per: string): string {
	const p = parseInt(per, 10);
	if (p === 60) return "1h";
	if (p === 1440) return "1d";
	if (p === 5) return "5m";
	if (p === 15) return "15m";
	if (p === 30) return "30m";
	return `${p}m`; // Fallback
}

// Convert YYYYMMDD + HHMMSS to Date object
// Note: US Market time is usually ET. Storing as UTC?
// Standardize to UTC for simplicity or assume input is local exchange time.
// Usually backtests prefer UTC.
function parseDateTime(dateStr: string, timeStr: string): Date {
	// dateStr: 20240411 (YYYYMMDD)
	// timeStr: 160000 (HHMMSS)
	const y = parseInt(dateStr.substring(0, 4), 10);
	const m = parseInt(dateStr.substring(4, 6), 10) - 1; // Month is 0-indexed
	const d = parseInt(dateStr.substring(6, 8), 10);

	const h = parseInt(timeStr.substring(0, 2), 10);
	const min = parseInt(timeStr.substring(2, 4), 10);
	const s = parseInt(timeStr.substring(4, 6), 10);

	// Construct date. Assuming the raw txt data is in UTC or intended to be read as is.
	// If it's ET, we might need offsets. For now, interpret as UTC to act consistent with previous imports.
	return new Date(Date.UTC(y, m, d, h, min, s));
}

async function walkDir(dir: string): Promise<string[]> {
	let results: string[] = [];
	const list = await readdir(dir);
	for (const file of list) {
		const filePath = join(dir, file);
		const st = await stat(filePath);
		if (st.isDirectory()) {
			results = results.concat(await walkDir(filePath));
		} else {
			if (file.endsWith(".txt") || file.endsWith(".csv")) {
				results.push(filePath);
			}
		}
	}
	return results;
}

async function main() {
	console.log(`📂 Scanning US Data Directory: ${US_DATA_DIR}...`);
	try {
		const files = await walkDir(US_DATA_DIR);
		console.log(`Found ${files.length} files to process.`);

		// CONCURRENCY CONTROL
		const CONCURRENCY = 50; // Process 50 files in parallel
		let processedCount = 0;
		const total = files.length;

		// Simple pool execution
		const processFile = async (filePath: string) => {
			// ... [Logic inside the loop moved here] ...
			// Logic to parse and insert
			try {
				const filename = filePath.split("/").pop() || "";
				const tickerRaw = filename.split(".")[0];
				const ticker = tickerRaw.toUpperCase();
				const _isEtf = filePath.toLowerCase().includes("etf");
				const type = "STOCK";

				// Symbol Upsert
				let symbolId: number;
				const [inserted] = await db
					.insert(symbols)
					.values({
						ticker,
						name: ticker,
						type: type,
						isActive: true,
						provider: "metastock_import",
					})
					.onConflictDoUpdate({
						target: symbols.ticker,
						set: { isActive: true },
					})
					.returning();

				if (inserted) symbolId = inserted.id;
				else {
					// Fallback fetch
					const [existing] = await db.select().from(symbols).where(sql`${symbols.ticker} = ${ticker}`).limit(1);
					if (!existing) return;
					symbolId = existing.id;
				}

				// Read Content
				const content = await Bun.file(filePath).text();
				const lines = content.trim().split("\n");
				if (lines.length < 2) return;

				const firstLine = lines[1].split(",");
				if (firstLine.length < 9) return;

				const per = firstLine[1];
				const interval = perToInterval(per);

				const dataValues: any[] = [];
				for (let i = 1; i < lines.length; i++) {
					const row = lines[i].split(",");
					if (row.length < 9) continue;

					const dateVal = parseDateTime(row[2], row[3]);
					const open = parseFloat(row[4]);
					const high = parseFloat(row[5]);
					const low = parseFloat(row[6]);
					const close = parseFloat(row[7]);
					const volume = parseFloat(row[8]);

					if (Number.isNaN(open)) continue;

					dataValues.push({
						symbolId,
						timestamp: dateVal,
						open,
						high,
						low,
						close,
						volume,
						interval,
					});
				}

				if (dataValues.length > 0) {
					// Insert in one transaction per file is safer/faster than chunks for small files
					// But some files are large.
					await db.transaction(async (tx) => {
						const CHUNK_SIZE = 2000;
						for (let i = 0; i < dataValues.length; i += CHUNK_SIZE) {
							const chunk = dataValues.slice(i, i + CHUNK_SIZE);
							await tx.insert(marketData).values(chunk).onConflictDoNothing().execute();
						}
					});
				}
			} catch (e) {
				console.error(`Error processing ${filePath}:`, e);
			}
			processedCount++;
			if (processedCount % 100 === 0)
				console.log(
					`[${new Date().toISOString()}] [${Math.round((processedCount / total) * 100)}%] Processed ${processedCount}/${total}`,
				);
		};

		// Executor
		const queue = [...files];
		const workers = Array(CONCURRENCY)
			.fill(null)
			.map(async () => {
				while (queue.length > 0) {
					const file = queue.shift();
					if (file) await processFile(file);
				}
			});

		await Promise.all(workers);

		console.log(`🏁 US Data Import Complete. Processed ${processedCount} files.`);
		process.exit(0);
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
}

main();
