import { sma } from "@ixjb94/indicators";
import * as df from "danfojs-node";

export type OHLCV = {
	timestamp: Date;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
};

export type Signal = {
	timestamp: Date;
	type: "BUY" | "SELL" | "HOLD";
	price: number;
	reason: string;
};

// Convert raw data to DataFrame
export const toDataFrame = (data: OHLCV[]): df.DataFrame => {
	const json = data.map((d) => ({
		timestamp: d.timestamp, // string or date
		open: d.open,
		high: d.high,
		low: d.low,
		close: d.close,
		volume: d.volume,
	}));
	return new df.DataFrame(json);
};

// Example Strategy: Simple Moving Average Crossover
export const strategySMA = (data: OHLCV[], shortPeriod = 9, longPeriod = 21): Signal[] => {
	if (data.length < longPeriod) return [];

	// Sort ascending by time
	const sorted = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	// Extract close prices
	const closePrices = sorted.map((d) => d.close);

	// Calculate Indicators using @ixjb94/indicators (it's lightweight/fast)
	// Note: Library expects array of numbers
	const smaShort = (sma as any)(closePrices, shortPeriod);
	const smaLong = (sma as any)(closePrices, longPeriod);

	// Align arrays: indicators result is shorter than input by (period - 1)
	// We want to iterate from the end to find latest signals

	const signals: Signal[] = [];

	// Simple logic: checking last candle for crossover
	// Real logic would iterate through history

	// Let's just return the last signal for now or full history?
	// Let's compute full history of signals for backtest

	// The indicators array starts from index (period-1).
	// e.g. if length=100, period=10, result length=91. result[0] corresponds to input[9].

	const diffShort = sorted.length - smaShort.length;
	const diffLong = sorted.length - smaLong.length;

	// We can only check when both available
	const startIndex = Math.max(diffShort, diffLong);

	let position: "NONE" | "LONG" = "NONE";

	for (let i = startIndex; i < sorted.length; i++) {
		// Map back to indicator index
		const idxShort = i - diffShort;
		const idxLong = i - diffLong;

		const shortVal = smaShort[idxShort];
		const longVal = smaLong[idxLong];

		// Previous period check for crossover
		if (i > startIndex) {
			const prevShort = smaShort[idxShort - 1];
			const prevLong = smaLong[idxLong - 1];

			// Check undefined
			if (shortVal === undefined || longVal === undefined || prevShort === undefined || prevLong === undefined)
				continue;

			// Golden Cross (Short crosses above Long)
			const currentCandle = sorted[i];
			if (currentCandle && prevShort <= prevLong && shortVal > longVal && position !== "LONG") {
				signals.push({
					timestamp: currentCandle.timestamp,
					type: "BUY",
					price: currentCandle.close,
					reason: `Golden Cross (SMA ${shortPeriod} > ${longPeriod})`,
				});
				position = "LONG";
			}

			// Death Cross (Short crosses below Long)
			else if (currentCandle && prevShort >= prevLong && shortVal < longVal && position === "LONG") {
				signals.push({
					timestamp: currentCandle.timestamp,
					type: "SELL",
					price: currentCandle.close,
					reason: `Death Cross (SMA ${shortPeriod} < ${longPeriod})`,
				});
				position = "NONE";
			}
		}
	}

	return signals;
};
