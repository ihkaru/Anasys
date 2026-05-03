export interface Symbol {
	id: number;
	ticker: string;
	name: string;
	type: "STOCK" | "CRYPTO";
	description?: string;
	sector?: string;
	industry?: string;
	website?: string;
	country?: string;
	iconUrl?: string;
	provider?: string;
	exchange?: string;
	source?: string;
}

export interface OHLCV {
	timestamp: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	source?: string;
}

export interface Signal {
	timestamp: string;
	type: "BUY" | "SELL" | "HOLD";
	price: number;
	reason: string;
}

export interface Strategy {
	id: string;
	name: string;
	description: string;
	params: { key: string; label: string; default: number }[];
}

export interface MarketMover extends Symbol {
	price: number;
	change?: number;
	changePercent: number;
	volume?: number;
	sparkline?: number[];
	marketState?: "PRE" | "REGULAR" | "POST" | "POSTPOST" | "CLOSED";
	preMarketPrice?: number;
	preMarketChange?: number;
	preMarketChangePercent?: number;
	postMarketPrice?: number;
	postMarketChange?: number;
	postMarketChangePercent?: number;
	period?: string;
	periodBasePrice?: number;
}
