
import { sql } from "drizzle-orm";
import { db } from "../db";

async function main() {
    console.log("⚙️ Setting up TimescaleDB...");
    try {
        // Enable Extension
        console.log("Enable Extension...");
        await db.execute(sql`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`);

        // Convert to Hypertable
        // We need to check if it's already a hypertable to avoid errors
        // or just use if_not_exists option (if available in create_hypertable, yes it is)
        
        console.log("Converting market_data to hypertable...");
        // chunk_time_interval: 1 day (default is 7 days, but for 1m data maybe 1 day or 1 week is fine)
        // Let's stick to default or explicit 1 week.
        await db.execute(sql`SELECT create_hypertable('market_data', 'timestamp', if_not_exists => TRUE);`);
        
        console.log("✅ TimescaleDB setup complete.");
        process.exit(0);
    } catch (e: any) {
        if (e.message.includes("already a hypertable")) {
            console.log("✅ Already a hypertable.");
            process.exit(0);
        }
        console.error("❌ Failed to setup TimescaleDB:", e);
        process.exit(1);
    }
}

main();
