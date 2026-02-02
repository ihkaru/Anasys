import { Elysia } from "elysia";
import { Logger } from "../../utils/logger";
import { realtimeService } from "./realtime.service";

const logger = new Logger("RealtimeController");

// Define WebSocket context type for Elysia
interface WsContext {
	id: string;
	send: (data: string | Uint8Array) => void;
	close: () => void;
	raw: unknown;
}

/**
 * WebSocket Controller for real-time market data
 *
 * Features:
 * - Subscribe/unsubscribe to symbols
 * - Quote updates (price, change, volume)
 * - OHLCV updates for charts
 * - Auto-reconnect handling
 */
export const realtimeController = new Elysia({ prefix: "/ws" }).ws("/market", {
	// Connection opened
	open(ws: WsContext) {
		logger.debug("WebSocket client connected");
		realtimeService.registerClient(ws as any);

		// Send welcome message
		ws.send(
			JSON.stringify({
				type: "connected",
				message: "Real-time market data stream connected",
				timestamp: Date.now(),
			}),
		);
	},

	// Message received from client
	message(ws: WsContext, message: unknown) {
		const rawMsg = typeof message === "string" ? message : JSON.stringify(message);
		logger.debug(`[WS RAW] Received: ${rawMsg}`);

		// message is already parsed if it's valid JSON
		if (typeof message === "string") {
			realtimeService.handleMessage(ws as any, message);
		} else {
			realtimeService.handleMessage(ws as any, JSON.stringify(message));
		}
	},

	// Connection closed
	close(ws: WsContext) {
		logger.debug("WebSocket client disconnected");
		realtimeService.unregisterClient(ws as any);
	},

	// Configuration
	idleTimeout: 120, // Close after 2 min of inactivity (client should send ping)
});
