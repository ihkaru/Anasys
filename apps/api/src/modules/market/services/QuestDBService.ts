import { performance } from "node:perf_hooks";
import { Logger } from "../../../utils/logger";

const logger = new Logger("QuestDBService");

export interface QuestDBResponse {
	query: string;
	columns: { name: string; type: string }[];
	dataset: any[][];
	count: number;
}

export interface QuestDBCandle {
	timestamp: string;
	open: number;
	high: number;
	low: number;
	close: number;
	adj_close: number;
	volume: number;
}

export class QuestDBService {
	private baseUrl: string;

	constructor() {
		this.baseUrl = process.env.QUESTDB_URL || "http://questdb:9000";
	}

	async query(sql: string): Promise<QuestDBResponse> {
		try {
			const start = performance.now();
			const url = `${this.baseUrl}/exec?query=${encodeURIComponent(sql)}`;
			const response = await fetch(url);
			const end = performance.now();

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`QuestDB error (${response.status}): ${errorText}`);
			}

			const data = (await response.json()) as QuestDBResponse;
			logger.debug(
				`[QuestDB Query] ${sql.trim().split("\n")[0]}... took ${(end - start).toFixed(2)}ms (${data.count} rows)`,
			);
			return data;
		} catch (error) {
			logger.error(`Query failed: ${sql}`, error);
			throw error;
		}
	}

	/**
	 * Formats raw QuestDB dataset into array of objects using column names
	 */
	formatResult<T>(response: QuestDBResponse): T[] {
		const { columns, dataset } = response;
		return dataset.map((row) => {
			const obj: any = {};
			columns.forEach((col, index) => {
				obj[col.name] = row[index];
			});
			return obj as T;
		});
	}

	/**
	 * Write OHLCV candles to QuestDB via ILP (InfluxDB Line Protocol).
	 * ILP is the fastest write path — bypasses SQL parsing overhead.
	 * Timestamp must be in nanoseconds for ILP.
	 */
	async writeCandles(
		candles: {
			timestamp: Date;
			open: number;
			high: number;
			low: number;
			close: number;
			adj_close: number;
			volume: number;
		}[],
		symbol: string,
		interval: string,
		source: string,
	): Promise<void> {
		if (candles.length === 0) return;

		// Escape tag values (no spaces, commas, or equals in ILP tags)
		const safeSymbol = symbol.replace(/[,= ]/g, "_");
		const safeInterval = interval.replace(/[,= ]/g, "_");
		const safeSource = source.replace(/[,= ]/g, "_");

		const lines = candles.map((c) => {
			const tsNs = BigInt(c.timestamp.getTime()) * 1_000_000n; // ms → ns
			return (
				`candles,symbol=${safeSymbol},interval=${safeInterval},source=${safeSource} ` +
				`open=${c.open},high=${c.high},low=${c.low},close=${c.close},adj_close=${c.adj_close},volume=${c.volume} ${tsNs}`
			);
		});

		const body = lines.join("\n");

		try {
			const res = await fetch(`${this.baseUrl}/write`, {
				method: "POST",
				body,
				headers: { "Content-Type": "text/plain" },
			});

			if (!res.ok) {
				const err = await res.text();
				throw new Error(`QuestDB ILP write failed (${res.status}): ${err}`);
			}

			logger.debug(`[QuestDB ILP] Wrote ${candles.length} candles for ${symbol}/${interval}/${source}`);
		} catch (error) {
			logger.error(`[QuestDB ILP] Write failed for ${symbol}/${interval}/${source}`, error);
			throw error;
		}
	}

	/**
	 * Query OHLCV candles from QuestDB with full filter support.
	 * Primary serving path — replaces Postgres market_data for OHLCV.
	 */
	async getCandles(
		symbol: string,
		interval: string,
		source: string,
		limit: number,
		before?: Date,
	): Promise<QuestDBCandle[]> {
		const safeSymbol = symbol.replace(/'/g, "''");
		const safeInterval = interval.replace(/'/g, "''");
		const safeSource = source.replace(/'/g, "''");

		let sql = `
			SELECT timestamp, open, high, low, close, adj_close, volume
			FROM candles
			WHERE symbol = '${safeSymbol}'
			AND interval = '${safeInterval}'
			AND source = '${safeSource}'
		`;

		if (before) {
			sql += ` AND timestamp < '${before.toISOString()}'`;
		}

		sql += ` ORDER BY timestamp DESC LIMIT ${limit};`;

		try {
			const response = await this.query(sql);
			const rows = this.formatResult<QuestDBCandle>(response);
			// Chart needs ASC order — reverse the DESC result
			return rows.reverse();
		} catch (err) {
			logger.error(`[QuestDB] getCandles failed for ${symbol}/${interval}/${source}`, err);
			return [];
		}
	}

	/**
	 * Get the timestamp of the latest candle for a symbol/interval/source.
	 * Used for forward fill in SyncService.
	 */
	async getLastTimestamp(symbol: string, interval: string, source: string): Promise<Date | null> {
		const safeSymbol = symbol.replace(/'/g, "''");
		const safeInterval = interval.replace(/'/g, "''");
		const safeSource = source.replace(/'/g, "''");

		const sql = `
			SELECT timestamp
			FROM candles
			WHERE symbol = '${safeSymbol}'
			AND interval = '${safeInterval}'
			AND source = '${safeSource}'
			ORDER BY timestamp DESC
			LIMIT 1;
		`;

		try {
			const response = await this.query(sql);
			const rows = this.formatResult<{ timestamp: string }>(response);
			if (rows.length > 0) {
				return new Date(rows[0].timestamp);
			}
			return null;
		} catch (err) {
			logger.error(`[QuestDB] getLastTimestamp failed for ${symbol}/${interval}/${source}`, err);
			return null;
		}
	}

	/**
	 * Reset the QuestDB candles table.
	 * USE WITH CAUTION: This wipes all OHLCV data from QuestDB.
	 */
	async dropAndRecreateTable(): Promise<boolean> {
		try {
			logger.warn("Dropping and recreating QuestDB candles table...");

			// Drop table if exists
			try {
				await this.query("DROP TABLE candles;");
			} catch (e) {
				logger.warn("Table candles might not exist or failed to drop", e);
			}

			// Create table with Deduplication Enabled
			const createSql = `
				CREATE TABLE candles (
					symbol SYMBOL,
					interval SYMBOL,
					source SYMBOL,
					open DOUBLE,
					high DOUBLE,
					low DOUBLE,
					close DOUBLE,
					adj_close DOUBLE,
					volume DOUBLE,
					timestamp TIMESTAMP
				) timestamp (timestamp) PARTITION BY MONTH WAL
				DEDUPLICATE UPSERT KEYS (symbol, interval, source, timestamp);
			`;
			await this.query(createSql);

			logger.info("Successfully recreated candles table with DEDUPLICATE enabled");
			return true;
		} catch (error) {
			logger.error("Failed to drop and recreate candles table", error);
			return false;
		}
	}
}

export const questDbService = new QuestDBService();
