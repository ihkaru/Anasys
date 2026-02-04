import { Logger } from "../../../utils/logger";
import type { ClientManager } from "../managers/ClientManager";
import type { SubscriptionManager } from "../managers/SubscriptionManager";
import type { OHLCVUpdate, QuoteUpdate } from "../realtime.types";

const logger = new Logger("Broadcaster");

export class Broadcaster {
	private subscriptionManager: SubscriptionManager | null = null;

	constructor(private clientManager: ClientManager) {}

	setSubscriptionManager(manager: SubscriptionManager) {
		this.subscriptionManager = manager;
	}

	broadcastQuote(symbol: string, update: QuoteUpdate) {
		if (!update.price || update.price <= 0) {
			// logger.warn(`Skipping invalid quote broadcast for ${symbol}: price=${update.price}`);
			return;
		}

		const subKey = `quote:${symbol}`;
		const clientIds = this.subscriptionManager.getSubscribers(subKey);

		if (!clientIds || clientIds.size === 0) {
			return;
		}

		const message = JSON.stringify({
			type: "quote",
			data: update,
		});

		for (const clientId of clientIds) {
			const clientState = this.clientManager.getClient(clientId);
			if (clientState && clientState.ws) {
				try {
					clientState.ws.send(message);
				} catch (e) {
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
			if (clientState && clientState.ws) {
				try {
					clientState.ws.send(message);
				} catch (e) {
					// Client disconnected
				}
			}
		}
	}
}
