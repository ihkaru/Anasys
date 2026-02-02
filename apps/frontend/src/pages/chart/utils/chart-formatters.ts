import type { Signal } from "../../../stores/market";

export interface OHLCVData {
	timestamp: string | Date;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface ChartCandle {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
}

/**
 * Get the offset in seconds between local time and a target timezone
 * Positive = target is ahead of local, Negative = target is behind local
 */
function getTimezoneOffsetSeconds(targetTz: string): number {
	const now = new Date();

	// Get local offset in minutes (negative = ahead of UTC)
	const localOffsetMin = now.getTimezoneOffset();

	// Get target timezone offset by comparing formatted times
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: targetTz,
		hour: "numeric",
		hour12: false,
	});

	const _targetHour = parseInt(formatter.format(now), 10);
	const _localHour = now.getHours();

	// This is a simple approximation - for more accuracy would need full date comparison
	// For EST/EDT, we just use known offset (-5/-4 from UTC)
	// Local offset is already in minutes from UTC, so we convert to seconds

	// For EST timezone specifically (America/New_York)
	const estOffsetMin =
		targetTz === "America/New_York"
			? now.toLocaleString("en-US", { timeZone: targetTz, timeZoneName: "short" }).includes("EDT")
				? 240
				: 300
			: 0;

	// Difference: how many minutes to shift local time to appear as EST
	const diffMin = localOffsetMin - estOffsetMin;
	return diffMin * 60; // Convert to seconds
}

export function formatOHLCVForChart(data: OHLCVData[], timezoneMode: "local" | "exchange" = "local"): ChartCandle[] {
	// Deduplicate using Map
	const dataMap = new Map<number, ChartCandle>();

	// Calculate timezone offset if needed
	const offsetSeconds = timezoneMode === "exchange" ? getTimezoneOffsetSeconds("America/New_York") : 0;

	data.forEach((d) => {
		let time = new Date(d.timestamp).getTime() / 1000;

		// Apply timezone shift for display
		time += offsetSeconds;

		dataMap.set(time, {
			time,
			open: d.open,
			high: d.high,
			low: d.low,
			close: d.close,
		});
	});

	// Sort by time
	return Array.from(dataMap.values()).sort((a, b) => a.time - b.time);
}

export function formatSignalMarkers(signals: Signal[], timezoneMode: "local" | "exchange" = "local") {
	const offsetSeconds = timezoneMode === "exchange" ? getTimezoneOffsetSeconds("America/New_York") : 0;

	return signals.map((signal) => ({
		time: new Date(signal.timestamp).getTime() / 1000 + offsetSeconds,
		position: signal.type === "BUY" ? ("belowBar" as const) : ("aboveBar" as const),
		color: signal.type === "BUY" ? "#10b981" : "#ef4444",
		shape: signal.type === "BUY" ? ("arrowUp" as const) : ("arrowDown" as const),
		text: signal.type,
	}));
}
