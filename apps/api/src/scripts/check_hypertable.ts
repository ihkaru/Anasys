import { sql } from "drizzle-orm";
import { db } from "./src/db";

const res = await db.execute(sql`SELECT * FROM timescaledb_information.hypertables;`);
console.log("Hypertables:", res);
process.exit(0);
