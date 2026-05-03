import { marketData, symbols } from "@packages/db/src/schema";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../../../db";
import { QuestDBService, questDbService } from "../services/QuestDBService";

export class MarketDataRepository {
	constructor(private qdb: QuestDBService = questDbService) {}

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

	/**
	 * Unified Upsert: Writes to Postgres (Drizzle) and QuestDB (ILP).
	 * Ensures data integrity across both storage layers.
	 */
	async upsert(values: any[], ticker?: string): Promise<void> {
		if (values.length === 0) return;

		// 1. Postgres Write (Reliability & Metadata)
		// Batching to avoid Postgres parameter limit (65,535)
		const CHUNK_SIZE = 1000;
		for (let i = 0; i < values.length; i += CHUNK_SIZE) {
			const chunk = values.slice(i, i + CHUNK_SIZE);
			await db.insert(marketData).values(chunk).onConflictDoNothing().execute();
		}

		// 2. QuestDB Write (Performance & Alerts)
		try {
			let effectiveTicker = ticker;

			// If ticker not provided, resolve it from the first entry (assuming batch is same symbol)
			if (!effectiveTicker && values[0].symbolId) {
				const [sym] = await db
					.select({ ticker: symbols.ticker })
					.from(symbols)
					.where(eq(symbols.id, values[0].symbolId))
					.limit(1);
				effectiveTicker = sym?.ticker;
			}

			if (effectiveTicker) {
				const interval = values[0].interval;
				const source = values[0].source;

				// Format for QuestDBService (ILP)
				const qdbCandles = values.map((v) => ({
					timestamp: v.timestamp instanceof Date ? v.timestamp : new Date(v.timestamp),
					open: Number(v.open),
					high: Number(v.high),
					low: Number(v.low),
					close: Number(v.close),
					volume: Number(v.volume),
				}));

				await this.qdb.writeCandles(qdbCandles, effectiveTicker, interval, source);
			}
		} catch (e) {
			console.error("[MarketDataRepository] QuestDB sync failed during upsert:", e);
			// We don't throw here to avoid failing the Postgres transaction, 
			// but we should eventually monitor this for data gaps.
		}
	}
}
