/**
 * Data Pruning Script
 * 
 * Deletes old market data for symbols NOT in user's Watchlist or Holdings.
 * Default retention: 90 days
 * 
 * Usage:
 *   bun run src/scripts/prune_stale_data.ts [--dry-run] [--days=90]
 */

import { holdings, watchlistItems } from "@packages/db/src/schema";
import { sql } from "drizzle-orm";
import { db } from "../db";

interface PruneConfig {
    dryRun: boolean;
    retentionDays: number;
}

function parseArgs(): PruneConfig {
    const args = process.argv.slice(2);
    const daysArg = args.find(a => a.startsWith('--days='));
    
    return {
        dryRun: args.includes('--dry-run'),
        retentionDays: daysArg ? parseInt(daysArg.split('=')[1]) : 90
    };
}

async function getVipSymbolIds(): Promise<number[]> {
    const watchlistIds = (await db.select({ id: watchlistItems.symbolId }).from(watchlistItems))
        .map(r => r.id);
    const holdingIds = (await db.select({ id: holdings.symbolId }).from(holdings))
        .map(r => r.id);
    
    return [...new Set([...watchlistIds, ...holdingIds])];
}

async function main() {
    const config = parseArgs();
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('              🗑️  DATA PRUNING SCRIPT                      ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   Mode:       ${config.dryRun ? 'DRY RUN (no deletions)' : 'LIVE'}`);
    console.log(`   Retention:  ${config.retentionDays} days`);
    console.log('═══════════════════════════════════════════════════════════');

    try {
        // Get VIP symbols
        const vipIds = await getVipSymbolIds();
        console.log(`\n📋 VIP Symbols (protected): ${vipIds.length}`);

        // Count what would be deleted
        const countQuery = vipIds.length > 0
            ? sql`
                SELECT COUNT(*) as count FROM market_data
                WHERE symbol_id NOT IN (${sql.join(vipIds.map(id => sql`${id}`), sql`, `)})
                AND timestamp < NOW() - INTERVAL '${sql.raw(String(config.retentionDays))} days'
              `
            : sql`
                SELECT COUNT(*) as count FROM market_data
                WHERE timestamp < NOW() - INTERVAL '${sql.raw(String(config.retentionDays))} days'
              `;

        const countResult = await db.execute(countQuery);
        const deleteCount = Number(countResult[0]?.count || 0);
        
        console.log(`🔍 Records eligible for deletion: ${deleteCount.toLocaleString()}`);

        if (deleteCount === 0) {
            console.log('\n✅ Nothing to prune. Database is clean!');
            process.exit(0);
        }

        if (config.dryRun) {
            console.log('\n[DRY RUN] Would delete these records. Run without --dry-run to execute.');
            process.exit(0);
        }

        // Execute deletion
        console.log('\n⏳ Deleting...');
        const startTime = Date.now();

        const deleteQuery = vipIds.length > 0
            ? sql`
                DELETE FROM market_data
                WHERE symbol_id NOT IN (${sql.join(vipIds.map(id => sql`${id}`), sql`, `)})
                AND timestamp < NOW() - INTERVAL '${sql.raw(String(config.retentionDays))} days'
              `
            : sql`
                DELETE FROM market_data
                WHERE timestamp < NOW() - INTERVAL '${sql.raw(String(config.retentionDays))} days'
              `;

        await db.execute(deleteQuery);
        
        const duration = Date.now() - startTime;
        console.log(`\n✅ Pruning complete!`);
        console.log(`   Deleted: ${deleteCount.toLocaleString()} records`);
        console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);

    } catch (e) {
        console.error('\n❌ Pruning failed:', e);
        process.exit(1);
    }

    process.exit(0);
}

main();
