
import { sql } from 'drizzle-orm';
import { db } from '../db';

async function check() {
    console.log("=== Checking DB State (v2) ===");
    
    // Check column existence
    try {
        const cols = await db.execute(sql`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'market_data' AND column_name = 'source'
        `);
        console.log("1. Column 'source':", cols.length > 0 ? "EXISTS" : "MISSING", cols.map(c => ({name: c.column_name, type: c.data_type, null: c.is_nullable})));
    } catch (e) { console.log("Check column failed:", e); }

    // Check NULLs
    try {
        const nulls = await db.execute(sql`SELECT count(*) as count FROM market_data WHERE source IS NULL`);
        console.log("2. NULL source count:", nulls[0].count);
    } catch (e) { console.log("Check nulls failed:", e); }

    // Check Duplicates
    try {
        const duplicates = await db.execute(sql`
            SELECT symbol_id, timestamp, interval, source, count(*) 
            FROM market_data 
            GROUP BY symbol_id, timestamp, interval, source 
            HAVING count(*) > 1 
            LIMIT 5
        `);
        console.log("3. Duplicates found:", duplicates.length);
        if (duplicates.length > 0) console.log(duplicates);
    } catch (e) { console.log("Check duplicates failed:", e); }
    
    // Check Constraints
    try {
        const cons = await db.execute(sql`
            SELECT conname, contype 
            FROM pg_constraint 
            WHERE conrelid = 'market_data'::regclass
        `);
        console.log("4. Constraints:", cons.map(c => ({name: c.conname, type: c.contype})));
    } catch(e) { console.log("Check constraints failed:", e); }

    process.exit(0);
}

check();
