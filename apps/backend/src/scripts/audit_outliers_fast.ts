/**
 * Fast Global Outlier Audit - Database Level
 * 
 * Detects and removes flash crashes/pumps using pure SQL.
 * Much faster than per-symbol iteration.
 * 
 * Usage: bun run src/scripts/audit_outliers_fast.ts [--dry-run]
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { Logger } from "../utils/logger";

const logger = new Logger('AuditOutliersFast');
const isDryRun = process.argv.includes("--dry-run");

async function auditOutliersFast() {
  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`🚀 FAST OUTLIER AUDIT (Database Level) ${isDryRun ? '(DRY RUN)' : ''}`);
  logger.info(`${'='.repeat(60)}\n`);

  const start = performance.now();

  // Temporarily increase TimescaleDB decompression limit
  logger.info("⚙️  Setting TimescaleDB decompression limit to unlimited...");
  await db.execute(sql`SET timescaledb.max_tuples_decompressed_per_dml_transaction = 0`);

  // ============================================
  // 1. Count Flash Crashes
  // ============================================
  logger.info("\n1️⃣  Detecting Flash Crashes (>80% drop then >3x recovery)...");
  
  const crashCount = await db.execute(sql`
    WITH evaluated AS (
      SELECT 
        m.symbol_id, 
        m.timestamp, 
        m.close, 
        LAG(m.close) OVER (PARTITION BY m.symbol_id ORDER BY m.timestamp) as prev_close,
        LEAD(m.close) OVER (PARTITION BY m.symbol_id ORDER BY m.timestamp) as next_close
      FROM market_data m
    )
    SELECT COUNT(*) as count FROM evaluated
    WHERE prev_close > 0 AND close > 0 AND next_close > 0
      AND (close / prev_close) < 0.2 
      AND (next_close / close) > 3.0
  `);
  logger.info(`   Found: ${Number(crashCount[0]?.count).toLocaleString()} flash crashes`);

  if (!isDryRun && Number(crashCount[0]?.count) > 0) {
    logger.info("   Deleting...");
    const deleteStart = Date.now();
    const result = await db.execute(sql`
      WITH evaluated AS (
        SELECT 
          m.symbol_id, 
          m.timestamp, 
          m.interval,
          m.close, 
          LAG(m.close) OVER (PARTITION BY m.symbol_id ORDER BY m.timestamp) as prev_close,
          LEAD(m.close) OVER (PARTITION BY m.symbol_id ORDER BY m.timestamp) as next_close
        FROM market_data m
      ),
      anomalies AS (
        SELECT symbol_id, timestamp, interval
        FROM evaluated
        WHERE prev_close > 0 AND close > 0 AND next_close > 0
          AND (close / prev_close) < 0.2 
          AND (next_close / close) > 3.0
      )
      DELETE FROM market_data m
      USING anomalies a
      WHERE m.symbol_id = a.symbol_id 
        AND m.timestamp = a.timestamp 
        AND m.interval = a.interval
    `);
    const elapsed = ((Date.now() - deleteStart) / 1000).toFixed(1);
    logger.info(`   ✅ Deleted ${Number(result.count || crashCount[0]?.count).toLocaleString()} flash crashes in ${elapsed}s`);
  }

  // ============================================
  // 2. Count Flash Pumps  
  // ============================================
  logger.info("\n2️⃣  Detecting Flash Pumps (>5x spike then >75% drop)...");
  
  const pumpCount = await db.execute(sql`
    WITH evaluated AS (
      SELECT 
        m.symbol_id, 
        m.timestamp, 
        m.close, 
        LAG(m.close) OVER (PARTITION BY m.symbol_id ORDER BY m.timestamp) as prev_close,
        LEAD(m.close) OVER (PARTITION BY m.symbol_id ORDER BY m.timestamp) as next_close
      FROM market_data m
    )
    SELECT COUNT(*) as count FROM evaluated
    WHERE prev_close > 0 AND close > 0 AND next_close > 0
      AND (close / prev_close) > 5.0
      AND (next_close / close) < 0.25
  `);
  logger.info(`   Found: ${Number(pumpCount[0]?.count).toLocaleString()} flash pumps`);

  if (!isDryRun && Number(pumpCount[0]?.count) > 0) {
    logger.info("   Deleting...");
    const deleteStart = Date.now();
    const result = await db.execute(sql`
      WITH evaluated AS (
        SELECT 
          m.symbol_id, 
          m.timestamp,
          m.interval, 
          m.close, 
          LAG(m.close) OVER (PARTITION BY m.symbol_id ORDER BY m.timestamp) as prev_close,
          LEAD(m.close) OVER (PARTITION BY m.symbol_id ORDER BY m.timestamp) as next_close
        FROM market_data m
      ),
      anomalies AS (
        SELECT symbol_id, timestamp, interval
        FROM evaluated
        WHERE prev_close > 0 AND close > 0 AND next_close > 0
          AND (close / prev_close) > 5.0
          AND (next_close / close) < 0.25
      )
      DELETE FROM market_data m
      USING anomalies a
      WHERE m.symbol_id = a.symbol_id 
        AND m.timestamp = a.timestamp 
        AND m.interval = a.interval
    `);
    const elapsed = ((Date.now() - deleteStart) / 1000).toFixed(1);
    logger.info(`   ✅ Deleted ${Number(result.count || pumpCount[0]?.count).toLocaleString()} flash pumps in ${elapsed}s`);
  }

  // ============================================
  // SUMMARY
  // ============================================
  const duration = ((performance.now() - start) / 1000).toFixed(2);
  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`📋 AUDIT SUMMARY`);
  logger.info(`${'='.repeat(60)}`);
  logger.info(`   Duration: ${duration}s`);
  if (isDryRun) {
    logger.info(`   Mode: DRY RUN (no changes made)`);
  } else {
    logger.info(`   Flash Crashes Removed: ${Number(crashCount[0]?.count).toLocaleString()}`);
    logger.info(`   Flash Pumps Removed: ${Number(pumpCount[0]?.count).toLocaleString()}`);
  }
  logger.info(`${'='.repeat(60)}\n`);

  process.exit(0);
}

auditOutliersFast().catch(err => {
  logger.error("Fatal error", err);
  process.exit(1);
});
