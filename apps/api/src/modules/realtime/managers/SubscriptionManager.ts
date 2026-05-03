import { Logger } from "../../../utils/logger";
import type { WsMessage } from "../realtime.types";
import type { ClientManager } from "./ClientManager";

const _logger = new Logger("SubscriptionManager");

export class SubscriptionManager {
	// "quote:AAPL" -> Set of client IDs
	private subscriptions = new Map<string, Set<string>>();

	constructor(
		private clientManager: ClientManager,
		private onSubscribe: (symbol: string, channel: string, interval: string, source: string) => void,
		private onUnsubscribe: (symbol: string) => void,
	) {}

	handleSubscribe(clientId: string, msg: WsMessage) {
		const state = this.clientManager.getClient(clientId);
		if (!state || !msg.symbols) {
			return;
		}

		const channel = msg.channel || "quote";
		const interval = msg.interval || "1m";

		// STRICT: source must always be provided by client. Fallback to YAHOO but log a warning.
		// If this warning fires, it indicates a bug in the frontend — source is being lost.
		if (!msg.source) {
			_logger.warn(
				`[SubscriptionManager] ⚠️ MISSING SOURCE in subscribe for ${msg.symbols?.join(",")} (channel=${channel}). ` +
					`Defaulting to YAHOO — this may cause invalid data routing for institutional assets!`,
			);
		}
		const source = msg.source || "YAHOO";

		for (const symbol of msg.symbols) {
			// Source-aware subscription key for quotes
			const subKey = channel === "ohlcv" ? `ohlcv:${symbol}:${interval}` : `quote:${symbol}:${source}`;

			state.subscriptions.add(subKey);

			if (!this.subscriptions.has(subKey)) {
				this.subscriptions.set(subKey, new Set());
			}
			this.subscriptions.get(subKey)?.add(clientId);

			// Notify upstream
			this.onSubscribe(symbol, channel, interval, source);
		}
	}

	handleUnsubscribe(clientId: string, msg: WsMessage) {
		const state = this.clientManager.getClient(clientId);
		if (!state || !msg.symbols) return;

		const channel = msg.channel || "quote";
		const interval = msg.interval || "1m";

		// No warning needed for unsubscribe — source is only critical for subscribe routing
		const source = msg.source || "YAHOO";

		for (const symbol of msg.symbols) {
			// Source-aware key for quotes
			const subKey = channel === "ohlcv" ? `ohlcv:${symbol}:${interval}` : `quote:${symbol}:${source}`;

			state.subscriptions.delete(subKey);

			const subs = this.subscriptions.get(subKey);
			if (subs) {
				subs.delete(clientId);
				if (subs.size === 0) {
					this.subscriptions.delete(subKey);
					this.checkNoSubscribers(symbol);
				}
			}
		}
	}

	cleanupClientSubscriptions(clientId: string) {
		const _state = this.clientManager.getClient(clientId);
		// If state is already gone from ClientManager, we can't iterate its subs.
		// But ClientManager.unregisterClient returns the state.
		// See implementation below.
	}

	// Helper to be called explicitly when client disconnects and we have their state
	removeClientFromAll(clientId: string, clientSubs: Set<string>) {
		for (const subKey of clientSubs) {
			const subs = this.subscriptions.get(subKey);
			if (subs) {
				subs.delete(clientId);
				if (subs.size === 0) {
					this.subscriptions.delete(subKey);
					// Extract symbol from key (format: quote:SYMBOL:SOURCE or ohlcv:SYMBOL:INTERVAL)
					const parts = subKey.split(":");
					const symbol = parts[1];
					this.checkNoSubscribers(symbol);
				}
			}
		}
	}

	getSubscribers(subKey: string): Set<string> | undefined {
		return this.subscriptions.get(subKey);
	}

	private checkNoSubscribers(symbol: string) {
		// Check if there are ANY other subscriptions for this symbol
		let hasInterest = false;
		for (const key of this.subscriptions.keys()) {
			const parts = key.split(":");
			// quote:SYMBOL or ohlcv:SYMBOL:INTERVAL
			if (parts[1] === symbol) {
				hasInterest = true;
				break;
			}
		}

		if (!hasInterest) {
			this.onUnsubscribe(symbol);
		}
	}
}
