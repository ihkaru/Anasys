import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";
import { createLogger } from "../utils/logger";

export const sqliteConnection = new SQLiteConnection(CapacitorSQLite);

export class SQLiteService {
	db: SQLiteDBConnection | null = null;
	dbName = "finance_db_v5"; // Bump version to force fresh DB and clear 1M vs 1d cache conflicts
	private logger = createLogger("SQLite");

	async init() {
		if (this.db) {
			this.logger.debug("Already initialized, returning existing db");
			return this.db;
		}

		this.logger.info("Initializing...");

		if (!Capacitor.isNativePlatform()) {
			// Web specific setup: Ensure jeep-sqlite element exists and is defined
			let jeepEl = document.querySelector("jeep-sqlite");
			if (!jeepEl) {
				this.logger.debug("Creating jeep-sqlite element");
				jeepEl = document.createElement("jeep-sqlite");
				document.body.appendChild(jeepEl);
			}

			// Always wait for the element to be defined by the custom elements registry
			this.logger.debug("Waiting for jeep-sqlite to be defined...");
			await customElements.whenDefined("jeep-sqlite");

			this.logger.debug("Calling initWebStore...");
			await sqliteConnection.initWebStore();
			this.logger.debug("Web Store Initialized");
		}

		const ret = await sqliteConnection.checkConnectionsConsistency();
		this.logger.debug("checkConnectionsConsistency:", ret);

		const isConn = (await sqliteConnection.isConnection(this.dbName, false)).result;
		this.logger.debug("isConnection:", isConn);

		if (ret.result && isConn) {
			this.logger.debug("Retrieving existing connection");
			this.db = await sqliteConnection.retrieveConnection(this.dbName, false);
		} else {
			this.logger.debug("Creating new connection");
			// Safety: Try to close just in case
			try {
				await sqliteConnection.closeConnection(this.dbName, false);
			} catch {}

			this.db = await sqliteConnection.createConnection(this.dbName, false, "no-encryption", 1, false);
		}

		await this.db.open();
		this.logger.info("Database opened");

		// Initialize Tables
		await this.createTables();
		this.logger.info("Tables created/verified");

		return this.db;
	}

	async createTables() {
		if (!this.db) return;
		const schema = `
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY NOT NULL,
                key TEXT UNIQUE NOT NULL,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS ohlcv (
                symbol TEXT NOT NULL,
                interval TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                volume REAL,
                source TEXT NOT NULL DEFAULT 'YAHOO',
                PRIMARY KEY (symbol, interval, timestamp, source)
            );
            CREATE INDEX IF NOT EXISTS idx_ohlcv_query ON ohlcv(symbol, interval, source, timestamp DESC);

            CREATE TABLE IF NOT EXISTS symbol_cache (
                symbol TEXT NOT NULL,
                type TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (symbol, type)
            );
        `;
		await this.db.execute(schema);
	}

	// Debounced saveToStore to prevent blocking on every write
	private saveToStoreTimeout: ReturnType<typeof setTimeout> | null = null;
	private debouncedSaveToStore() {
		if (this.saveToStoreTimeout) {
			clearTimeout(this.saveToStoreTimeout);
		}
		this.saveToStoreTimeout = setTimeout(async () => {
			if (!Capacitor.isNativePlatform()) {
				await sqliteConnection.saveToStore(this.dbName);
			}
		}, 1000); // Debounce 1 second
	}

