import type { ServerWebSocket } from "bun";
import { Logger } from "../../utils/logger";
import { Broadcaster } from "./broadcasting/Broadcaster";
import { ClientManager } from "./managers/ClientManager";
import { SubscriptionManager } from "./managers/SubscriptionManager";
import { RedisStreamHandler } from "./streams/RedisStreamHandler";

const logger = new Logger("RealtimeService");

export class RealtimeService {
	private clientManager: ClientManager;
	private subscriptionManager: SubscriptionManager;
	private broadcaster: Broadcaster;
	private redisHandler: RedisStreamHandler;

	constructor() {
		logger.info("RealtimeService initialized (Consolidated to Redis Engine)");

		// 1. Core Managers
		this.clientManager = new ClientManager();
		this.broadcaster = new Broadcaster(this.clientManager);

		// 2. Stream Handler (Unified source: Redis Pub/Sub from Rust Engine)
		this.redisHandler = new RedisStreamHandler(this.broadcaster);

		// 3. Subscription Manager
		// We no longer need to notify upstream handlers to connect/disconnect
		// because the Engine manages its own scraping lifecycle.
		this.subscriptionManager = new SubscriptionManager(
			this.clientManager,
			async (symbol, _channel, _interval, source) => {
				logger.debug(`Subscription added: ${symbol} (${source})`);
				// Ensure the symbol is added to the engine's real-time harvesting universe
				try {
					const { redisConnection } = await import("../scheduler/queue");
					await redisConnection.sadd("harvest:realtime:symbols", symbol.toUpperCase());
					logger.info(`[Auto-Harvest] Symbol ${symbol} promoted to real-time set via subscription`);
				} catch (err) {
					logger.error(`Failed to promote ${symbol} to harvest set`, err);
				}
			},
			(symbol) => {
				logger.debug(`Subscription removed: ${symbol}`);
				// We don't remove from Redis automatically here to avoid flapping,
				// as multiple users or workers might still need it.
			},
		);

		// 4. Circle Back: Broadcaster needs SubscriptionManager
		this.broadcaster.setSubscriptionManager(this.subscriptionManager);
	}

	// ==================== Client Management ====================

	registerClient(ws: ServerWebSocket<any> & { id: string }) {
		this.clientManager.registerClient(ws);
	}

	unregisterClient(ws: ServerWebSocket<any> & { id: string }) {
		const state = this.clientManager.unregisterClient(ws);
		if (state) {
			this.subscriptionManager.removeClientFromAll(ws.id || (ws as any).data?.id, state.subscriptions);
		}
	}

	handleMessage(ws: ServerWebSocket<any> & { id: string }, message: string) {
		const id = ws.id || (ws as any).data?.id;
		const msg = this.clientManager.handleMessage(ws, message);

		if (msg) {
			if (msg.type === "subscribe") {
				this.subscriptionManager.handleSubscribe(id, msg);
			} else if (msg.type === "unsubscribe") {
				this.subscriptionManager.handleUnsubscribe(id, msg);
			}
		}
	}

	// ==================== Lifecycle ====================

	async shutdown() {
		await this.redisHandler.shutdown();
		logger.info("RealtimeService shutdown");
	}
}

export const realtimeService = new RealtimeService();
