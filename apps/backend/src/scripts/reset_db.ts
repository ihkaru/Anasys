import { sql } from "drizzle-orm";
import { db } from "../db";

async function main() {
    console.log("🔥 Resetting Market Data...");
    await db.execute(sql`TRUNCATE TABLE market_data CASCADE;`);
    console.log("🔥 Resetting Symbols...");
    await db.execute(sql`TRUNCATE TABLE symbols CASCADE;`);
    console.log("✅ Database Reset Complete.");
    process.exit(0);
}

main();
