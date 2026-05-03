import { onUnmounted, ref, watch, type Ref } from "vue";
import { createLogger } from "../utils/logger";

const logger = createLogger("useRealtimeQuotes");

// Message types from server
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
	isClosed: boolean;
}

interface ServerMessage {
	type: "connected" | "quote" | "ohlcv" | "pong";
	data?: QuoteUpdate | OHLCVUpdate;
	message?: string;
	timestamp?: number;
}

// Callbacks for consumers
type QuoteCallback = (update: QuoteUpdate) => void;
type OHLCVCallback = (update: OHLCVUpdate) => void;

// Singleton WebSocket connection
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;

// Subscription management
const quoteCallbacks = new Map<string, Set<QuoteCallback>>();
const ohlcvCallbacks = new Map<string, Set<OHLCVCallback>>(); // Key: "symbol:interval"
const symbolSources = new Map<string, string>(); // Track source per symbol for reconnection

// Connection state
const isConnected = ref(false);
const connectionAttempts = ref(0);
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 3000;
const PING_INTERVAL_MS = 30000;

/**
 * Get WebSocket URL based on current environment
 */
function getWsUrl(): string {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	// In preview (production build served locally), we still want to connect to local backend
	// window.location.host would point to 4173 (preview port)
	const host = import.meta.env.DEV ? "localhost:28081" : "localhost:28081";
	return `${protocol}//${host}/ws/market`;
}

/**
 * Connect to WebSocket server
 */
function connect() {
	// Clear any pending reconnect timer since we are connecting now
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}

	if (ws) {
		if (ws.readyState === WebSocket.OPEN) return;
		if (ws.readyState === WebSocket.CONNECTING) {
			console.log("%c[WS] ⏳ Connection already in progress...", "color: #FF9800");
			return;
		}
	}

	const url = getWsUrl();
	console.log(`%c[WS] Connecting to ${url}...`, "color: #2196F3; font-weight: bold");
	logger.info(`Connecting to ${url}...`);

	ws = new WebSocket(url);

	ws.onopen = () => {
		console.log("%c[WS] ✅ Connected!", "color: #4CAF50; font-weight: bold");
		logger.info("WebSocket connected");
		isConnected.value = true;
		connectionAttempts.value = 0;

		// Resubscribe to all symbols
		resubscribeAll();

		// Start ping interval
		startPing();
	};

	ws.onmessage = (event) => {
		try {
			const message: ServerMessage = JSON.parse(event.data);
			// console.log("%c[WS] 📨 Received:", "color: #9C27B0", message);
			handleMessage(message);
		} catch (e) {
			logger.error("Failed to parse message", e);
		}
	};

	ws.onclose = (event) => {
		console.log(
			`%c[WS] ❌ Disconnected (code: ${event.code}, reason: ${event.reason})`,
			"color: #F44336; font-weight: bold",
		);
		logger.warn("WebSocket disconnected");
		isConnected.value = false;
		stopPing();
		scheduleReconnect();
	};

	ws.onerror = (error) => {
		console.log("%c[WS] ⚠️ Error:", "color: #FF9800; font-weight: bold", error);
		logger.error("WebSocket error", error);
	};
}

/**
 * Handle incoming message from server
 */
function handleMessage(message: ServerMessage) {
	switch (message.type) {
		case "connected":
			// console.log("%c[WS] 🤝 Server acknowledged connection", "color: #4CAF50");
			logger.debug("Server acknowledged connection");
			break;

		case "quote":
			if (message.data) {
				const update = message.data as QuoteUpdate;
				const _timeStr = new Date(update.timestamp).toLocaleTimeString();
				/*
				console.log(
					`%c[WS] 💰 QUOTE UPDATE: ${update.symbol} = $${update.price} (${update.changePercent >= 0 ? "+" : ""}${update.changePercent.toFixed(2)}%) Vol:${update.volume} Time:${timeStr}`,
					`color: ${update.changePercent >= 0 ? "#4CAF50" : "#F44336"}; font-weight: bold`,
				);
				*/
				const callbacks = quoteCallbacks.get(update.symbol);
				if (callbacks) {
					for (const cb of callbacks) {
						try {
							cb(update);
						} catch (e) {
							logger.error("Quote callback error", e);
						}
					}
				} else {
					console.log(`%c[WS] ⚠️ No callbacks registered for ${update.symbol}`, "color: #FF9800");
				}
			}
			break;

		case "ohlcv":
			if (message.data) {
				const update = message.data as OHLCVUpdate;
				const timeStr = new Date(update.timestamp).toLocaleTimeString();
				console.log(
					`%c[WS] 📊 OHLCV UPDATE: ${update.symbol} ${update.interval} O:${update.open} H:${update.high} L:${update.low} C:${update.close} Vol:${update.volume} Time:${timeStr} Closed:${update.isClosed}`,
					"color: #2196F3; font-weight: bold",
				);
				const key = `${update.symbol}:${update.interval}`;
				const callbacks = ohlcvCallbacks.get(key);
				if (callbacks) {
					for (const cb of callbacks) {
						try {
							cb(update);
						} catch (e) {
							logger.error("OHLCV callback error", e);
						}
					}
				}
			}
			break;

		case "pong":
			// Server responded to ping
			break;
	}
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect() {
	if (reconnectTimer) return;
	if (connectionAttempts.value >= MAX_RECONNECT_ATTEMPTS) {
		logger.error("Max reconnection attempts reached");
		return;
	}

	const delay = RECONNECT_DELAY_MS * 1.5 ** connectionAttempts.value;
	connectionAttempts.value++;

	logger.info(`Reconnecting in ${delay}ms (attempt ${connectionAttempts.value})`);
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connect();
	}, delay);
}

