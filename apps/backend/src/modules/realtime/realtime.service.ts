import type { ServerWebSocket } from "bun";
import { Logger } from "../../utils/logger";

const logger = new Logger("RealtimeService");

// Subscription types
type SubscriptionType = "quote" | "ohlcv";

interface Subscription {
	symbol: string;
	type: SubscriptionType;
	interval?: string; // For OHLCV: 1m, 5m, 15m, 1h, etc.
}

interface ClientState {
	ws: ServerWebSocket<any>;
	subscriptions: Set<string>; // "quote:AAPL", "ohlcv:BTC-USD:1m"
	lastPing: number;
}

// Message types for client communication
interface WsMessage {
	type: "subscribe" | "unsubscribe" | "ping";
	symbols?: string[];
	channel?: "quote" | "ohlcv";
	interval?: string;
	source?: string; // YAHOO, TRADINGVIEW, etc.
}

interface QuoteUpdate {
	symbol: string;
	price: number;
	change: number;
	changePercent: number;
	volume?: number;
	timestamp: number;
}

interface OHLCVUpdate {
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

/**
 * RealtimeService manages WebSocket connections and subscriptions.
 * - Broadcasts quote updates to all subscribed clients
 * - Manages upstream connections to data providers (Binance WSS)
 * - Falls back to polling for non-WSS providers (Yahoo)
 */
export class RealtimeService {
	// Client connections: id -> state
	private clients = new Map<string, ClientState>();

	// Symbol subscriptions: "quote:AAPL" -> Set of client IDs
	private subscriptions = new Map<string, Set<string>>();

	// Upstream Binance WebSocket connection
	private binanceWs: WebSocket | null = null;
	private binanceReconnectTimer: Timer | null = null;
	private binanceSubscribedStreams = new Set<string>();

	// Smart polling for stocks (by source)
	private stockPollingInterval: Timer | null = null;
	private yahooStocksToPolls = new Set<string>();
	private tradingviewStocksToPolls = new Set<string>();
	private readonly STOCK_POLL_INTERVAL_MS = 5000; // 5 seconds during market hours

	constructor() {
		logger.info("RealtimeService initialized");
	}

	// ==================== Client Management ====================

	/**
	 * Register a new WebSocket client
	 */
	registerClient(ws: ServerWebSocket<any> & { id: string }) {
		const id = ws.id || (ws as any).data?.id;
		if (!id) {
			logger.error("Client connected without ID, rejecting");
			ws.close();
			return;
		}

		this.clients.set(id, {
			ws,
			subscriptions: new Set(),
			lastPing: Date.now(),
		});
		logger.debug(`Client connected (id=${id}). Total: ${this.clients.size}`);
	}

	/**
	 * Unregister a WebSocket client and clean up subscriptions
	 */
	unregisterClient(ws: ServerWebSocket<any> & { id: string }) {
		const id = ws.id || (ws as any).data?.id;
		const state = this.clients.get(id);

		if (state) {
			// Remove from all subscriptions
			for (const subKey of state.subscriptions) {
				const subs = this.subscriptions.get(subKey);
				if (subs) {
					subs.delete(id);
					if (subs.size === 0) {
						this.subscriptions.delete(subKey);
						this.handleNoSubscribers(subKey);
					}
				}
			}
			this.clients.delete(id);
			logger.debug(`Client disconnected (id=${id}). Total: ${this.clients.size}`);
		}
	}

	/**
	 * Handle incoming WebSocket message
	 */
	handleMessage(ws: ServerWebSocket<any> & { id: string }, message: string) {
		const id = ws.id || (ws as any).data?.id;
		const state = this.clients.get(id);
		if (!state) {
			// Maybe re-register if missing? Or just log warn
			logger.warn(`Received message from unknown client (id=${id}), closing connection`);
			ws.close();
			return;
		}

		state.lastPing = Date.now();

		try {
			const msg = JSON.parse(message) as WsMessage;
			if (msg.type === "subscribe") {
				this.handleSubscribe(id, msg);
			} else if (msg.type === "unsubscribe") {
				this.handleUnsubscribe(id, msg);
			} else if (msg.type === "ping") {
				ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
			}
		} catch (e) {
			logger.error("Failed to handle message", e);
		}
	}

