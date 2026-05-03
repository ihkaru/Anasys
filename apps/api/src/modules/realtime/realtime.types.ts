import type { ServerWebSocket } from "bun";

export type SubscriptionType = "quote" | "ohlcv";

export interface Subscription {
	symbol: string;
	type: SubscriptionType;
	interval?: string; // For OHLCV: 1m, 5m, 15m, 1h, etc.
}

export interface ClientState {
	ws: ServerWebSocket<any>;
	userId?: number;
	subscriptions: Set<string>; // "quote:AAPL", "ohlcv:BTC-USD:1m"
	lastPing: number;
}

export interface WsMessage {
	type: "subscribe" | "unsubscribe" | "ping";
	symbols?: string[];
	channel?: "quote" | "ohlcv";
	interval?: string;
	source?: string; // YAHOO, TRADINGVIEW, etc.
}

export interface QuoteUpdate {
	symbol: string;
	price: number;
	change: number;
	changePercent: number;
	volume?: number;
	timestamp: number;
}

export interface OHLCVUpdate {
	symbol: string;
	interval: string;
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	isClosed: boolean; // True if candle is finalized
}
