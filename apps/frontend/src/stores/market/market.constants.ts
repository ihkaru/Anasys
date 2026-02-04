import type { Strategy } from "./market.types";

export const STRATEGIES: Strategy[] = [
	{
		id: "SMA_CROSSOVER",
		name: "SMA Crossover",
		description: "Golden Cross / Death Cross using Simple Moving Averages",
		params: [
			{ key: "shortPeriod", label: "Short Period", default: 9 },
			{ key: "longPeriod", label: "Long Period", default: 21 },
		],
	},
	// Future strategies can be added here
];

export const OVERVIEW_CACHE_TTL_MS = 30 * 1000; // 30 seconds
