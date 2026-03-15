import { Logger } from "../../../utils/logger";
import type { Broadcaster } from "../broadcasting/Broadcaster";
import type { OHLCVUpdate, QuoteUpdate } from "../realtime.types";
import { fromBinanceInterval, fromBinanceSymbol, toBinanceInterval, toBinanceSymbol } from "../utils/symbolUtils";

const logger = new Logger("BinanceStreamHandler");

export class BinanceStreamHandler {
	private ws: WebSocket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private subscribedStreams = new Set<string>();

	constructor(private broadcaster: Broadcaster) {}

	ensureConnection(symbol: string, channel: string, interval: string) {
		const binanceSymbol = toBinanceSymbol(symbol).toLowerCase();
		let streamName: string;

		if (channel === "ohlcv") {
			const binanceInterval = toBinanceInterval(interval);
			streamName = `${binanceSymbol}@kline_${binanceInterval}`;
		} else {
			streamName = `${binanceSymbol}@ticker`;
		}

		if (this.subscribedStreams.has(streamName)) return;

		this.subscribedStreams.add(streamName);
		this.connect();
	}

	private connect() {
		if (this.ws) {
			this.ws.close();
		}

		if (this.subscribedStreams.size === 0) return;

		const streams = Array.from(this.subscribedStreams).join("/");
		const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

		logger.info(`Connecting to Binance: ${this.subscribedStreams.size} streams`);

		this.ws = new WebSocket(url);

		this.ws.onopen = () => {
			logger.info("Binance WebSocket connected");
		};

		this.ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				this.handleMessage(data);
			} catch (e) {
				logger.error("Failed to parse Binance message", e);
			}
		};

		this.ws.onclose = () => {
			logger.warn("Binance WebSocket closed, reconnecting in 5s...");
			this.reconnectTimer = setTimeout(() => this.connect(), 5000);
		};

		this.ws.onerror = (error) => {
			logger.error("Binance WebSocket error", error);
		};
	}

	private handleMessage(data: any) {
		const { stream, data: payload } = data;
		if (!stream || !payload) return;

		if (stream.includes("@ticker")) {
			this.processTicker(stream, payload);
		} else if (stream.includes("@kline_")) {
			this.processKline(stream, payload);
		}
	}

	private processTicker(stream: string, data: any) {
		const binanceSymbol = stream.split("@")[0].toUpperCase();
		const symbol = fromBinanceSymbol(binanceSymbol);

		const update: QuoteUpdate = {
			symbol,
			price: parseFloat(data.c),
			change: parseFloat(data.p),
			changePercent: parseFloat(data.P),
			volume: parseFloat(data.v),
			timestamp: data.E,
		};

		this.broadcaster.broadcastQuote(symbol, update, "YAHOO");
	}

	private processKline(stream: string, data: any) {
		const [symbolPart, intervalPart] = stream.split("@kline_");
		const binanceSymbol = symbolPart.toUpperCase();
		const symbol = fromBinanceSymbol(binanceSymbol);
		const interval = fromBinanceInterval(intervalPart);

		const k = data.k;
		const update: OHLCVUpdate = {
			symbol,
			interval,
			timestamp: k.t,
			open: parseFloat(k.o),
			high: parseFloat(k.h),
			low: parseFloat(k.l),
			close: parseFloat(k.c),
			volume: parseFloat(k.v),
			isClosed: k.x,
		};

		this.broadcaster.broadcastOHLCV(symbol, interval, update);
	}

	shutdown() {
		if (this.ws) {
			this.ws.close();
		}
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
		}
	}
}