	// OHLCV Cache - OPTIMIZED with batching
	async saveOHLCV(symbol: string, interval: string, data: any[]) {
		if (!this.db) await this.init();
		if (data.length === 0) return;

		const saveStart = performance.now();
		const BATCH_SIZE = 50; // Process in smaller batches
		const batches: string[][] = [];

		// Split into batches
		for (let i = 0; i < data.length; i += BATCH_SIZE) {
			const batch = data.slice(i, i + BATCH_SIZE);
			const statements = batch.map((d) => {
				const source = d.source || "YAHOO";
				return `INSERT OR REPLACE INTO ohlcv (symbol, interval, timestamp, open, high, low, close, volume, source) 
                    VALUES ('${symbol}', '${interval}', ${new Date(d.timestamp).getTime()}, ${d.open}, ${d.high}, ${d.low}, ${d.close}, ${d.volume}, '${source}');`;
			});
			batches.push(statements);
		}

		// Execute batches with yielding to main thread
		for (let i = 0; i < batches.length; i++) {
			await this.db?.execute(batches[i].join("\n"));
			// Yield to main thread between batches
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		this.logger.debug(`[SQLite] saveOHLCV ${symbol}/${interval}: ${data.length} rows in ${Math.round(performance.now() - saveStart)}ms`);

		// Debounced save to store (non-blocking)
		this.debouncedSaveToStore();
	}

	async getOHLCV(symbol: string, interval: string, limit: number, before?: number, source: string = "YAHOO") {
		if (!this.db) await this.init();
		let sql = `SELECT * FROM ohlcv WHERE symbol = ? AND interval = ? AND source = ?`;
		const params: any[] = [symbol, interval, source];

		if (before) {
			sql += ` AND timestamp < ?`;
			params.push(before);
		}

		sql += ` ORDER BY timestamp DESC LIMIT ?;`;
		params.push(limit);

		// === DEBUG ===
		this.logger.info(`🔍 [SQLite] getOHLCV query for symbol="${symbol}", interval="${interval}"`);

		const res = await this.db?.query(sql, params);
		if (res?.values) {
			// === DEBUG: Log what SQLite returns ===
			this.logger.info(`🔍 [SQLite] Found ${res.values.length} rows`);
			if (res.values.length > 0) {
				const sample = res.values.slice(0, 3);
				sample.forEach((v, i) => {
					const ts = new Date(v.timestamp);
					this.logger.info(
						`   SQLite[${i}]: ts=${v.timestamp} -> ${ts.toISOString()} minute=${ts.getMinutes()} interval="${v.interval}"`,
					);
				});
			}

			// DB returns DESC (Newest first) because of LIMIT
			// But Chart needs ASC (Oldest first)
			// So we map then reverse
			return res.values
				.map((v) => ({
					timestamp: new Date(v.timestamp).toISOString(),
					open: v.open,
					high: v.high,
					low: v.low,
					close: v.close,
					volume: v.volume,
				}))
				.reverse();
		}
		return [];
	}

	// Symbol Data Cache (Financials, Earnings, etc)
	// Note: type accepts string to allow dynamic keys like 'quote_YAHOO', 'quote_TRADINGVIEW'
	async saveSymbolCache(symbol: string, type: string, data: any) {
		if (!this.db) await this.init();
		// Don't save null/undefined data
		if (data === null || data === undefined) {
			this.logger.debug(`Skipping cache save for ${type}/${symbol}: data is null`);
			return;
		}
		try {
			const sql = `INSERT OR REPLACE INTO symbol_cache (symbol, type, data, updated_at) VALUES (?, ?, ?, ?)`;
			const json = JSON.stringify(data);
			const now = Date.now();
			await this.db?.run(sql, [symbol, type, json, now]);

			if (!Capacitor.isNativePlatform()) {
				await sqliteConnection.saveToStore(this.dbName);
			}
		} catch (e) {
			this.logger.error(`Failed to save cache ${type} for ${symbol}`, e);
		}
	}

	async getSymbolCache(symbol: string, type: string, ttlMinutes: number = 60) {
		if (!this.db) await this.init();
		try {
			// Check if data exists and is not expired
			const cutoff = Date.now() - ttlMinutes * 60 * 1000;
			const sql = `SELECT data FROM symbol_cache WHERE symbol = ? AND type = ? AND updated_at > ?`;
			const res = await this.db?.query(sql, [symbol, type, cutoff]);

			if (res?.values && res.values.length > 0) {
				return JSON.parse(res.values[0].data);
			}
		} catch (e) {
			this.logger.warn(`Failed to read cache ${type} for ${symbol}`, e);
		}
		return null; // Expired or not found
	}

	async clearDatabase() {
		try {
			if (!this.db) await this.init();

			// Drop Tables to clear data
			await this.db?.execute(
				"DROP TABLE IF EXISTS settings; DROP TABLE IF EXISTS ohlcv; DROP TABLE IF EXISTS symbol_cache;",
			);

			// Save empty state to store for Web
			if (!Capacitor.isNativePlatform()) {
				await sqliteConnection.saveToStore(this.dbName);
			}

			this.logger.warn("Database cleared");
			window.location.reload(); // Reload to reset app state
		} catch (error) {
			this.logger.error("Failed to clear database", error);
			throw error;
		}
	}

	// Key-Value Store Helpers
	async setItem(key: string, value: string) {
		if (!this.db) await this.init();
		const sql = `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);`;
		await this.db?.run(sql, [key, value]);
		if (!Capacitor.isNativePlatform()) {
			await sqliteConnection.saveToStore(this.dbName);
			this.logger.debug(`Saved ${key} to store`);
		}
	}

	async getItem(key: string) {
		if (!this.db) await this.init();
		const sql = `SELECT value FROM settings WHERE key = ?;`;
		const res = await this.db?.query(sql, [key]);
		this.logger.debug(`getItem('${key}') result:`, res);
		if (res?.values && res.values.length > 0) {
			return res.values[0].value;
		}
		return null;
	}

	async removeItem(key: string) {
		if (!this.db) await this.init();
		const sql = `DELETE FROM settings WHERE key = ?;`;
		await this.db?.run(sql, [key]);
		if (!Capacitor.isNativePlatform()) await sqliteConnection.saveToStore(this.dbName);
	}
}

export const sqliteService = new SQLiteService();