	// ==================== Subscription Handling ====================

	private handleSubscribe(clientId: string, msg: WsMessage) {
		const state = this.clients.get(clientId);
		if (!state || !msg.symbols) {
			logger.warn(`Invalid subscribe request from client: state=${!!state}, symbols=${msg.symbols}`);
			return;
		}

		const channel = msg.channel || "quote";
		const interval = msg.interval || "1m";
		const source = msg.source || "YAHOO";

		logger.debug(
			`[WS] Handling subscribe: id=${clientId} symbols=${msg.symbols.join(",")} channel=${channel} source=${source}`,
		);

		for (const symbol of msg.symbols) {
			const subKey = channel === "ohlcv" ? `ohlcv:${symbol}:${interval}` : `quote:${symbol}`;

			// Add to client's subscriptions
			state.subscriptions.add(subKey);
			logger.debug(`[WS] Added subKey=${subKey} to client ${clientId}`);

			// Add to global subscription map
			if (!this.subscriptions.has(subKey)) {
				this.subscriptions.set(subKey, new Set());
			}
			this.subscriptions.get(subKey)?.add(clientId);

			// Start upstream connection if needed
			this.ensureUpstreamConnection(symbol, channel, interval, source);
		}

		logger.info(`Client subscribed: ${msg.symbols.join(", ")} (${channel}, source=${source})`);
	}

	private handleUnsubscribe(clientId: string, msg: WsMessage) {
		const state = this.clients.get(clientId);
		if (!state || !msg.symbols) return;

		const channel = msg.channel || "quote";
		const interval = msg.interval || "1m";

		for (const symbol of msg.symbols) {
			const subKey = channel === "ohlcv" ? `ohlcv:${symbol}:${interval}` : `quote:${symbol}`;

			state.subscriptions.delete(subKey);

			const subs = this.subscriptions.get(subKey);
			if (subs) {
				subs.delete(clientId);
				if (subs.size === 0) {
					this.subscriptions.delete(subKey);
					this.handleNoSubscribers(subKey);
				}
			}
		}
	}

	private handleNoSubscribers(subKey: string) {
		// Clean up upstream connections when no one is listening
		const [channel, symbol] = subKey.split(":");

		// Check if there are ANY other subscriptions for this symbol
		// We need to iterate all subscriptions to see if any key contains this symbol
		let hasInterest = false;
		for (const key of this.subscriptions.keys()) {
			// Key format: "quote:SYMBOL" or "ohlcv:SYMBOL:INTERVAL"
			const parts = key.split(":");
			if (parts[1] === symbol) {
				hasInterest = true;
				break;
			}
		}

		if (hasInterest) {
			logger.debug(`handleNoSubscribers: ${symbol} still has active subscriptions, skipping upstream cleanup`);
			return;
		}

		logger.info(`Cleaning up upstream for ${symbol} (no active subs)`);

		if (this.isCryptoSymbol(symbol)) {
			// For Binance, we'd unsubscribe from stream
			// (Complex: requires managing stream subscriptions)
			logger.debug(`No subscribers for ${subKey}, could unsubscribe upstream`);
		} else {
			// Remove from both polling lists
			this.yahooStocksToPolls.delete(symbol);

			if (this.tradingviewStocksToPolls.has(symbol)) {
				this.tradingviewStocksToPolls.delete(symbol);
				this.scheduleTradingViewStreamUpdate();
			}
		}
	}

	// ==================== Upstream Connections ====================

	private ensureUpstreamConnection(symbol: string, channel: string, interval: string, source: string) {
		const isCrypto = this.isCryptoSymbol(symbol);
		logger.debug(`ensureUpstreamConnection: ${symbol} -> isCrypto=${isCrypto}, source=${source}`);

		if (isCrypto) {
			this.ensureBinanceConnection(symbol, channel, interval);
		} else {
			this.ensureStockPolling(symbol, source);
		}
	}

