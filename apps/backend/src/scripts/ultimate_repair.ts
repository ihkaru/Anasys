/**
 * Ultimate Smart Repair Script
 * 
 * This is the most comprehensive repair solution that:
 * 1. Detects and removes ALL anomalous data from the database
 * 2. Detects gaps in time series data
 * 3. Prioritizes VIP symbols (watchlist + holdings)
 * 4. Uses intelligent rate limiting with exponential backoff
 * 5. Provides detailed progress and statistics
 * 
 * Usage:
 *   npx tsx src/scripts/ultimate_repair.ts [--dry-run] [--vip-only] [--interval=1h]
 * 
 * Options:
 *   --dry-run     Only analyze, don't delete or sync
 *   --vip-only    Only process watchlist and holding symbols
 *   --interval    Target interval (default: 1h)
 */

import { and, eq, sql } from "drizzle-orm";
import { holdings, marketData, watchlistItems } from "../../../../packages/db/src/schema";
import { db } from "../db";
import { getDataValidator } from "../utils/data-validator";
import { getYahooRateLimiter } from "../utils/rate-limiter";

// ============================================================================
// Configuration
// ============================================================================

interface RepairConfig {
    dryRun: boolean;
    vipOnly: boolean;
    interval: string;
    lookbackDays: number;
    batchSize: number;
}

function parseArgs(): RepairConfig {
    const args = process.argv.slice(2);
    return {
        dryRun: args.includes('--dry-run'),
        vipOnly: args.includes('--vip-only'),
        interval: args.find(a => a.startsWith('--interval='))?.split('=')[1] || '1h',
        lookbackDays: 7,
        batchSize: 50
    };
}

// ============================================================================
// Phase 1: Anomaly Detection & Cleanup
// ============================================================================

interface AnomalyRecord {
    symbolId: number;
    ticker: string;
    type: string;
    timestamp: Date;
    interval: string;
    open: number;
    high: number;
    low: number;
    close: number;
    reason: string;
}

async function detectAnomalies(config: RepairConfig): Promise<AnomalyRecord[]> {
    console.log('\n🔍 Phase 1: Detecting Anomalies...');
    
    const query = sql`
        SELECT 
            m.symbol_id, 
            m.timestamp, 
            m.interval,
            s.ticker,
            s.type,
            m.open, m.high, m.low, m.close,
            CASE
                WHEN m.high < m.low THEN 'High < Low'
                WHEN m.open <= 0 THEN 'Open <= 0'
                WHEN m.close <= 0 THEN 'Close <= 0'
                WHEN m.high <= 0 THEN 'High <= 0'
                WHEN m.low <= 0 THEN 'Low <= 0'
                WHEN s.type = 'STOCK' AND (m.high - m.low) > (m.open * 0.25) THEN 'Stock volatility > 25%'
                WHEN s.type = 'CRYPTO' AND (m.high - m.low) > (m.open * 0.60) THEN 'Crypto volatility > 60%'
                WHEN m.high > (m.open * 5) THEN 'Extreme high spike'
                WHEN m.low < (m.open * 0.5) THEN 'Extreme low drop'
                ELSE 'Unknown'
            END as reason
        FROM market_data m
        JOIN symbols s ON m.symbol_id = s.id
        WHERE 
            m.interval = ${config.interval}
            AND m.timestamp > NOW() - INTERVAL '${sql.raw(String(config.lookbackDays))} days'
            AND (
                m.high < m.low 
                OR m.open <= 0 
                OR m.close <= 0 
                OR m.high <= 0 
                OR m.low <= 0
                OR (s.type = 'STOCK' AND (m.high - m.low) > (m.open * 0.25))
                OR (s.type = 'CRYPTO' AND (m.high - m.low) > (m.open * 0.60))
                OR m.high > (m.open * 5)
                OR m.low < (m.open * 0.5)
            )
        ORDER BY m.timestamp DESC
        LIMIT 1000
    `;

    const results = await db.execute(query);
    
    return results.map((r: any) => ({
        symbolId: r.symbol_id,
        ticker: r.ticker,
        type: r.type,
        timestamp: new Date(r.timestamp),
        interval: r.interval,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        reason: r.reason
    }));
}

