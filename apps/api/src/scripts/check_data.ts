import { marketData } from "@packages/db/src/schema";
import { count } from "drizzle-orm";
import { db } from "../db";

const res = await db.select({ count: count() }).from(marketData);
console.log("Market Data Count:", res[0].count);
process.exit(0);