	private isCryptoSymbol(symbol: string): boolean {
		// Known crypto base symbols
		const cryptoBases = [
			"BTC",
			"ETH",
			"XRP",
			"SOL",
			"ADA",
			"DOGE",
			"DOT",
			"MATIC",
			"AVAX",
			"LINK",
			"UNI",
			"ATOM",
			"LTC",
			"BCH",
			"XLM",
			"ALGO",
			"VET",
			"FIL",
			"TRX",
			"ETC",
			"AAVE",
			"XMR",
			"EOS",
			"XTZ",
			"NEO",
			"MKR",
			"COMP",
			"SNX",
			"YFI",
			"SUSHI",
			"CRV",
			"1INCH",
			"BAT",
			"ENJ",
			"MANA",
			"SAND",
			"AXS",
			"GALA",
			"APE",
			"SHIB",
			"PEPE",
			"BONK",
			"WIF",
			"FLOKI",
			"ARB",
			"OP",
			"IMX",
			"SUI",
			"SEI",
			"TIA",
			"INJ",
			"RUNE",
			"NEAR",
			"FTM",
			"HBAR",
			"EGLD",
			"FLOW",
			"CFX",
			"ICP",
			"APT",
		];

		// Extract base symbol (before -USD or USDT)
		const base = symbol
			.replace(/-USD$/, "")
			.replace(/USDT$/, "")
			.replace(/-PERP$/, "");

		const isCrypto = cryptoBases.includes(base.toUpperCase());
		logger.debug(`isCryptoSymbol(${symbol}) -> base=${base} -> ${isCrypto}`);
		return isCrypto;
	}

	// ==================== Binance WebSocket ====================

	private ensureBinanceConnection(symbol: string, channel: string, interval: string) {
		// Convert symbol format: BTC-USD -> btcusdt
		const binanceSymbol = this.toBinanceSymbol(symbol).toLowerCase();

		// Build stream name
		let streamName: string;
		if (channel === "ohlcv") {
			const binanceInterval = this.toBinanceInterval(interval);
			streamName = `${binanceSymbol}@kline_${binanceInterval}`;
		} else {
			streamName = `${binanceSymbol}@ticker`;
		}

		// Already subscribed?
		if (this.binanceSubscribedStreams.has(streamName)) return;
		this.binanceSubscribedStreams.add(streamName);

		// Reconnect with new streams
		this.connectBinanceWs();
	}

	private connectBinanceWs() {
		// Close existing connection
		if (this.binanceWs) {
			this.binanceWs.close();
		}

		if (this.binanceSubscribedStreams.size === 0) return;

		const streams = Array.from(this.binanceSubscribedStreams).join("/");
		const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

		logger.info(`Connecting to Binance: ${this.binanceSubscribedStreams.size} streams`);

		this.binanceWs = new WebSocket(url);

		this.binanceWs.onopen = () => {
			logger.info("Binance WebSocket connected");
		};

		this.binanceWs.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				this.handleBinanceMessage(data);
			} catch (e) {
				logger.error("Failed to parse Binance message", e);
			}
		};

		this.binanceWs.onclose = () => {
			logger.warn("Binance WebSocket closed, reconnecting in 5s...");
			this.binanceReconnectTimer = setTimeout(() => this.connectBinanceWs(), 5000);
		};

