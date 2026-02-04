import type { OHLCV } from "../market.types";

export function calculateBasePrice(price?: number, change?: number): number | undefined {
	if (price != null && change != null) {
		return price - change;
	}
	return undefined;
}

export function deduplicateOHLCV(current: OHLCV[], newBatch: OHLCV[], _isAppend: boolean = false): OHLCV[] {
	if (current.length === 0) return newBatch;
	if (newBatch.length === 0) return current;

	// Map by timestamp for easier deduplication
	const map = new Map<string, OHLCV>();

	// Add logic based on merge direction or strictly overlap
	// Simple approach: combine and sort
	const all = [...current, ...newBatch];
	all.forEach((c) => {
		map.set(c.timestamp, c);
	});

	return Array.from(map.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * Merges new OHLCV data into existing array, handling overlaps efficiently
 * OPTIMIZED V2: Uses string comparison for ISO timestamps (no Date parsing!)
 * ISO 8601 timestamps like "2026-01-21T23:00:00.000Z" are lexicographically sortable
 */
export function mergeOHLCVData(current: OHLCV[], newData: OHLCV[], before?: boolean): OHLCV[] {
	if (before) {
		// Appending to history (older data)
		if (current.length === 0) return newData;

		const currentOldest = current[0]?.timestamp;
		if (!currentOldest) return newData;

		const uniqueData: OHLCV[] = [];
		for (let i = 0; i < newData.length; i++) {
			if (newData[i].timestamp < currentOldest) {
				uniqueData.push(newData[i]);
			}
		}

		return uniqueData.concat(current);
	} else {
		// Appending to future (newer data) or Full Replace if initial
		if (current.length > 0 && newData.length > 0) {
			const newStartTs = newData[0].timestamp;

			const olderData: OHLCV[] = [];
			for (let i = 0; i < current.length; i++) {
				if (current[i].timestamp < newStartTs) {
					olderData.push(current[i]);
				}
			}

			return olderData.concat(newData);
		}
		return newData;
	}
}
