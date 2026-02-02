/**
 * Investigation Script for Data Anomalies
 * Usage: bun run src/scripts/investigate_ticker.ts [TICKER]
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

const ticker = process.argv[2] || "MU";

async function investigate() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 INVESTIGATING TICKER: ${ticker}`);
  console.log(`${'='.repeat(60)}\n`);

  // 1. Basic Info
  console.log("📊 1. BASIC SYMBOL INFO");
  console.log("-".repeat(40));
  const symbolInfo = await db.execute(sql`
    SELECT s.id, s.ticker, s.name, s.type, 
           COUNT(m.symbol_id) as record_count,
           MIN(m.timestamp) as first_date,
           MAX(m.timestamp) as last_date
    FROM symbols s
    LEFT JOIN market_data m ON s.id = m.symbol_id
    WHERE s.ticker = ${ticker}
    GROUP BY s.id, s.ticker, s.name, s.type
  `);
  if (symbolInfo.length === 0) {
    console.log(`❌ Ticker ${ticker} not found!`);
    process.exit(1);
  }
  console.log(symbolInfo[0]);
  console.log();

  // 2. Price Range Statistics
  console.log("📈 2. PRICE STATISTICS (1h interval)");
  console.log("-".repeat(40));
  const priceStats = await db.execute(sql`
    SELECT 
      MIN(m.low) as min_price,
      MAX(m.high) as max_price,
      AVG(m.close)::numeric(10,2) as avg_price,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY m.close)::numeric(10,2) as median_price,
      STDDEV(m.close)::numeric(10,2) as stddev_price,
      PERCENTILE_CONT(0.01) WITHIN GROUP (ORDER BY m.close)::numeric(10,2) as p1_price,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY m.close)::numeric(10,2) as p99_price
    FROM market_data m
    JOIN symbols s ON m.symbol_id = s.id
    WHERE s.ticker = ${ticker} AND m.interval = '1h'
  `);
  console.log(priceStats[0]);
  console.log();

  // 3. OHLC Violations
  console.log("🚨 3. OHLC VIOLATIONS (high<low, price out of range)");
  console.log("-".repeat(40));
  const ohlcViolations = await db.execute(sql`
    SELECT m.timestamp, m.interval, m.open, m.high, m.low, m.close, m.volume,
           CASE 
             WHEN m.high < m.low THEN 'HIGH<LOW'
             WHEN m.open > m.high OR m.open < m.low THEN 'OPEN_OUT_OF_RANGE'
             WHEN m.close > m.high OR m.close < m.low THEN 'CLOSE_OUT_OF_RANGE'
             ELSE 'UNKNOWN'
           END as violation_type
    FROM market_data m
    JOIN symbols s ON m.symbol_id = s.id
    WHERE s.ticker = ${ticker}
      AND (m.high < m.low 
           OR m.open > m.high OR m.open < m.low
           OR m.close > m.high OR m.close < m.low)
    ORDER BY m.timestamp DESC
    LIMIT 20
  `);
  console.log(`Found: ${ohlcViolations.length} violations`);
  ohlcViolations.forEach(r => console.log(r));
  console.log();

  // 4. Zero/Negative Prices
  console.log("💀 4. ZERO OR NEGATIVE PRICES");
  console.log("-".repeat(40));
  const zeroPrices = await db.execute(sql`
    SELECT m.timestamp, m.interval, m.open, m.high, m.low, m.close
    FROM market_data m
    JOIN symbols s ON m.symbol_id = s.id
    WHERE s.ticker = ${ticker}
      AND (m.open <= 0 OR m.high <= 0 OR m.low <= 0 OR m.close <= 0)
    ORDER BY m.timestamp DESC
    LIMIT 20
  `);
  console.log(`Found: ${zeroPrices.length} records`);
  zeroPrices.forEach(r => console.log(r));
  console.log();

  // 5. Statistical Outliers (Z-score > 3)
  console.log("📉 5. STATISTICAL OUTLIERS (Z-score > 3)");
  console.log("-".repeat(40));
  const outliers = await db.execute(sql`
    WITH stats AS (
      SELECT 
        AVG(m.close) as avg_price,
        STDDEV(m.close) as stddev_price
      FROM market_data m
      JOIN symbols s ON m.symbol_id = s.id
      WHERE s.ticker = ${ticker} AND m.interval = '1h'
    )
    SELECT m.timestamp, m.interval, m.open, m.high, m.low, m.close,
           stats.avg_price::numeric(10,2) as avg,
           ROUND(((m.close - stats.avg_price) / NULLIF(stats.stddev_price, 0))::numeric, 2) as z_score
    FROM market_data m
    JOIN symbols s ON m.symbol_id = s.id
    CROSS JOIN stats
    WHERE s.ticker = ${ticker} AND m.interval = '1h'
      AND stats.stddev_price > 0
      AND ABS((m.close - stats.avg_price) / stats.stddev_price) > 3
    ORDER BY ABS((m.close - stats.avg_price) / NULLIF(stats.stddev_price, 0)) DESC
    LIMIT 30
  `);
  console.log(`Found: ${outliers.length} outliers`);
  outliers.forEach(r => console.log(r));
  console.log();

  // 6. Price Spikes (candle >50% volatility)
  console.log("📊 6. HIGH VOLATILITY CANDLES (>50%)");
  console.log("-".repeat(40));
  const volatileCandles = await db.execute(sql`
    SELECT m.timestamp, m.interval, m.open, m.high, m.low, m.close,
           ROUND(((m.high - m.low) / NULLIF(m.open, 0) * 100)::numeric, 2) as volatility_pct
    FROM market_data m
    JOIN symbols s ON m.symbol_id = s.id
    WHERE s.ticker = ${ticker}
      AND m.open > 0
      AND ((m.high - m.low) / m.open) > 0.5
    ORDER BY ((m.high - m.low) / NULLIF(m.open, 0)) DESC
    LIMIT 20
  `);
  console.log(`Found: ${volatileCandles.length} volatile candles`);
  volatileCandles.forEach(r => console.log(r));
  console.log();

  // 7. Gap Detection (open differs >20% from previous close)
  console.log("🕳️  7. GAP DETECTION (>20% gap from previous close)");
  console.log("-".repeat(40));
  const gaps = await db.execute(sql`
    WITH ordered_data AS (
      SELECT m.timestamp, m.interval, m.open, m.high, m.low, m.close,
             LAG(m.close) OVER (PARTITION BY m.interval ORDER BY m.timestamp) as prev_close
      FROM market_data m
      JOIN symbols s ON m.symbol_id = s.id
      WHERE s.ticker = ${ticker}
    )
    SELECT *, 
           ROUND((ABS(open - prev_close) / NULLIF(prev_close, 0) * 100)::numeric, 2) as gap_pct
    FROM ordered_data
    WHERE prev_close > 0 
      AND ABS(open - prev_close) / prev_close > 0.2
    ORDER BY ABS(open - prev_close) / NULLIF(prev_close, 0) DESC
    LIMIT 20
  `);
  console.log(`Found: ${gaps.length} significant gaps`);
  gaps.forEach(r => console.log(r));
  console.log();

  // 8. Suspicious Low Prices (< 50% of average)
  console.log("⚠️  8. SUSPICIOUSLY LOW PRICES (<50% of average)");
  console.log("-".repeat(40));
  const suspiciousLow = await db.execute(sql`
    WITH stats AS (
      SELECT AVG(m.close) as avg_price
      FROM market_data m
      JOIN symbols s ON m.symbol_id = s.id
      WHERE s.ticker = ${ticker} AND m.interval = '1h'
    )
    SELECT m.timestamp, m.interval, m.open, m.high, m.low, m.close,
           stats.avg_price::numeric(10,2) as avg_price,
           ROUND((m.close / NULLIF(stats.avg_price, 0) * 100)::numeric, 2) as pct_of_avg
    FROM market_data m
    JOIN symbols s ON m.symbol_id = s.id
    CROSS JOIN stats
    WHERE s.ticker = ${ticker} AND m.interval = '1h'
      AND stats.avg_price > 0
      AND m.close < (stats.avg_price * 0.5)
    ORDER BY m.close ASC
    LIMIT 30
  `);
  console.log(`Found: ${suspiciousLow.length} suspiciously low prices`);
  suspiciousLow.forEach(r => console.log(r));
  console.log();

  // 9. Recent Data Sample
  console.log("📅 9. RECENT 20 CANDLES (1h)");
  console.log("-".repeat(40));
  const recent = await db.execute(sql`
    SELECT m.timestamp, m.open, m.high, m.low, m.close, m.volume
    FROM market_data m
    JOIN symbols s ON m.symbol_id = s.id
    WHERE s.ticker = ${ticker} AND m.interval = '1h'
    ORDER BY m.timestamp DESC
    LIMIT 20
  `);
  recent.forEach(r => console.log(r));

  console.log(`\n${'='.repeat(60)}`);
  console.log("INVESTIGATION COMPLETE");
  console.log(`${'='.repeat(60)}\n`);

  process.exit(0);
}

investigate().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