		this.binanceWs.onerror = (error) => {
			logger.error("Binance WebSocket error", error);
		};
	}

	private handleBinanceMessage(data: any) {
		// Combined stream format: { stream: "btcusdt@ticker", data: {...} }
		const { stream, data: payload } = data;

		if (!stream || !payload) return;

		if (stream.includes("@ticker")) {
			this.processBinanceTicker(stream, payload);
		} else if (stream.includes("@kline_")) {
			this.processBinanceKline(stream, payload);
		}
	}

	private processBinanceTicker(stream: string, data: any) {
		// stream: "btcusdt@ticker"
		const binanceSymbol = stream.split("@")[0].toUpperCase();
		const symbol = this.fromBinanceSymbol(binanceSymbol);

		const update: QuoteUpdate = {
			symbol,
			price: parseFloat(data.c), // Current price
			change: parseFloat(data.p), // Price change
			changePercent: parseFloat(data.P), // Price change percent
			volume: parseFloat(data.v), // Volume
			timestamp: data.E, // Event time
		};

		this.broadcastQuote(symbol, update);
	}

	private processBinanceKline(stream: string, data: any) {
		// stream: "btcusdt@kline_1m"
		const [symbolPart, intervalPart] = stream.split("@kline_");
		const binanceSymbol = symbolPart.toUpperCase();
		const symbol = this.fromBinanceSymbol(binanceSymbol);
		const interval = this.fromBinanceInterval(intervalPart);

		const k = data.k;
		const update: OHLCVUpdate = {
			symbol,
			interval,
			timestamp: k.t, // Candle start time
			open: parseFloat(k.o),
			high: parseFloat(k.h),
			low: parseFloat(k.l),
			close: parseFloat(k.c),
			volume: parseFloat(k.v),
			isClosed: k.x, // Is candle closed?
		};

		this.broadcastOHLCV(symbol, interval, update);
	}

	// ==================== Stock Polling ====================

	private ensureStockPolling(symbol: string, source: string) {
		const fullSymbol = source === "TRADINGVIEW" ? symbol : symbol; // Format already correct

		if (source === "TRADINGVIEW") {
			if (!this.tradingviewStocksToPolls.has(symbol)) {
				logger.info(`Adding TradingView stock to stream: ${symbol}`);
				this.tradingviewStocksToPolls.add(symbol);
				this.scheduleTradingViewStreamUpdate();
			}
		} else {
			logger.info(`Adding Yahoo stock to poll: ${symbol}`);
			this.yahooStocksToPolls.add(symbol);
			if (!this.stockPollingInterval) {
				this.startStockPolling();
			}
		}
	}

	// Yahoo HTTP Polling
	private startStockPolling() {
		logger.info("Starting Yahoo stock polling service (every 5s)");

		this.stockPollingInterval = setInterval(async () => {
			if (this.yahooStocksToPolls.size === 0) return;

			const tickers = Array.from(this.yahooStocksToPolls);
			// logger.debug(`Polling ${tickers.length} Yahoo stocks: ${tickers.slice(0, 5).join(', ')}...`);

			try {
				const { marketService } = await import("../market/market.service");
				const quotes = await marketService.getQuotes(tickers, "1d", "YAHOO");

				// logger.debug(`Got ${quotes.length} quotes from Yahoo`);

				for (const quote of quotes) {
					const update: QuoteUpdate = {
						symbol: quote.ticker,
						price: quote.price,
						change: quote.change || 0,
						changePercent: quote.changePercent || 0,
						volume: quote.volume,
						timestamp: Date.now(),
					};
					this.broadcastQuote(quote.ticker, update);
				}
			} catch (e) {
				logger.error("Yahoo polling failed", e);
			}
		}, this.STOCK_POLL_INTERVAL_MS);
	}

	// ==================== TradingView Streaming ====================

	private tradingviewProcess: any = null;
	private tvUpdateTimer: Timer | null = null;

	private scheduleTradingViewStreamUpdate() {
		if (this.tvUpdateTimer) clearTimeout(this.tvUpdateTimer);

		this.tvUpdateTimer = setTimeout(() => {
			this.restartTradingViewStream();
			this.tvUpdateTimer = null;
		}, 1000); // 1s debounce
	}

	private restartTradingViewStream() {
		if (this.tradingviewProcess) {
			logger.info("Restarting TradingView stream to update symbols...");
			// Remove listener to prevent 5s auto-reconnect delay
			this.tradingviewProcess.removeAllListeners("close");
			this.tradingviewProcess.kill();
			this.tradingviewProcess = null;
		}
		this.ensureTradingViewStream();
	}

	private ensureTradingViewStream() {
		if (this.tradingviewProcess) return; // Already streaming

		const symbols = Array.from(this.tradingviewStocksToPolls);
		if (symbols.length === 0) return;

		logger.info(`Starting TradingView stream for ${symbols.length} symbols...`);

		// Spawn Python subprocess for streaming
		const { spawn } = require("child_process");
		const args = JSON.stringify({ symbols });

		this.tradingviewProcess = spawn("python3", ["src/scripts/bridge_tradingview.py", "stream", args]);

		this.tradingviewProcess.stdout.on("data", (data: Buffer) => {
			const lines = data
				.toString()
				.split("\n")
				.filter((l: string) => l.trim());
			for (const line of lines) {
				try {
					const parsed = JSON.parse(line);
					if (parsed.type === "quote") {
						const update: QuoteUpdate = {
							symbol: parsed.symbol,
							price: parsed.price || 0,
							change: parsed.change || 0,
							changePercent: parsed.changePercent || 0,
							volume: parsed.volume,
							timestamp: parsed.timestamp ? parsed.timestamp * 1000 : Date.now(),
						};
						// Extract base symbol (NASDAQ:AAPL -> AAPL)
						const baseSymbol = parsed.symbol.includes(":") ? parsed.symbol.split(":")[1] : parsed.symbol;
						this.broadcastQuote(baseSymbol, update);
					}
				} catch (e) {
					// Ignore parse errors
				}
			}
		});

		this.tradingviewProcess.stderr.on("data", (data: Buffer) => {
			logger.error(`TradingView stream error: ${data.toString()}`);
		});

		this.tradingviewProcess.on("close", (code: number) => {
			logger.warn(`TradingView stream closed with code ${code}, restarting in 5s...`);
			this.tradingviewProcess = null;
			setTimeout(() => this.ensureTradingViewStream(), 5000);
		});
	}

	// ==================== Broadcasting ====================

	private broadcastQuote(symbol: string, update: QuoteUpdate) {
		// Filter invalid prices
		if (!update.price || update.price <= 0) {
			logger.warn(`Skipping invalid quote broadcast for ${symbol}: price=${update.price}`);
			return;
		}

		const subKey = `quote:${symbol}`;
		const clientIds = this.subscriptions.get(subKey);

		if (!clientIds || clientIds.size === 0) {
			logger.debug(`No clients for ${subKey}`);
			return;
		}

		// logger.debug(`Broadcasting quote: ${symbol} = $${update.price} to ${clientIds.size} clients`);

		const message = JSON.stringify({
			type: "quote",
			data: update,
		});

		for (const clientId of clientIds) {
			const clientState = this.clients.get(clientId);
			if (clientState && clientState.ws) {
				try {
					clientState.ws.send(message);
				} catch (e) {
					// Client disconnected, will be cleaned up
				}
			}
		}
	}

	private broadcastOHLCV(symbol: string, interval: string, update: OHLCVUpdate) {
		const subKey = `ohlcv:${symbol}:${interval}`;
		const clientIds = this.subscriptions.get(subKey);

		if (!clientIds || clientIds.size === 0) return;

		logger.debug(`Broadcasting OHLCV: ${symbol} ${interval} to ${clientIds.size} clients`);

		const message = JSON.stringify({
			type: "ohlcv",
			data: update,
		});

		for (const clientId of clientIds) {
			const clientState = this.clients.get(clientId);
			if (clientState && clientState.ws) {
				try {
					clientState.ws.send(message);
				} catch (e) {
					// Client disconnected, will be cleaned up
				}
			}
		}
	}

	// ==================== Symbol Conversion ====================

	private toBinanceSymbol(symbol: string): string {
		// BTC-USD -> BTCUSDT, ETH-USD -> ETHUSDT
		return symbol.replace("-USD", "USDT").replace("-", "");
	}

	private fromBinanceSymbol(binanceSymbol: string): string {
		// BTCUSDT -> BTC-USD
		if (binanceSymbol.endsWith("USDT")) {
			return binanceSymbol.replace("USDT", "-USD");
		}
		return binanceSymbol;
	}

	private toBinanceInterval(interval: string): string {
		// 1m, 5m, 15m, 1h, 4h, 1d -> Binance format
		const map: Record<string, string> = {
			"1m": "1m",
			"5m": "5m",
			"15m": "15m",
			"30m": "30m",
			"1h": "1h",
			"4h": "4h",
			"1d": "1d",
			"1w": "1w",
		};
		return map[interval] || "1m";
	}

	private fromBinanceInterval(binanceInterval: string): string {
		// Binance intervals map directly
		return binanceInterval;
	}

	// ==================== Cleanup ====================

	shutdown() {
		if (this.binanceWs) {
			this.binanceWs.close();
		}
		if (this.binanceReconnectTimer) {
			clearTimeout(this.binanceReconnectTimer);
		}
		if (this.stockPollingInterval) {
			clearInterval(this.stockPollingInterval);
		}
		logger.info("RealtimeService shutdown");
	}
}

// Export singleton
export const realtimeService = new RealtimeService();
