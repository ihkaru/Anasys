/**
 * Cleanup Anomalies Script
 * 
 * Automatically detects and removes problematic market data:
 * - Zero volume candles (during market hours)
 * - Flat candles (O=H=L=C placeholder data)
 * - Extreme outliers (>50% gap from previous close)
 * 
 * Usage: bun run src/scripts/cleanup_anomalies.ts [--dry-run]
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

const isDryRun = process.argv.includes("--dry-run");

async function cleanup() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧹 CLEANUP ANOMALIES ${isDryRun ? '(DRY RUN)' : ''}`);
  console.log(`${'='.repeat(60)}\n`);

  let totalDeleted = 0;

  // ============================================
  // 1. Remove Flat Candles (O=H=L=C)
  // ============================================
  console.log("1️⃣  Detecting Flat Candles (O=H=L=C)...");
  
  const flatCandles = await db.execute(sql`
    SELECT s.ticker, s.id as symbol_id, m.interval, COUNT(*) as count
    FROM market_data m
    JOIN symbols s ON m.symbol_id = s.id
    WHERE m.open = m.high AND m.high = m.low AND m.low = m.close
      AND m.open > 0
    GROUP BY s.ticker, s.id, m.interval
    HAVING COUNT(*) > 5
    ORDER BY count DESC
  `);

  if (flatCandles.length > 0) {
    console.log(`   Found ${flatCandles.length} symbols with flat candles:`);
    flatCandles.slice(0, 10).forEach((r: any) => {
      console.log(`      ${r.ticker} (${r.interval}): ${r.count}`);
    });

    if (!isDryRun) {
      let deletedFlat = 0;
      console.log(`   Deleting flat candles in batches...`);
      for (const row of flatCandles) {
        const r = row as any;
        await db.execute(sql`
          DELETE FROM market_data
          WHERE symbol_id = ${r.symbol_id}
            AND interval = ${r.interval}
            AND open = high AND high = low AND low = close
            AND open > 0
        `);
        deletedFlat += Number(r.count);
        if (flatCandles.indexOf(row) % 100 === 0) {
          console.log(`      Progress: ${flatCandles.indexOf(row) + 1}/${flatCandles.length} symbols...`);
        }
      }
      console.log(`   ✅ Deleted ~${deletedFlat.toLocaleString()} flat candles`);
      totalDeleted += deletedFlat;
    }
  } else {
    console.log("   ✅ No flat candles found");
  }
  console.log();

  // ============================================
  // 2. Remove Zero Volume Candles (Stocks Only)
  // ============================================
  console.log("2️⃣  Detecting Zero Volume Candles (Stocks, Market Hours)...");
  
  const zeroVolume = await db.execute(sql`
    SELECT s.ticker, s.id as symbol_id, m.interval, COUNT(*) as count
    FROM market_data m
    JOIN symbols s ON m.symbol_id = s.id
    WHERE s.type = 'STOCK'
      AND m.volume = 0
      AND m.interval = '1h'
      AND EXTRACT(HOUR FROM m.timestamp AT TIME ZONE 'America/New_York') BETWEEN 9 AND 16
    GROUP BY s.ticker, s.id, m.interval
    ORDER BY count DESC
  `);

  if (zeroVolume.length > 0) {
    console.log(`   Found ${zeroVolume.length} stocks with zero-volume candles:`);
    zeroVolume.slice(0, 10).forEach((r: any) => {
      console.log(`      ${r.ticker} (${r.interval}): ${r.count}`);
    });

    if (!isDryRun) {
      let deletedZero = 0;
      console.log(`   Deleting zero-volume candles in batches...`);
      for (const row of zeroVolume) {
        const r = row as any;
        await db.execute(sql`
          DELETE FROM market_data
          WHERE symbol_id = ${r.symbol_id}
            AND interval = ${r.interval}
            AND volume = 0
            AND EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') BETWEEN 9 AND 16
        `);
        deletedZero += Number(r.count);
      }
      console.log(`   ✅ Deleted ~${deletedZero.toLocaleString()} zero-volume candles`);
      totalDeleted += deletedZero;
    }
  } else {
    console.log("   ✅ No zero-volume candles found during market hours");
  }
  console.log();

  // ============================================
  // 3. Detect Large Gaps (>50%)
  // ============================================
  console.log("3️⃣  Detecting Large Price Gaps (>50%)...");
  
  const largeGaps = await db.execute(sql`
    WITH gaps AS (
      SELECT 
        s.ticker, s.id as symbol_id, m.interval, m.timestamp, m.open, m.close,
        LAG(m.close) OVER (PARTITION BY m.symbol_id, m.interval ORDER BY m.timestamp) as prev_close,
        ABS(m.open - LAG(m.close) OVER (PARTITION BY m.symbol_id, m.interval ORDER BY m.timestamp)) 
            / NULLIF(LAG(m.close) OVER (PARTITION BY m.symbol_id, m.interval ORDER BY m.timestamp), 0) as gap_ratio
      FROM market_data m
      JOIN symbols s ON m.symbol_id = s.id
      WHERE m.interval = '1h'
    )
    SELECT ticker, symbol_id, interval, timestamp, open, prev_close,
           ROUND((gap_ratio * 100)::numeric, 2) as gap_pct
    FROM gaps
    WHERE gap_ratio > 0.5
    ORDER BY gap_ratio DESC
    LIMIT 50
  `);

  if (largeGaps.length > 0) {
    console.log(`   Found ${largeGaps.length} candles with large gaps:`);
    largeGaps.slice(0, 10).forEach((r: any) => {
      console.log(`      ${r.ticker} @ ${r.timestamp}: ${r.gap_pct}% gap (prev: ${r.prev_close}, open: ${r.open})`);
    });
    console.log(`   ⚠️  Large gaps not auto-deleted (may be legitimate). Review manually.`);
  } else {
    console.log("   ✅ No large price gaps found");
  }
  console.log();

  // ============================================
  // SUMMARY
  // ============================================
  console.log(`${'='.repeat(60)}`);
  console.log(`📋 CLEANUP SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  if (isDryRun) {
    console.log(`   Mode: DRY RUN (no changes made)`);
    console.log(`   Re-run without --dry-run to delete anomalies.`);
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
