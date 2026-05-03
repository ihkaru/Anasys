/**
 * OHLCVLRUCache — In-process LRU cache for hot OHLCV data.
 *
 * Purpose: Deduplicate rapid successive QuestDB queries (e.g. React re-renders,
 * WS reconnects) without hitting the DB again within a short TTL window.
 *
 * NOT a long-term cache — TTL is intentionally short (30s).
 * Long-term persistence is QuestDB's responsibility.
 */

export interface CachedOHLCV {
	timestamp: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

interface CacheEntry {
	data: CachedOHLCV[];
	cachedAt: number;
}

export class OHLCVLRUCache {
	private readonly cache = new Map<string, CacheEntry>();
	private readonly MAX_ENTRIES: number;
	private readonly TTL_MS: number;

	constructor(maxEntries = 50, ttlMs = 30_000) {
		this.MAX_ENTRIES = maxEntries;
		this.TTL_MS = ttlMs;
	}

	/**
	 * Build a deterministic cache key.
	 * Format: TICKER:INTERVAL:SOURCE[:before_ISO]
	 */
	static makeKey(symbol: string, interval: string, source: string, before?: Date): string {
		const base = `${symbol.toUpperCase()}:${interval}:${source.toUpperCase()}`;
		return before ? `${base}:${before.toISOString()}` : base;
	}

	get(key: string): CachedOHLCV[] | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		// TTL check
		if (Date.now() - entry.cachedAt > this.TTL_MS) {
			this.cache.delete(key);
			return null;
		}

		// LRU: move to end (most recently used)
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.data;
	}

	set(key: string, data: CachedOHLCV[]): void {
		// Evict oldest if at capacity
		if (this.cache.size >= this.MAX_ENTRIES) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey) this.cache.delete(oldestKey);
		}

		this.cache.set(key, { data, cachedAt: Date.now() });
	}

	invalidate(symbol: string, interval: string, source: string): void {
		const prefix = `${symbol.toUpperCase()}:${interval}:${source.toUpperCase()}`;
		for (const key of this.cache.keys()) {
			if (key.startsWith(prefix)) {
				this.cache.delete(key);
			}
		}
	}

	get size(): number {
		return this.cache.size;
	}
}

// Singleton — shared across all requests in this Bun process
export const ohlcvLRUCache = new OHLCVLRUCache(50, 30_000);