async function cleanupAnomalies(anomalies: AnomalyRecord[], config: RepairConfig): Promise<number> {
    if (anomalies.length === 0) {
        console.log('   ✅ No anomalies found!');
        return 0;
    }

    console.log(`   ⚠️  Found ${anomalies.length} anomalies`);
    
    // Show top offenders
    const grouped = new Map<string, number>();
    for (const a of anomalies) {
        const key = a.ticker;
        grouped.set(key, (grouped.get(key) || 0) + 1);
    }
    
    const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log('   Top offenders:');
    for (const [ticker, count] of sorted) {
        console.log(`      ${ticker}: ${count} anomalies`);
    }

    if (config.dryRun) {
        console.log('   [DRY RUN] Would delete these anomalies');
        return 0;
    }

    // Batch delete
    console.log(`   Deleting in batches of ${config.batchSize}...`);
    let deleted = 0;

    for (let i = 0; i < anomalies.length; i += config.batchSize) {
        const batch = anomalies.slice(i, i + config.batchSize);
        
        await Promise.all(batch.map(a => 
            db.delete(marketData)
                .where(and(
                    eq(marketData.symbolId, a.symbolId),
                    eq(marketData.timestamp, a.timestamp),
                    eq(marketData.interval, a.interval)
                ))
        ));
        
        deleted += batch.length;
        process.stdout.write(`\r   Progress: ${deleted}/${anomalies.length} deleted`);
        
        // Small delay between batches
        await sleep(100);
    }
    
    console.log('\n   ✅ Anomalies cleaned!');
    return deleted;
}

// ============================================================================
// Phase 2: Gap Detection
// ============================================================================

interface GapInfo {
    symbolId: number;
    ticker: string;
    type: string;
    gapCount: number;
    isVip: boolean;
    priority: number;
}

