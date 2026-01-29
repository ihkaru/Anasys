/**
 * Comprehensive Data Consistency Tests
 * 
 * All calculations are performed on the database side for efficiency.
 * Tests every ticker for anomalies and data quality issues.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "../db";

// Test configuration
const THRESHOLDS = {
    // Volatility thresholds (% of open price)
    STOCK_MAX_VOLATILITY: 25,
    CRYPTO_MAX_VOLATILITY: 60,
    
    // Price sanity
    MIN_VALID_PRICE: 0.0001,
    MAX_PRICE_SPIKE_MULTIPLIER: 5, // High > 5x Open is suspicious
    
    // OHLC validity
    MAX_GAP_HOURS_CRYPTO: 2,   // Crypto trades 24/7
    MAX_GAP_HOURS_STOCK: 24,   // Stocks have weekends
    
    // Minimum data requirements
    MIN_RECORDS_PER_SYMBOL: 10,
};

interface AnomalyResult {
    ticker: string;
    type: string;
    interval: string;
    anomaly_type: string;
    count: number;
    sample_timestamp: Date;
    details: string;
}

interface SummaryResult {
    total_symbols: number;
    total_records: number;
    symbols_with_anomalies: number;
    total_anomalies: number;
}

describe("📊 Comprehensive Data Consistency Tests", () => {
    let summary: SummaryResult;
    let anomalies: AnomalyResult[] = [];
    
    beforeAll(async () => {
        console.log("\n🔍 Running comprehensive data consistency analysis...\n");
        console.log("All calculations performed on database side for efficiency.\n");
    });

    // ============================================
    // TEST 1: Basic Database Health
    // ============================================
    describe("1️⃣  Basic Database Health", () => {
        it("should have symbols in database", async () => {
            const result = await db.execute(sql`SELECT COUNT(*) as count FROM symbols`);
            const count = Number(result[0]?.count || 0);
            console.log(`   Symbols: ${count.toLocaleString()}`);
            expect(count).toBeGreaterThan(0);
        });

        it("should have market data records", async () => {
            const result = await db.execute(sql`SELECT COUNT(*) as count FROM market_data`);
            const count = Number(result[0]?.count || 0);
            console.log(`   Market Data: ${count.toLocaleString()} records`);
            expect(count).toBeGreaterThan(0);
        });

        it("should have data intervals", async () => {
            const result = await db.execute(sql`
                SELECT interval, COUNT(*) as count 
                FROM market_data 
                GROUP BY interval 
                ORDER BY count DESC
            `);
            console.log(`   Intervals:`);
            result.forEach((r: any) => console.log(`      ${r.interval}: ${Number(r.count).toLocaleString()}`));
            expect(result.length).toBeGreaterThan(0);
        });
    });

    // ============================================
    // TEST 2: OHLC Validity (High >= Low, etc.)
    // ============================================
    describe("2️⃣  OHLC Validity Checks", () => {
        it("should have no records where high < low", async () => {
            const result = await db.execute(sql`
                SELECT s.ticker, s.type, m.interval, COUNT(*) as count,
                       MIN(m.timestamp) as sample_timestamp,
                       MIN(m.high)::text || '<' || MIN(m.low)::text as details
                FROM market_data m
                JOIN symbols s ON m.symbol_id = s.id
                WHERE m.high < m.low
                GROUP BY s.ticker, s.type, m.interval
                ORDER BY count DESC
            `);
            
            if (result.length > 0) {
                console.log(`   ⚠️  Found ${result.length} tickers with high < low anomalies`);
                result.slice(0, 5).forEach((r: any) => {
                    console.log(`      ${r.ticker} (${r.interval}): ${r.count} records`);
                    anomalies.push({ ...r, anomaly_type: 'HIGH_LESS_THAN_LOW' });
                });
            } else {
                console.log(`   ✅ All records have valid high >= low`);
            }
            expect(result.length).toBe(0);
        });

        it("should have no records where open/close outside high-low range", async () => {
            const result = await db.execute(sql`
                SELECT s.ticker, s.type, m.interval, COUNT(*) as count,
                       MIN(m.timestamp) as sample_timestamp,
                       'Open or Close outside High-Low range' as details
                FROM market_data m
                JOIN symbols s ON m.symbol_id = s.id
                WHERE m.open > m.high OR m.open < m.low 
                   OR m.close > m.high OR m.close < m.low
                GROUP BY s.ticker, s.type, m.interval
                ORDER BY count DESC
            `);
            
            if (result.length > 0) {
                console.log(`   ⚠️  Found ${result.length} tickers with OHLC range violations`);
                result.slice(0, 5).forEach((r: any) => {
                    console.log(`      ${r.ticker} (${r.interval}): ${r.count} records`);
                    anomalies.push({ ...r, anomaly_type: 'OHLC_RANGE_VIOLATION' });
                });
            } else {
                console.log(`   ✅ All OHLC values within valid ranges`);
            }
            expect(result.length).toBe(0);
        });

        it("should have no zero or negative prices", async () => {
            const result = await db.execute(sql`
                SELECT s.ticker, s.type, m.interval, COUNT(*) as count,
                       MIN(m.timestamp) as sample_timestamp,
                       'O:' || MIN(m.open)::text || ' C:' || MIN(m.close)::text as details
                FROM market_data m
                JOIN symbols s ON m.symbol_id = s.id
                WHERE m.open <= 0 OR m.high <= 0 OR m.low <= 0 OR m.close <= 0
                GROUP BY s.ticker, s.type, m.interval
                ORDER BY count DESC
            `);
            
            if (result.length > 0) {
                console.log(`   ⚠️  Found ${result.length} tickers with zero/negative prices`);
                result.slice(0, 5).forEach((r: any) => {
                    console.log(`      ${r.ticker} (${r.interval}): ${r.count} records - ${r.details}`);
                    anomalies.push({ ...r, anomaly_type: 'ZERO_OR_NEGATIVE_PRICE' });
                });
            } else {
                console.log(`   ✅ All prices are positive`);
            }
            expect(result.length).toBe(0);
        });
    });

    // ============================================
    // TEST 3: Volatility Anomalies
    // ============================================
    describe("3️⃣  Volatility Anomaly Detection", () => {
        it("should have no extreme volatility candles (stocks)", async () => {
            const result = await db.execute(sql`
                SELECT s.ticker, s.type, m.interval, COUNT(*) as count,
                       MIN(m.timestamp) as sample_timestamp,
                       MAX(((m.high - m.low) / NULLIF(m.open, 0)) * 100)::int || '% max volatility' as details
                FROM market_data m
                JOIN symbols s ON m.symbol_id = s.id
                WHERE s.type = 'STOCK'
                  AND ((m.high - m.low) / NULLIF(m.open, 0)) > ${THRESHOLDS.STOCK_MAX_VOLATILITY / 100}
                GROUP BY s.ticker, s.type, m.interval
                ORDER BY count DESC
            `);
            
            console.log(`   Checking stocks for >${THRESHOLDS.STOCK_MAX_VOLATILITY}% volatility...`);
            if (result.length > 0) {
                console.log(`   ⚠️  Found ${result.length} stocks with extreme volatility`);
                result.slice(0, 5).forEach((r: any) => {
                    console.log(`      ${r.ticker} (${r.interval}): ${r.count} records - ${r.details}`);
                    anomalies.push({ ...r, anomaly_type: 'STOCK_EXTREME_VOLATILITY' });
                });
            } else {
                console.log(`   ✅ All stocks within normal volatility`);
            }
            // This is a warning, not failure (some legitimate volatile days exist)
        });

        it("should have no extreme volatility candles (crypto)", async () => {
            const result = await db.execute(sql`
                SELECT s.ticker, s.type, m.interval, COUNT(*) as count,
                       MIN(m.timestamp) as sample_timestamp,
                       MAX(((m.high - m.low) / NULLIF(m.open, 0)) * 100)::int || '% max volatility' as details
                FROM market_data m
                JOIN symbols s ON m.symbol_id = s.id
                WHERE s.type = 'CRYPTO'
                  AND ((m.high - m.low) / NULLIF(m.open, 0)) > ${THRESHOLDS.CRYPTO_MAX_VOLATILITY / 100}
                GROUP BY s.ticker, s.type, m.interval
                ORDER BY count DESC
            `);
            
            console.log(`   Checking crypto for >${THRESHOLDS.CRYPTO_MAX_VOLATILITY}% volatility...`);
            if (result.length > 0) {
                console.log(`   ⚠️  Found ${result.length} crypto with extreme volatility`);
                result.slice(0, 5).forEach((r: any) => {
                    console.log(`      ${r.ticker} (${r.interval}): ${r.count} records - ${r.details}`);
                    anomalies.push({ ...r, anomaly_type: 'CRYPTO_EXTREME_VOLATILITY' });
                });
            } else {
                console.log(`   ✅ All crypto within normal volatility`);
            }
        });
    });

    // ============================================
    // TEST 4: Flash Crash / Pump Detection
    // ============================================
    describe("4️⃣  Flash Crash / Pump Detection", () => {
        it("should have no suspicious price spikes (high > 5x open)", async () => {
            const result = await db.execute(sql`
                SELECT s.ticker, s.type, m.interval, COUNT(*) as count,
                       MIN(m.timestamp) as sample_timestamp,
                       'High ' || MAX(m.high / NULLIF(m.open, 0))::numeric(10,1) || 'x Open' as details
                FROM market_data m
                JOIN symbols s ON m.symbol_id = s.id
                WHERE m.high > (m.open * ${THRESHOLDS.MAX_PRICE_SPIKE_MULTIPLIER})
                  AND m.open > 0
                GROUP BY s.ticker, s.type, m.interval
                ORDER BY count DESC
            `);
            
            if (result.length > 0) {
                console.log(`   ⚠️  Found ${result.length} tickers with price spikes`);
                result.slice(0, 5).forEach((r: any) => {
                    console.log(`      ${r.ticker} (${r.interval}): ${r.count} records - ${r.details}`);
                    anomalies.push({ ...r, anomaly_type: 'PRICE_SPIKE' });
                });
            } else {
                console.log(`   ✅ No suspicious price spikes detected`);
            }
            expect(result.length).toBe(0);
        });

        it("should have no suspicious price drops (low < 0.2x open)", async () => {
            const result = await db.execute(sql`
                SELECT s.ticker, s.type, m.interval, COUNT(*) as count,
                       MIN(m.timestamp) as sample_timestamp,
                       'Low ' || MIN(m.low / NULLIF(m.open, 0))::numeric(10,2) || 'x Open' as details
                FROM market_data m
                JOIN symbols s ON m.symbol_id = s.id
                WHERE m.low < (m.open * 0.2)
                  AND m.open > 0
                GROUP BY s.ticker, s.type, m.interval
                ORDER BY count DESC
            `);
            
            if (result.length > 0) {
                console.log(`   ⚠️  Found ${result.length} tickers with flash crashes`);
                result.slice(0, 5).forEach((r: any) => {
                    console.log(`      ${r.ticker} (${r.interval}): ${r.count} records - ${r.details}`);
                    anomalies.push({ ...r, anomaly_type: 'FLASH_CRASH' });
                });
            } else {
                console.log(`   ✅ No flash crashes detected`);
            }
            expect(result.length).toBe(0);
        });
    });

    // ============================================
    // TEST 5: Duplicate Detection
    // ============================================
    describe("5️⃣  Duplicate Detection", () => {
        it("should have no duplicate timestamp entries per symbol/interval", async () => {
            const result = await db.execute(sql`
                SELECT s.ticker, m.interval, COUNT(*) as duplicate_count,
                       m.timestamp as sample_timestamp
                FROM market_data m
                JOIN symbols s ON m.symbol_id = s.id
                GROUP BY s.ticker, m.symbol_id, m.timestamp, m.interval
                HAVING COUNT(*) > 1
                ORDER BY duplicate_count DESC
                LIMIT 20
            `);
            
            if (result.length > 0) {
                console.log(`   ⚠️  Found ${result.length} duplicate entries`);
                result.slice(0, 5).forEach((r: any) => {
                    console.log(`      ${r.ticker} (${r.interval}): ${r.duplicate_count} duplicates at ${r.sample_timestamp}`);
                });
            } else {
                console.log(`   ✅ No duplicate entries found`);
            }
            expect(result.length).toBe(0);
        });
    });

    // ============================================
    // TEST 6: Timestamp Normalization
    // ============================================
    describe("6️⃣  Timestamp Normalization Check", () => {
        it("should have properly aligned 1h timestamps (minute=0)", async () => {
            const result = await db.execute(sql`
                SELECT s.ticker, COUNT(*) as count,
                       MIN(m.timestamp) as sample_timestamp,
                       EXTRACT(MINUTE FROM MIN(m.timestamp))::int || ' min offset' as details
                FROM market_data m
                JOIN symbols s ON m.symbol_id = s.id
                WHERE m.interval = '1h'
                  AND EXTRACT(MINUTE FROM m.timestamp) != 0
                GROUP BY s.ticker
                ORDER BY count DESC
                LIMIT 20
            `);
            
            if (result.length > 0) {
                console.log(`   ⚠️  Found ${result.length} tickers with non-aligned 1h timestamps`);
                result.slice(0, 5).forEach((r: any) => {
                    console.log(`      ${r.ticker}: ${r.count} records - ${r.details}`);
                });
            } else {
                console.log(`   ✅ All 1h timestamps properly aligned`);
            }
            expect(result.length).toBe(0);
        });

        it("should have properly aligned 1d timestamps (hour=0)", async () => {
            const result = await db.execute(sql`
                SELECT s.ticker, COUNT(*) as count,
                       MIN(m.timestamp) as sample_timestamp,
                       EXTRACT(HOUR FROM MIN(m.timestamp))::int || 'h offset' as details
                FROM market_data m
                JOIN symbols s ON m.symbol_id = s.id
                WHERE m.interval = '1d'
                  AND EXTRACT(HOUR FROM m.timestamp) != 0
                GROUP BY s.ticker
                ORDER BY count DESC
                LIMIT 20
            `);
            
            if (result.length > 0) {
                console.log(`   ⚠️  Found ${result.length} tickers with non-aligned 1d timestamps`);
                result.slice(0, 5).forEach((r: any) => {
                    console.log(`      ${r.ticker}: ${r.count} records - ${r.details}`);
                });
            } else {
                console.log(`   ✅ All 1d timestamps properly aligned`);
            }
            // Not a hard fail as some data sources use market open time
        });
    });

    // ============================================
    // TEST 7: Data Coverage Statistics
    // ============================================
    describe("7️⃣  Data Coverage Statistics", () => {
        it("should report coverage per symbol type", async () => {
            const result = await db.execute(sql`
                SELECT 
                    s.type,
                    COUNT(DISTINCT s.id) as symbol_count,
                    COUNT(m.symbol_id) as record_count,
                    MIN(m.timestamp) as earliest_date,
                    MAX(m.timestamp) as latest_date,
                    AVG(sub.records_per_symbol)::int as avg_records_per_symbol
                FROM symbols s
                LEFT JOIN market_data m ON s.id = m.symbol_id
                LEFT JOIN (
                    SELECT symbol_id, COUNT(*) as records_per_symbol 
                    FROM market_data 
                    GROUP BY symbol_id
                ) sub ON s.id = sub.symbol_id
                GROUP BY s.type
            `);
            
            console.log(`\n   Data Coverage Summary:`);
            console.log(`   ${'─'.repeat(70)}`);
            result.forEach((r: any) => {
                console.log(`   ${r.type || 'UNKNOWN'}: ${Number(r.symbol_count).toLocaleString()} symbols, ${Number(r.record_count).toLocaleString()} records`);
                console.log(`      Range: ${r.earliest_date ? new Date(r.earliest_date).toISOString().split('T')[0] : 'N/A'} to ${r.latest_date ? new Date(r.latest_date).toISOString().split('T')[0] : 'N/A'}`);
                console.log(`      Avg records/symbol: ${r.avg_records_per_symbol || 0}`);
            });
            
            expect(result.length).toBeGreaterThan(0);
        });

        it("should identify symbols with insufficient data", async () => {
            const result = await db.execute(sql`
                SELECT s.ticker, s.type, COALESCE(COUNT(m.symbol_id), 0) as record_count
                FROM symbols s
                LEFT JOIN market_data m ON s.id = m.symbol_id
                GROUP BY s.id, s.ticker, s.type
                HAVING COALESCE(COUNT(m.symbol_id), 0) < ${THRESHOLDS.MIN_RECORDS_PER_SYMBOL}
                ORDER BY record_count ASC
                LIMIT 20
            `);
            
            console.log(`\n   Symbols with < ${THRESHOLDS.MIN_RECORDS_PER_SYMBOL} records: ${result.length}`);
            if (result.length > 0 && result.length <= 10) {
                result.forEach((r: any) => {
                    console.log(`      ${r.ticker} (${r.type}): ${r.record_count} records`);
                });
            }
            // Not a hard fail, just informational
        });
    });

    // ============================================
    // TEST 8: Referential Integrity
    // ============================================
    describe("8️⃣  Referential Integrity", () => {
        it("should have no orphaned market data records", async () => {
            const result = await db.execute(sql`
                SELECT COUNT(*) as orphan_count
                FROM market_data m
                LEFT JOIN symbols s ON m.symbol_id = s.id
                WHERE s.id IS NULL
            `);
            
            const count = Number(result[0]?.orphan_count || 0);
            if (count > 0) {
                console.log(`   ⚠️  Found ${count} orphaned market data records`);
            } else {
                console.log(`   ✅ No orphaned market data records`);
            }
            expect(count).toBe(0);
        });
    });

    // ============================================
    // FINAL SUMMARY
    // ============================================
    describe("📋 Final Summary", () => {
        it("should generate comprehensive report", async () => {
            const summaryResult = await db.execute(sql`
                SELECT 
                    (SELECT COUNT(*) FROM symbols) as total_symbols,
                    (SELECT COUNT(*) FROM market_data) as total_records,
                    (SELECT COUNT(DISTINCT ticker) FROM (
                        SELECT s.ticker
                        FROM market_data m
                        JOIN symbols s ON m.symbol_id = s.id
                        WHERE m.high < m.low 
                           OR m.open <= 0 
                           OR m.close <= 0
                           OR m.high > (m.open * 5)
                           OR m.low < (m.open * 0.2)
                    ) sub) as symbols_with_critical_anomalies
            `);
            
            const s = summaryResult[0] as any;
            console.log(`\n${'═'.repeat(50)}`);
            console.log(`   FINAL REPORT`);
            console.log(`${'═'.repeat(50)}`);
            console.log(`   Total Symbols:              ${Number(s.total_symbols).toLocaleString()}`);
            console.log(`   Total Market Data Records:  ${Number(s.total_records).toLocaleString()}`);
            console.log(`   Symbols w/ Critical Issues: ${Number(s.symbols_with_critical_anomalies).toLocaleString()}`);
            console.log(`   Test Anomalies Logged:      ${anomalies.length}`);
            console.log(`${'═'.repeat(50)}\n`);
            
            if (Number(s.symbols_with_critical_anomalies) === 0) {
                console.log(`   ✅ DATABASE IS CLEAN - No critical anomalies detected!\n`);
            } else {
                console.log(`   ⚠️  ACTION REQUIRED - Critical anomalies need attention.\n`);
                console.log(`   Run: bun run src/scripts/audit_global.ts to clean.\n`);
            }
            
            expect(Number(s.symbols_with_critical_anomalies)).toBe(0);
        });
    });
});
