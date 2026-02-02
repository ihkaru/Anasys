
import { sql } from 'drizzle-orm';
import { db } from '../db';

async function checkPK() {
    console.log("Checking PKs...");
    try {
        const pks = await db.execute(sql`
            SELECT conname 
            FROM pg_constraint 
            WHERE conrelid = 'market_data'::regclass AND contype = 'p'
        `);
        console.log("PK Constraints:", pks);
    } catch(e) {
        console.log(e);
    }
    process.exit(0);
}
checkPK();
