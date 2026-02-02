/**
 * Fast Cleanup Script - Database Level
 * 
 * Uses pure SQL with increased TimescaleDB decompression limit
 * for MUCH faster bulk deletions.
 * 
 * Usage: bun run src/scripts/cleanup_fast.ts [--dry-run]
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

const isDryRun = process.argv.includes("--dry-run");

async function cleanup() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 FAST CLEANUP (Database Level) ${isDryRun ? '(DRY RUN)' : ''}`);
  console.log(`${'='.repeat(60)}\n`);

  // Temporarily increase TimescaleDB decompression limit
  console.log("⚙️  Setting TimescaleDB decompression limit to unlimited...");
  await db.execute(sql`SET timescaledb.max_tuples_decompressed_per_dml_transaction = 0`);

  let totalDeleted = 0;

  // ============================================
  // 1. Count Flat Candles Before
  // ============================================
  console.log("\n1️⃣  Flat Candles (O=H=L=C)...");
  const flatCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM market_data
    WHERE open = high AND high = low AND low = close AND open > 0
  `);
  console.log(`   Found: ${Number(flatCount[0]?.count).toLocaleString()} flat candles`);

  if (!isDryRun && Number(flatCount[0]?.count) > 0) {
    console.log(`   Deleting...`);
    const start = Date.now();
    const result = await db.execute(sql`
      DELETE FROM market_data
      WHERE open = high AND high = low AND low = close AND open > 0
    `);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const deleted = Number(result.count || flatCount[0]?.count || 0);
    console.log(`   ✅ Deleted ${deleted.toLocaleString()} records in ${elapsed}s`);
    totalDeleted += deleted;
  }

  // ============================================
  // 2. Count Zero Volume Candles Before
  // ============================================
  console.log("\n2️⃣  Zero Volume Candles (Stocks, 1h, Market Hours)...");
  const zeroCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM market_data m
    JOIN symbols s ON m.symbol_id = s.id
    WHERE s.type = 'STOCK'
      AND m.volume = 0
      AND m.interval = '1h'
      AND EXTRACT(HOUR FROM m.timestamp AT TIME ZONE 'America/New_York') BETWEEN 9 AND 16
  `);
  console.log(`   Found: ${Number(zeroCount[0]?.count).toLocaleString()} zero-volume candles`);

  if (!isDryRun && Number(zeroCount[0]?.count) > 0) {
    console.log(`   Deleting...`);
    const start = Date.now();
    const result = await db.execute(sql`
      DELETE FROM market_data m
      USING symbols s
      WHERE m.symbol_id = s.id
        AND s.type = 'STOCK'
        AND m.volume = 0
        AND m.interval = '1h'
        AND EXTRACT(HOUR FROM m.timestamp AT TIME ZONE 'America/New_York') BETWEEN 9 AND 16
    `);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const deleted = Number(result.count || zeroCount[0]?.count || 0);
    console.log(`   ✅ Deleted ${deleted.toLocaleString()} records in ${elapsed}s`);
    totalDeleted += deleted;
  }

  // ============================================
  // 3. Count Large Gaps (Report Only)
  // ============================================
  console.log("\n3️⃣  Large Price Gaps (>50%) - Report Only...");
  const gapCount = await db.execute(sql`
    WITH gaps AS (
      SELECT m.symbol_id, m.interval, m.timestamp, m.open,
             LAG(m.close) OVER (PARTITION BY m.symbol_id, m.interval ORDER BY m.timestamp) as prev_close
      FROM market_data m
      WHERE m.interval = '1h'
    )
    SELECT COUNT(*) as count FROM gaps
    WHERE prev_close > 0 AND ABS(open - prev_close) / prev_close > 0.5
  `);
  console.log(`   Found: ${Number(gapCount[0]?.count).toLocaleString()} candles with large gaps`);
  console.log(`   ⚠️  Not auto-deleted (may be legitimate). Use investigate_ticker.ts to review.`);

  // ============================================
  // SUMMARY
  // ============================================
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 CLEANUP SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  if (isDryRun) {
    console.log(`   Mode: DRY RUN (no changes made)`);
  } else {
    console.log(`   Total Records Deleted: ${totalDeleted.toLocaleString()}`);
  }
  console.log(`${'='.repeat(60)}\n`);

  process.exit(0);
}

cleanup().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
