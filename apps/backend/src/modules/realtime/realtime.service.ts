import type { ServerWebSocket } from "bun";
import { Logger } from "../../utils/logger";
import { Broadcaster } from "./broadcasting/Broadcaster";
import { ClientManager } from "./managers/ClientManager";
import { SubscriptionManager } from "./managers/SubscriptionManager";
import { UpstreamRouter } from "./routing/UpstreamRouter";
import { BinanceStreamHandler } from "./streams/BinanceStreamHandler";
import { TradingViewStreamHandler } from "./streams/TradingViewStreamHandler";
import { YahooPollingHandler } from "./streams/YahooPollingHandler";

const logger = new Logger("RealtimeService");

export class RealtimeService {
	private clientManager: ClientManager;
	private subscriptionManager: SubscriptionManager;
	private broadcaster: Broadcaster;
	private upstreamRouter: UpstreamRouter;
	private binanceHandler: BinanceStreamHandler;
	private yahooHandler: YahooPollingHandler;
	private tradingViewHandler: TradingViewStreamHandler;

	constructor() {
		logger.info("RealtimeService initialized (Refactored)");

		// 1. Core Managers
		this.clientManager = new ClientManager();
		this.broadcaster = new Broadcaster(this.clientManager);

		// 2. Stream Handlers (Dependencies: Broadcaster)
		this.binanceHandler = new BinanceStreamHandler(this.broadcaster);
		this.yahooHandler = new YahooPollingHandler(this.broadcaster);
		this.tradingViewHandler = new TradingViewStreamHandler(this.broadcaster);

		// 3. Upstream Router (Dependencies: Handlers)
		this.upstreamRouter = new UpstreamRouter(this.binanceHandler, this.yahooHandler, this.tradingViewHandler);

		// 4. Subscription Manager (Dependencies: ClientManager, Router Callbacks)
		this.subscriptionManager = new SubscriptionManager(
			this.clientManager,
			(symbol, channel, interval, source) => {
				this.upstreamRouter.ensureUpstreamConnection(symbol, channel, interval, source);
			},
			(symbol) => {
				this.upstreamRouter.handleUnsubscribe(symbol);
			},
		);

		// 5. Circle Back: Broadcaster needs SubscriptionManager
		this.broadcaster.setSubscriptionManager(this.subscriptionManager);
	}

	// ==================== Client Management ====================

	registerClient(ws: ServerWebSocket<any> & { id: string }) {
		this.clientManager.registerClient(ws);
	}

	unregisterClient(ws: ServerWebSocket<any> & { id: string }) {
		const state = this.clientManager.unregisterClient(ws);
		if (state) {
			// Clean up subscriptions
			// We pass the set of subscriptions the client had so manager can clean up
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

	shutdown() {
		this.upstreamRouter.shutdown();
		logger.info("RealtimeService shutdown");
	}
}

export const realtimeService = new RealtimeService();
