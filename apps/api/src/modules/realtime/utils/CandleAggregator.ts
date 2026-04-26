import type { OHLCVUpdate } from "../realtime.types";

/**
 * Aggregates ticks into candles (OHLCV) in real-time.
 */
export class CandleAggregator {
	private candles: Map<string, OHLCVUpdate> = new Map();

	/**
	 * Processes a new tick and returns an updated candle
	 */
	processTick(symbol: string, price: number, volume: number, timestamp: number, interval: string = "1m"): OHLCVUpdate {
		const intervalMs = this.getIntervalMs(interval);
		const candleTimestamp = Math.floor(timestamp / intervalMs) * intervalMs;
		const key = `${symbol}:${interval}`;

		let candle = this.candles.get(key);

		if (!candle || candle.timestamp !== candleTimestamp) {
			// New candle or first tick
			candle = {
				symbol,
				interval,
				timestamp: candleTimestamp,
				open: price,
				high: price,
				low: price,
				close: price,
				volume: volume,
				isClosed: false,
			};
		} else {
			// Update existing candle
			candle.high = Math.max(candle.high, price);
			candle.low = Math.min(candle.low, price);
			candle.close = price;
			candle.volume += volume;
		}

		this.candles.set(key, candle);
		return candle;
	}

	private getIntervalMs(interval: string): number {
		const unit = interval.slice(-1);
		const val = parseInt(interval.slice(0, -1), 10);

		switch (unit) {
			case "m":
				return val * 60 * 1000;
			case "h":
				return val * 60 * 60 * 1000;
			case "d":
				return val * 24 * 60 * 60 * 1000;
			default:
				return 60 * 1000; // Default 1m
		}
	}
}