async function detectGaps(config: RepairConfig, vipIds: Set<number>): Promise<GapInfo[]> {
    console.log('\n🔍 Phase 2: Detecting Data Gaps...');
    
    const gapQuery = sql`
        WITH candle_gaps AS (
            SELECT 
                symbol_id,
                timestamp,
                LEAD(timestamp) OVER (PARTITION BY symbol_id ORDER BY timestamp) as next_ts
            FROM market_data
            WHERE interval = ${config.interval}
              AND timestamp > NOW() - INTERVAL '${sql.raw(String(config.lookbackDays))} days'
        ),
        gap_counts AS (
            SELECT 
                symbol_id,
                COUNT(*) as gap_count
            FROM candle_gaps 
            WHERE next_ts IS NOT NULL 
              AND next_ts - timestamp > INTERVAL '${sql.raw(config.interval === '1h' ? '1 hour' : '1 day')}' * 1.2
            GROUP BY symbol_id
        )
        SELECT 
            gc.symbol_id,
            gc.gap_count,
            s.ticker,
            s.type
        FROM gap_counts gc
        JOIN symbols s ON gc.symbol_id = s.id
        ORDER BY gc.gap_count DESC
    `;

    const results = await db.execute(gapQuery);
    
    return results.map((r: any) => {
        const isVip = vipIds.has(r.symbol_id);
        let priority = r.gap_count; // Base priority on gap count
        
        // Boost priority
        if (isVip) priority += 1000;
        if (['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'BTC-USD', 'ETH-USD'].includes(r.ticker)) {
            priority += 500;
        }
        if (r.ticker.includes('-USD')) priority += 100; // Crypto
        
        return {
            symbolId: r.symbol_id,
            ticker: r.ticker,
            type: r.type,
            gapCount: Number(r.gap_count),
            isVip,
            priority
        };
    }).sort((a, b) => b.priority - a.priority);
}

// ============================================================================
// Phase 3: VIP Symbol Resolution
// ============================================================================

async function getVipSymbolIds(): Promise<Set<number>> {
    const watchlistIds = (await db.select({ id: watchlistItems.symbolId }).from(watchlistItems))
        .map(r => r.id);
    const holdingIds = (await db.select({ id: holdings.symbolId }).from(holdings))
        .map(r => r.id);
    
    return new Set([...watchlistIds, ...holdingIds]);
}

// ============================================================================
// Phase 4: Smart Repair with Rate Limiting
// ============================================================================

async function repairSymbols(gaps: GapInfo[], config: RepairConfig): Promise<{ success: number; failed: number }> {
    console.log('\n🔧 Phase 3: Repairing Data Gaps...');
    
    if (gaps.length === 0) {
        console.log('   ✅ No gaps to repair!');
        return { success: 0, failed: 0 };
    }

    // Filter by VIP if requested
    let queue = config.vipOnly ? gaps.filter(g => g.isVip) : gaps;
    
    if (queue.length === 0) {
        console.log('   ✅ No VIP gaps to repair!');
        return { success: 0, failed: 0 };
    }

    console.log(`   📋 Repair queue: ${queue.length} symbols`);
    console.log('   Top 5:');
    queue.slice(0, 5).forEach((g, i) => {
        const vipBadge = g.isVip ? '👑' : '  ';
        console.log(`      ${i + 1}. ${vipBadge} [${g.ticker}] ${g.gapCount} gaps`);
    });

    if (config.dryRun) {
        console.log('   [DRY RUN] Would repair these symbols');
        return { success: 0, failed: 0 };
    }

    // Import market service dynamically
    const { marketService } = await import("../modules/market/market.service");
    const rateLimiter = getYahooRateLimiter();
    const validator = getDataValidator();

    let success = 0;
    let failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        const vipBadge = item.isVip ? '👑' : '  ';
        process.stdout.write(`   [${i + 1}/${queue.length}] ${vipBadge} ${item.ticker}... `);

        try {
            await rateLimiter.execute(async () => {
                await marketService.syncSymbolData(
                    item.ticker,
                    item.type as 'STOCK' | 'CRYPTO',
                    config.interval
                );
            }, `sync:${item.ticker}`);
            
            process.stdout.write('✅\n');
            success++;
        } catch (e) {
            const msg = (e as Error).message;
            process.stdout.write(`❌ ${msg.slice(0, 50)}\n`);
            failed++;
        }

        // Progress bar update
        const elapsed = Date.now() - startTime;
        const avgTime = elapsed / (i + 1);
        const remaining = avgTime * (queue.length - i - 1);
        
        if ((i + 1) % 10 === 0) {
            console.log(`   ⏱️  ETA: ${formatDuration(remaining)}`);
        }
    }

    return { success, failed };
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
    const config = parseArgs();
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('               🛠️  ULTIMATE SMART REPAIR                   ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   Mode:       ${config.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
    console.log(`   Scope:      ${config.vipOnly ? 'VIP Only' : 'All Symbols'}`);
    console.log(`   Interval:   ${config.interval}`);
    console.log(`   Lookback:   ${config.lookbackDays} days`);
    console.log('═══════════════════════════════════════════════════════════');

    const overallStart = Date.now();

    try {
        // Get VIP IDs first
        const vipIds = await getVipSymbolIds();
        console.log(`\n📋 Found ${vipIds.size} VIP symbols (watchlist + holdings)`);

        // Phase 1: Detect and clean anomalies
        const anomalies = await detectAnomalies(config);
        const deletedCount = await cleanupAnomalies(anomalies, config);

        // Phase 2: Detect gaps
        const gaps = await detectGaps(config, vipIds);

        // Phase 3: Repair
        const { success, failed } = await repairSymbols(gaps, config);

        // Final Summary
        const totalDuration = Date.now() - overallStart;
        const rateLimiter = getYahooRateLimiter();
        
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('                    📊 FINAL SUMMARY                        ');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`   Anomalies Found:     ${anomalies.length}`);
        console.log(`   Anomalies Deleted:   ${deletedCount}`);
        console.log(`   Gaps Detected:       ${gaps.length}`);
        console.log(`   Repairs Attempted:   ${success + failed}`);
        console.log(`   Successful:          ${success}`);
        console.log(`   Failed:              ${failed}`);
        console.log(`   Total Duration:      ${formatDuration(totalDuration)}`);
        rateLimiter.printStats();
        console.log('═══════════════════════════════════════════════════════════');

        if (!config.dryRun && success > 0) {
            console.log('\n✅ Database is now cleaner and more complete!');
        }

    } catch (e) {
        console.error('\n❌ Fatal error:', e);
        process.exit(1);
    }

    process.exit(0);
}

main();
