import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const US_DATA_DIR = join(import.meta.dir, "../../../../data/us");
const ASSET_CLASS_FILE = join(import.meta.dir, "../../../../../../asset_classification.csv");
const OUTPUT_FILE = join(import.meta.dir, "../data/symbol_categories.csv");

async function walkDir(dir: string): Promise<string[]> {
	let results: string[] = [];
	const list = await readdir(dir);
	for (const file of list) {
		const filePath = join(dir, file);
		const st = await stat(filePath);
		if (st.isDirectory()) {
			results = results.concat(await walkDir(filePath));
		} else {
			// Keep path relative to US_DATA_DIR to know the parent folder
			results.push(filePath);
		}
	}
	return results;
}

async function main() {
	console.log("Generatng Categorization CSV...");

	// 1. Process US Data Folders
	// Folder names: "nasdaq stocks", "nyse etfs", etc.
	const filePaths = await walkDir(US_DATA_DIR);

	const tickerCats: Record<string, Set<string>> = {};

	for (const path of filePaths) {
		// Path: .../data/us/nasdaq stocks/1/aapl.us.txt
		const relPath = path.replace(`${US_DATA_DIR}/`, "");
		const folder = relPath.split("/")[0]; // "nasdaq stocks"
		const filename = path.split("/").pop() || "";
		const tickerRaw = filename.split(".")[0];
		if (!tickerRaw) continue;
		const ticker = tickerRaw.toUpperCase();

		if (!tickerCats[ticker]) tickerCats[ticker] = new Set();

		// Parse folder name
		const parts = folder.toLowerCase().split(" ");
		// parts[0] = exchange (nasdaq, nyse, etc)
		// parts[1] = type (stocks, etfs)

		if (parts[0]) tickerCats[ticker].add(parts[0].toUpperCase());
		if (parts[1]) {
			// Singularize
			const type = parts[1].replace(/s$/, "").toUpperCase(); // STOCK, ETF
			tickerCats[ticker].add(type);
		}
	}

	// 2. Process Asset Classification CSV
	// Ticker,Type,File
	try {
		const csvContent = await Bun.file(ASSET_CLASS_FILE).text();
		const lines = csvContent.trim().split("\n");
		// Skip header
		for (let i = 1; i < lines.length; i++) {
			const [t, type] = lines[i].split(",");
			if (!t || !type) continue;
			const ticker = t.toUpperCase();

			if (!tickerCats[ticker]) tickerCats[ticker] = new Set();
			tickerCats[ticker].add(type.toUpperCase());
		}
	} catch (e) {
		console.warn("Could not read asset_classification.csv", e);
	}

	// 3. Output to CSV
	// Format: Ticker,Category
	const outputLines = ["Ticker,Category"];
	for (const [ticker, cats] of Object.entries(tickerCats)) {
		for (const cat of cats) {
			outputLines.push(`${ticker},${cat}`);
		}
	}

	await Bun.write(OUTPUT_FILE, outputLines.join("\n"));
	console.log(`✅ Generated ${outputLines.length} rows in ${OUTPUT_FILE}`);
}

main();
