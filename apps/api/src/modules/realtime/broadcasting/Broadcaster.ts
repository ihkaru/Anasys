import { Logger } from "../../../utils/logger";
import type { ClientManager } from "../managers/ClientManager";
import type { SubscriptionManager } from "../managers/SubscriptionManager";
import type { OHLCVUpdate, QuoteUpdate } from "../realtime.types";

const _logger = new Logger("Broadcaster");

export class Broadcaster {
	private subscriptionManager: SubscriptionManager | null = null;

	constructor(private clientManager: ClientManager) {}

	setSubscriptionManager(manager: SubscriptionManager) {
		this.subscriptionManager = manager;
	}

	broadcastQuote(symbol: string, update: QuoteUpdate, source: string = "YAHOO") {
		if (!update.price || update.price <= 0) {
			// logger.warn(`Skipping invalid quote broadcast for ${symbol}: price=${update.price}`);
			return;
		}

		// Source-aware subscription key
		const subKey = `quote:${symbol}:${source}`;
		const clientIds = this.subscriptionManager?.getSubscribers(subKey);

		if (!clientIds || clientIds.size === 0) {
			return;
		}

		const message = JSON.stringify({
			type: "quote",
			data: { ...update, source }, // Include source in payload for frontend
		});

		for (const clientId of clientIds) {
			const clientState = this.clientManager.getClient(clientId);
			if (clientState?.ws) {
				try {
					clientState.ws.send(message);
				} catch (_e) {
					// Client disconnected, let ClientManager handle cleanup eventually
				}
			}
		}
	}

	broadcastOHLCV(symbol: string, interval: string, update: OHLCVUpdate) {
		if (!this.subscriptionManager) return;
		const subKey = `ohlcv:${symbol}:${interval}`;
		const clientIds = this.subscriptionManager.getSubscribers(subKey);

		if (!clientIds || clientIds.size === 0) return;

		const message = JSON.stringify({
			type: "ohlcv",
			data: update,
		});

		for (const clientId of clientIds) {
			const clientState = this.clientManager.getClient(clientId);
			if (clientState?.ws) {
				try {
					clientState.ws.send(message);
				} catch (_e) {
					// Client disconnected
				}
			}
		}
	}

	/**
	 * Send a targeted message to all active sessions of a specific user.
	 */
	sendToUser(userId: number, type: string, data: any) {
		const message = JSON.stringify({ type, data });
		let sentCount = 0;

		// Iterasi semua client untuk mencari yang punya userId cocok
		// (In production with thousands of users, we'd maintain a Map<userId, Set<clientId>>)
		const allClients = (this.clientManager as any).clients as Map<string, any>;
		if (!allClients) return;

		for (const clientState of allClients.values()) {
			if (clientState.userId === userId && clientState.ws) {
				try {
					clientState.ws.send(message);
					sentCount++;
				} catch (_e) {
					// Ignore failures, ClientManager handles cleanup
				}
			}
		}

		if (sentCount > 0) {
			_logger.debug(`Sent targeted message [${type}] to user ${userId} (${sentCount} sessions)`);
		}
	}
}
