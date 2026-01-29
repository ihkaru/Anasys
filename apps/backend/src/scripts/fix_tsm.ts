
import { sql } from "drizzle-orm";
import { db } from "../db";
import { marketService } from "../modules/market/market.service";

async function fixTSM() {
    console.log("🛠️ Starting TSM Repair...");
    
    // 1. Force Sync Daily
    console.log("⏳ Syncing TSM (1d)...");
    try {
        const result1d = await marketService.syncSymbolData('TSM', 'STOCK', '1d');
        console.log("✅ TSM (1d) Sync Result:", result1d);
    } catch (e) {
        console.error("❌ TSM (1d) Sync Failed:", e);
    }

    // 2. Force Sync Hourly
    console.log("⏳ Syncing TSM (1h)...");
    try {
        const result1h = await marketService.syncSymbolData('TSM', 'STOCK', '1h');
        console.log("✅ TSM (1h) Sync Result:", result1h);
    } catch (e) {
        console.error("❌ TSM (1h) Sync Failed:", e);
    }

    // 3. Inspect New Data
    console.log("🔍 Inspecting New Data...");
    try {
        const symbolResult = await db.execute(sql`SELECT id FROM symbols WHERE ticker = 'TSM'`);
        if (symbolResult.length > 0) {
            const symbolId = symbolResult[0].id;
            const data = await db.execute(sql`
                SELECT * FROM market_data 
                WHERE symbol_id = ${symbolId} AND interval = '1d'
                ORDER BY timestamp DESC 
                LIMIT 5
            `);
            console.table(data);
        }
    } catch (e) {
        console.error("❌ Inspection Failed:", e);
    }

    process.exit(0);
}

fixTSM();
