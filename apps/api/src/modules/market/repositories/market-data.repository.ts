import { marketData } from "@packages/db/src/schema";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../../../db";

export class MarketDataRepository {
	async getLatestCandles(symbolIds: number[], interval: string, limit: number): Promise<any[]> {
		const query = sql`
            SELECT symbol_id, close, timestamp
            FROM (
                SELECT 
                    symbol_id, 
                    close, 
                    timestamp,
                    ROW_NUMBER() OVER (PARTITION BY symbol_id ORDER BY timestamp DESC) as rn
                FROM market_data
                WHERE symbol_id IN ${symbolIds} AND interval = ${interval}
            ) sub
            WHERE rn <= ${limit}
        `;
		return await db.execute(query);
	}

	async getRawCandles(
		symbolId: number,
		interval: string,
		limit: number,
		before?: Date,
		source: string = "YAHOO",
	): Promise<any[]> {
		const whereClause = [
			eq(marketData.symbolId, symbolId),
			eq(marketData.interval, interval),
			eq(marketData.source, source),
		];

		if (before) {
			whereClause.push(lt(marketData.timestamp, before));
		}

		return await db
			.select()
			.from(marketData)
			.where(and(...whereClause))
			.orderBy(desc(marketData.timestamp))
			.limit(limit);
	}

	async getDownsampled(symbolId: number, resolution: string, limit: number): Promise<any[]> {
		const query = sql`
            SELECT 
                time_bucket(${resolution}::interval, timestamp) AS bucket,
                first(open, timestamp) as open,
                max(high) as high,
                min(low) as low,
                last(close, timestamp) as close,
                sum(volume) as volume
            FROM market_data
            WHERE symbol_id = ${symbolId}
            GROUP BY bucket
            ORDER BY bucket DESC
            LIMIT ${limit}
        `;
		return await db.execute(query);
	}

	async getLastTimestamp(symbolId: number, interval: string, source: string = "YAHOO"): Promise<Date | null> {
		const result: any[] = await db.execute(sql`
            SELECT timestamp FROM market_data 
            WHERE symbol_id = ${symbolId} AND interval = ${interval} AND source = ${source}
            ORDER BY timestamp DESC
            LIMIT 1
         `);
		const lastEntry = result[0];
		return lastEntry ? new Date(lastEntry.timestamp) : null;
	}

	async getRecentCandles(symbolId: number, interval: string, limit: number): Promise<any[]> {
		return await db
			.select()
			.from(marketData)
			.where(and(eq(marketData.symbolId, symbolId), eq(marketData.interval, interval)))
			.orderBy(desc(marketData.timestamp))
			.limit(limit);
	}

	async upsert(values: any[]): Promise<void> {
		await db.insert(marketData).values(values).onConflictDoNothing().execute();
	}
}