/**
 * Resubscribe to all symbols after reconnection
 */
function resubscribeAll() {
	// Quote subscriptions - group by source
	const bySource = new Map<string, string[]>();
	for (const symbol of quoteCallbacks.keys()) {
		const source = symbolSources.get(symbol) || "YAHOO";
		if (!bySource.has(source)) {
			bySource.set(source, []);
		}
		bySource.get(source)!.push(symbol);
	}

	// Subscribe per source
	for (const [source, symbols] of bySource) {
		console.log(`%c[WS] 📝 Resubscribing to quotes (source=${source}): ${symbols.join(", ")}`, "color: #2196F3");
		sendMessage({
			type: "subscribe",
			symbols,
			channel: "quote",
			source,
		});
	}

	if (bySource.size === 0) {
		console.log("%c[WS] ⚠️ No symbols to subscribe to", "color: #FF9800");
	}

	// OHLCV subscriptions
	const ohlcvKeys = Array.from(ohlcvCallbacks.keys());
	const byInterval = new Map<string, string[]>();
	for (const key of ohlcvKeys) {
		const [symbol, interval] = key.split(":");
		if (!byInterval.has(interval)) {
			byInterval.set(interval, []);
		}
		byInterval.get(interval)!.push(symbol);
	}

	for (const [interval, symbols] of byInterval) {
		// Group symbols by source for this interval
		const intervalBySource = new Map<string, string[]>();
		for (const s of symbols) {
			const src = symbolSources.get(s) || "YAHOO";
			if (!intervalBySource.has(src)) intervalBySource.set(src, []);
			intervalBySource.get(src)!.push(s);
		}

		for (const [src, sList] of intervalBySource) {
			console.log(
				`%c[WS] 📝 Resubscribing to OHLCV (source=${src}): ${sList.join(", ")} @ ${interval}`,
				"color: #2196F3",
			);
			sendMessage({
				type: "subscribe",
				symbols: sList,
				channel: "ohlcv",
				interval,
				source: src,
			});
		}
	}
}

/**
 * Send message to server
 */
function sendMessage(msg: any) {
	const wsState = ws?.readyState;
	const wsStateStr =
		wsState === WebSocket.OPEN
			? "OPEN"
			: wsState === WebSocket.CONNECTING
				? "CONNECTING"
				: wsState === WebSocket.CLOSING
					? "CLOSING"
					: wsState === WebSocket.CLOSED
						? "CLOSED"
						: "NONE";

	console.log(`%c[WS] 📤 Sending message (state=${wsStateStr}):`, "color: #FF5722; font-weight: bold", msg);

	if (ws?.readyState === WebSocket.OPEN) {
		const jsonStr = JSON.stringify(msg);
		console.log(`%c[WS] ✅ Message sent: ${jsonStr.substring(0, 200)}...`, "color: #4CAF50");
		ws.send(jsonStr);
	} else {
		console.log(`%c[WS] ❌ Cannot send - WebSocket state: ${wsStateStr}`, "color: #F44336; font-weight: bold");
		logger.warn(`Cannot send message, WebSocket state: ${wsStateStr}`);
	}
}

/**
 * Start ping interval to keep connection alive
 */
function startPing() {
	stopPing();
	pingInterval = setInterval(() => {
		sendMessage({ type: "ping" });
	}, PING_INTERVAL_MS);
}

function stopPing() {
	if (pingInterval) {
		clearInterval(pingInterval);
		pingInterval = null;
	}
}

// ==================== Public API ====================

/**
 * Subscribe to quote updates for symbols
 * @param symbols - Array of ticker symbols
 * @param callback - Callback for quote updates
 * @param source - Data source: 'YAHOO' | 'TRADINGVIEW' (default: 'YAHOO')
 */
