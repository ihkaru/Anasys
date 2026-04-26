import type { CacheEntry, ICache } from "./cache.interface";

export class CacheService implements ICache {
	private cache: Map<string, CacheEntry> = new Map();

	get<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;
		if (this.isExpired(entry)) {
			this.cache.delete(key);
			return null;
		}
		return entry.data as T;
	}

	set<T>(key: string, value: T, ttl: number): void {
		this.cache.set(key, {
			data: value,
			expiresAt: Date.now() + ttl,
		});
	}

	invalidate(key: string): void {
		this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}

	private isExpired(entry: CacheEntry): boolean {
		return Date.now() > entry.expiresAt;
	}
}
