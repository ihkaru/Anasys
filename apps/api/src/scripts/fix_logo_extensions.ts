import { readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { symbols } from "@packages/db/src/schema";
import { eq } from "drizzle-orm";
import { db } from "../db";

// Configuration
const PUBLIC_DIR = join(process.cwd(), "public/logos");

async function fixLogoExtensions() {
	console.log(`🔍 Scanning logos in: ${PUBLIC_DIR}`);

	try {
		const files = await readdir(PUBLIC_DIR);
		const pngFiles = files.filter((f) => f.endsWith(".png"));

		console.log(`Found ${pngFiles.length} PNG files. Checking contents...`);

		let fixedCount = 0;
		let pngCount = 0;
		let errorCount = 0;

		for (const file of pngFiles) {
			const filePath = join(PUBLIC_DIR, file);

			try {
				// Read first few bytes to detect signature
				const fileRef = Bun.file(filePath);
				const text = await fileRef.text(); // Read as text first

				let isSvg = false;

				// Simple SVG detection
				if (text.trim().startsWith("<svg") || (text.includes("<svg") && text.includes("http://www.w3.org/2000/svg"))) {
					isSvg = true;
				}

				if (isSvg) {
					// It's an SVG masquerading as PNG!
					const newFileName = file.replace(".png", ".svg");
					const newFilePath = join(PUBLIC_DIR, newFileName);

					// 1. Rename file
					await rename(filePath, newFilePath);

					// 2. Update DB
					// Ticker is derived from filename (e.g. TSM.png -> TSM)
					const _ticker = file.replace(".png", "").replace("_", "."); // Handle sanitized tickers if needed

					// We need to find the symbol ID first or update by iconUrl match
					// Let's search by the OLD iconUrl path
					const oldDbPath = `/public/logos/${file}`;
					const newDbPath = `/public/logos/${newFileName}`;

					await db.update(symbols).set({ iconUrl: newDbPath }).where(eq(symbols.iconUrl, oldDbPath));

					process.stdout.write("."); // Progress indicator
					fixedCount++;
				} else {
					pngCount++;
				}
			} catch (err) {
				console.error(`\nError processing ${file}:`, err);
				errorCount++;
			}
		}

		console.log("\n\n✅ Repair Complete!");
		console.log(`- Fixed (Renamed to .svg): ${fixedCount}`);
		console.log(`- Valid PNGs kept: ${pngCount}`);
		console.log(`- Errors: ${errorCount}`);
	} catch (e) {
		console.error("Failed to scan directory:", e);
	}
}

// Run headers
console.log("=================================");
console.log("   LOGO EXTENSION FIXER MIGRATION");
console.log("=================================");
fixLogoExtensions()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