export function subscribeQuotes(symbols: string[], callback: QuoteCallback, source: string = "YAHOO"): () => void {
	// Ensure connection
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		connect();
	}

	// Register callbacks and track source
	for (const symbol of symbols) {
		if (!quoteCallbacks.has(symbol)) {
			quoteCallbacks.set(symbol, new Set());
		}
		quoteCallbacks.get(symbol)!.add(callback);
		symbolSources.set(symbol, source); // Track source for reconnection
	}

	// Send subscribe message with source
	if (ws?.readyState === WebSocket.OPEN) {
		console.log(`%c[WS] 📝 Subscribing to quotes (source=${source}): ${symbols.join(", ")}`, "color: #2196F3");
		sendMessage({
			type: "subscribe",
			symbols,
			channel: "quote",
			source, // Pass source to backend
		});
	}

	// Return unsubscribe function
	return () => {
		for (const symbol of symbols) {
			const callbacks = quoteCallbacks.get(symbol);
			if (callbacks) {
				callbacks.delete(callback);
				if (callbacks.size === 0) {
					quoteCallbacks.delete(symbol);
					// Only unsubscribe if no other listeners
					sendMessage({
						type: "unsubscribe",
						symbols: [symbol],
						channel: "quote",
					});
				}
			}
		}
	};
}

/**
 * Subscribe to OHLCV updates for chart
 * @param symbol - Ticker symbol
 * @param interval - Candle interval (e.g. '1m', '1h')
 * @param callback - Callback for updates
 * @param source - Data source: 'YAHOO' | 'TRADINGVIEW' (default: 'YAHOO')
 */
export function subscribeOHLCV(
	symbol: string,
	interval: string,
	callback: OHLCVCallback,
	source: string = "YAHOO",
): () => void {
	// Ensure connection
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		connect();
	}

	const key = `${symbol}:${interval}`;

	// Register callback
	if (!ohlcvCallbacks.has(key)) {
		ohlcvCallbacks.set(key, new Set());
	}
	ohlcvCallbacks.get(key)!.add(callback);
	symbolSources.set(symbol, source); // Track source for reconnection

	// Send subscribe message
	if (ws?.readyState === WebSocket.OPEN) {
		sendMessage({
			type: "subscribe",
			symbols: [symbol],
			channel: "ohlcv",
			interval,
			source,
		});
	}

	// Return unsubscribe function
	return () => {
		const callbacks = ohlcvCallbacks.get(key);
		if (callbacks) {
			callbacks.delete(callback);
			if (callbacks.size === 0) {
				ohlcvCallbacks.delete(key);
				sendMessage({
					type: "unsubscribe",
					symbols: [symbol],
					channel: "ohlcv",
					interval,
				});
			}
		}
	};
}

/**
 * Vue composable for real-time quote updates
 * Auto-subscribes when symbols change, auto-unsubscribes on unmount
 */
export function useRealtimeQuotes(symbols: Ref<string[]>, onUpdate: QuoteCallback) {
	let unsubscribe: (() => void) | null = null;

	const setupSubscription = () => {
		// Clean up previous subscription
		if (unsubscribe) {
			unsubscribe();
			unsubscribe = null;
		}

		// Subscribe to new symbols
		if (symbols.value.length > 0) {
			// We assume source is either passed as a ref or we use a reactive way to get it
			// For now, if it's a list of symbols, they might have different sources
			// But the current useRealtimeQuotes is used for Watchlist which usually has a mix
			// This part is tricky. Let's make it accept a source Ref or just default to YAHOO for now
			// but allow override.
			unsubscribe = subscribeQuotes(symbols.value, onUpdate);
		}
	};

	// Watch for symbol changes
	watch(symbols, setupSubscription, { immediate: true });

	// Cleanup on unmount
	onUnmounted(() => {
		if (unsubscribe) {
			unsubscribe();
		}
	});

	return {
		isConnected,
	};
}

/**
 * Vue composable for real-time OHLCV updates (for charts)
 */
export function useRealtimeOHLCV(
	symbol: Ref<string>,
	interval: Ref<string>,
	onUpdate: OHLCVCallback,
	source: Ref<string> = ref("YAHOO"),
) {
	let unsubscribe: (() => void) | null = null;

	const setupSubscription = () => {
		if (unsubscribe) {
			unsubscribe();
			unsubscribe = null;
		}

		if (symbol.value) {
			unsubscribe = subscribeOHLCV(symbol.value, interval.value, onUpdate, source.value);
		}
	};

	// Watch for changes
	watch([symbol, interval], setupSubscription, { immediate: true });

	onUnmounted(() => {
		if (unsubscribe) {
			unsubscribe();
		}
	});

	return {
		isConnected,
	};
}

// Export connection state
export { isConnected };
