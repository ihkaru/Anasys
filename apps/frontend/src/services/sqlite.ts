import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { createLogger } from '../utils/logger';

export const sqliteConnection = new SQLiteConnection(CapacitorSQLite);

export class SQLiteService {
    db: SQLiteDBConnection | null = null;
    dbName = 'finance_db_v2'; // Bump version to force fresh DB
    private logger = createLogger('SQLite');

    constructor() {
    }

    async init() {
        if(this.db) {
            this.logger.debug("Already initialized, returning existing db");
            return this.db;
        }

        this.logger.info("Initializing...");

        if (!Capacitor.isNativePlatform()) {
             // Web specific setup: Create jeep-sqlite element if not exists
             const jeepEl = document.querySelector('jeep-sqlite');
             if(!jeepEl) {
                 this.logger.debug("Creating jeep-sqlite element");
                 const jeepSqlite = document.createElement('jeep-sqlite');
                 document.body.appendChild(jeepSqlite);
                 await customElements.whenDefined('jeep-sqlite');
             }
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
            try { await sqliteConnection.closeConnection(this.dbName, false); } catch {}
            
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
        if(!this.db) return;
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
                PRIMARY KEY (symbol, interval, timestamp)
            );
            CREATE INDEX IF NOT EXISTS idx_ohlcv_query ON ohlcv(symbol, interval, timestamp DESC);

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

    // OHLCV Cache
    async saveOHLCV(symbol: string, interval: string, data: any[]) {
        if(!this.db) await this.init();
        if (data.length === 0) return;

        // Use transaction for batch insert
        const statements = data.map(d => {
            return `INSERT OR REPLACE INTO ohlcv (symbol, interval, timestamp, open, high, low, close, volume) 
                    VALUES ('${symbol}', '${interval}', ${new Date(d.timestamp).getTime()}, ${d.open}, ${d.high}, ${d.low}, ${d.close}, ${d.volume});`;
        }).join('\n');
        
        await this.db?.execute(statements);
        
        if (!Capacitor.isNativePlatform()) {
             await sqliteConnection.saveToStore(this.dbName);
        }
    }

    async getOHLCV(symbol: string, interval: string, limit: number, before?: number) {
        if(!this.db) await this.init();
        let sql = `SELECT * FROM ohlcv WHERE symbol = ? AND interval = ?`;
        const params: any[] = [symbol, interval];
        
        if (before) {
            sql += ` AND timestamp < ?`;
            params.push(before);
        }
        
        sql += ` ORDER BY timestamp DESC LIMIT ?;`;
        params.push(limit);

        const res = await this.db?.query(sql, params);
        if (res?.values) {
            // DB returns DESC (Newest first) because of LIMIT
            // But Chart needs ASC (Oldest first)
            // So we map then reverse
            return res.values.map(v => ({
                timestamp: new Date(v.timestamp).toISOString(),
                open: v.open,
                high: v.high,
                low: v.low,
                close: v.close,
                volume: v.volume
            })).reverse();
        }
        return [];
    }

    // Symbol Data Cache (Financials, Earnings, etc)
    async saveSymbolCache(symbol: string, type: 'financials' | 'earnings' | 'analyst' | 'recommendations' | 'quote' | 'symbol_details', data: any) {
        if(!this.db) await this.init();
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
        if(!this.db) await this.init();
        try {
            // Check if data exists and is not expired
            const cutoff = Date.now() - (ttlMinutes * 60 * 1000);
            const sql = `SELECT data FROM symbol_cache WHERE symbol = ? AND type = ? AND updated_at > ?`;
            const res = await this.db?.query(sql, [symbol, type, cutoff]);
            
            if(res?.values && res.values.length > 0) {
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
            await this.db?.execute("DROP TABLE IF EXISTS settings; DROP TABLE IF EXISTS ohlcv; DROP TABLE IF EXISTS symbol_cache;");
            
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
        if(!this.db) await this.init();
        const sql = `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);`;
        await this.db?.run(sql, [key, value]);
        if (!Capacitor.isNativePlatform()) {
             await sqliteConnection.saveToStore(this.dbName);
             this.logger.debug(`Saved ${key} to store`);
        }
    }

    async getItem(key: string) {
        if(!this.db) await this.init();
        const sql = `SELECT value FROM settings WHERE key = ?;`;
        const res = await this.db?.query(sql, [key]);
        this.logger.debug(`getItem('${key}') result:`, res);
        if(res?.values && res.values.length > 0) {
            return res.values[0].value;
        }
        return null;
    }

    async removeItem(key: string) {
        if(!this.db) await this.init();
        const sql = `DELETE FROM settings WHERE key = ?;`;
        await this.db?.run(sql, [key]);
        if (!Capacitor.isNativePlatform()) await sqliteConnection.saveToStore(this.dbName);
    }
}

export const sqliteService = new SQLiteService();
