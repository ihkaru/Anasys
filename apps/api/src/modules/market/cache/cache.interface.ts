export interface CacheEntry<T = unknown> {
	data: T;
	expiresAt: number;
}

export interface ICache {
	get<T>(key: string): T | null | Promise<T | null>;
	set<T>(key: string, value: T, ttl: number): void | Promise<void>;
	invalidate(key: string): void | Promise<void>;
	clear(): void | Promise<void>;
}
