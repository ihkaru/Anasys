import type { ServerWebSocket } from "bun";
import { Logger } from "../../../utils/logger";
import type { ClientState, WsMessage } from "../realtime.types";

const logger = new Logger("ClientManager");

export class ClientManager {
	private clients = new Map<string, ClientState>();

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

	unregisterClient(ws: ServerWebSocket<any> & { id: string }): ClientState | undefined {
		const id = ws.id || (ws as any).data?.id;
		const state = this.clients.get(id);

		if (state) {
			this.clients.delete(id);
			logger.debug(`Client disconnected (id=${id}). Total: ${this.clients.size}`);
		}
		return state;
	}

	getClient(id: string): ClientState | undefined {
		return this.clients.get(id);
	}

	handleMessage(ws: ServerWebSocket<any> & { id: string }, message: string): WsMessage | null {
		const id = ws.id || (ws as any).data?.id;
		const state = this.clients.get(id);

		if (!state) {
			logger.warn(`Received message from unknown client (id=${id}), closing connection`);
			ws.close();
			return null;
		}

		state.lastPing = Date.now();

		try {
			const msg = JSON.parse(message) as WsMessage;
			if (msg.type === "ping") {
				ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
				return null;
			}
			return msg;
		} catch (e) {
			logger.error("Failed to handle message", e);
			return null;
		}
	}
}
