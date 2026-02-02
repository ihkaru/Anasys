/**
 * Clean Slate Script
 *
 * This script will:
 * 1. Disable compression on market_data hypertable
 * 2. Decompress all chunks (required before delete)
 * 3. Truncate all market_data
 * 4. Optionally re-enable compression with better settings
 *
 * Usage:
 *   bun run src/scripts/clean_slate.ts [--keep-symbols] [--no-recompress]
 *
 * Options:
 *   --keep-symbols    Keep symbols table, only clear market_data
 *   --no-recompress   Don't re-enable compression after cleanup
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

interface CleanSlateConfig {
	keepSymbols: boolean;
	recompress: boolean;
}

function parseArgs(): CleanSlateConfig {
	const args = process.argv.slice(2);
	return {
		keepSymbols: args.includes("--keep-symbols"),
		recompress: !args.includes("--no-recompress"),
	};
}

async function cleanSlate() {
	const config = parseArgs();

	console.log("═══════════════════════════════════════════════════════════");
	console.log("           🧹 CLEAN SLATE - Database Reset                 ");
	console.log("═══════════════════════════════════════════════════════════");
	console.log(`   Keep Symbols: ${config.keepSymbols}`);
	console.log(`   Re-compress:  ${config.recompress}`);
	console.log("═══════════════════════════════════════════════════════════\n");

	try {
		// Step 1: Check current state
		console.log("📊 Step 1: Checking current state...");
		const before = await db.execute(sql`SELECT COUNT(*) as count FROM market_data`);
		console.log(`   Current records: ${before[0]?.count}`);

		// Step 2: Disable compression policy (if exists)
		console.log("\n🔧 Step 2: Disabling compression...");
		try {
			await db.execute(sql`
                SELECT remove_compression_policy('market_data', if_exists => true)
            `);
			console.log("   ✅ Compression policy removed");
		} catch (_e: any) {
			console.log("   ⚠️  No compression policy to remove");
		}

		// Step 3: Decompress all chunks
		console.log("\n📦 Step 3: Decompressing all chunks...");
		const compressedChunks = await db.execute(sql`
            SELECT chunk_name, chunk_schema
            FROM timescaledb_information.chunks 
            WHERE hypertable_name = 'market_data' AND is_compressed = true
        `);

		console.log(`   Found ${compressedChunks.length} compressed chunks`);

		let decompressedCount = 0;
		for (const chunk of compressedChunks) {
			try {
				const fullChunkName = `${chunk.chunk_schema}.${chunk.chunk_name}`;
				await db.execute(sql`SELECT decompress_chunk(${fullChunkName}::regclass)`);
				decompressedCount++;
				if (decompressedCount % 50 === 0) {
					process.stdout.write(`\r   Decompressed: ${decompressedCount}/${compressedChunks.length}`);
				}
			} catch (_e: any) {
				// Some chunks might already be decompressed
			}
		}
		console.log(`\n   ✅ Decompressed ${decompressedCount} chunks`);

		// Step 4: Truncate market_data
		console.log("\n🗑️  Step 4: Truncating market_data...");
		await db.execute(sql`TRUNCATE TABLE market_data`);
		console.log("   ✅ market_data truncated");

		// Step 5: Optionally truncate symbols
		if (!config.keepSymbols) {
			console.log("\n🗑️  Step 5: Truncating symbols...");
			await db.execute(sql`TRUNCATE TABLE symbols CASCADE`);
			console.log("   ✅ symbols truncated");
		} else {
			console.log("\n⏭️  Step 5: Skipping symbols (--keep-symbols)");
		}

		// Step 6: Re-setup compression with better settings
		if (config.recompress) {
			console.log("\n🗜️  Step 6: Re-enabling compression with optimized settings...");

			// Disable compression first to reset
			try {
				await db.execute(sql`
                    ALTER TABLE market_data SET (
                        timescaledb.compress = false
                    )
                `);
			} catch (_e) {}

			// Enable compression with proper settings
			await db.execute(sql`
                ALTER TABLE market_data SET (
                    timescaledb.compress,
                    timescaledb.compress_segmentby = 'symbol_id, interval',
                    timescaledb.compress_orderby = 'timestamp DESC'
                )
            `);

			// Add compression policy: compress chunks older than 7 days
			await db.execute(sql`
                SELECT add_compression_policy('market_data', INTERVAL '7 days', if_not_exists => true)
            `);

			console.log("   ✅ Compression re-enabled");
			console.log("   📋 Policy: Compress chunks older than 7 days");
			console.log("   📋 Segment by: symbol_id, interval");
			console.log("   📋 Order by: timestamp DESC");
		}

		// Final summary
		console.log("\n═══════════════════════════════════════════════════════════");
		console.log("                    ✅ CLEAN SLATE COMPLETE                 ");
		console.log("═══════════════════════════════════════════════════════════");
		console.log("");
		console.log("Next steps:");
		console.log("  1. Run seeder:  bun run seed");
		console.log("  2. Or repair:   bun run repair:vip");
		console.log("");
	} catch (e) {
		console.error("\n❌ Fatal error:", e);
		process.exit(1);
	}

	process.exit(0);
}

cleanSlate();
