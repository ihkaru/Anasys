import Redis from "ioredis";
import { Logger } from "../../../utils/logger";
import type { Broadcaster } from "../broadcasting/Broadcaster";
import type { QuoteUpdate } from "../realtime.types";
import { CandleAggregator } from "../utils/CandleAggregator";
import { StreamMonitorService } from "../services/StreamMonitorService";

const logger = new Logger("RedisStreamHandler");

/**
 * Handles real-time data consumption from Redis Pub/Sub (published by Rust Engine)
 */
export class RedisStreamHandler {
	private subscriber: Redis;
	private aggregator = new CandleAggregator();

	constructor(private broadcaster: Broadcaster) {
		const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
		// When in subscriber mode, ioredis should not try to run regular commands like INFO (readyCheck)
		this.subscriber = new Redis(redisUrl, {
			enableReadyCheck: false,
			maxRetriesPerRequest: null,
		});

		this.subscriber.on("ready", () => {
			logger.info("Connected to Redis Pub/Sub (Ready)");
			this.isConnected = true;
			this.subscribeToAll();
		});

		this.subscriber.on("error", (err) => {
			logger.error("Redis Pub/Sub error", err);
		});

		this.subscriber.on("message", (channel, message) => {
			this.handleMessage(channel, message);
		});
	}

	private async subscribeToAll() {
		try {
			await this.subscriber.subscribe("ticks:all");
			logger.info("Subscribed to channel: ticks:all");
		} catch (err) {
			logger.error("Failed to subscribe to Redis channel", err);
		}
	}

	private handleMessage(channel: string, message: string) {
		try {
			const data = JSON.parse(message);

			if (channel === "ticks:all") {
				this.processTick(data);
			}
		} catch (err) {
			logger.error("Failed to process Redis message", err);
		}
	}

	private processTick(data: any) {
		// Map Rust Engine TickData to API QuoteUpdate
		// Rust: { symbol: "BINANCE:BTCUSDT", price, volume, timestamp }
		const symbol = data.symbol;
		const timestampMs = data.timestamp * 1000;

		// Record Lag Metric
		const lagMs = Date.now() - timestampMs;
		StreamMonitorService.getInstance().recordLag(symbol, lagMs);

		const update: QuoteUpdate = {
			symbol: symbol,
			price: data.price,
			volume: data.volume,
			timestamp: timestampMs,
			change: 0,
			changePercent: 0,
		};

		// Determine source from symbol prefix (e.g. "BINANCE:BTCUSDT" -> "BINANCE")
		const parts = symbol.split(":");
		const source = parts.length > 1 ? parts[0] : "ENGINE";

		// Broadcast to clients who subscribed with this specific source
		this.broadcaster.broadcastQuote(symbol, update, source);

		// Also broadcast as "ENGINE" source as a fallback/universal source
		if (source !== "ENGINE") {
			this.broadcaster.broadcastQuote(symbol, update, "ENGINE");
		}

		// --- NEW: OHLCV AGGREGATION ---
		const candle = this.aggregator.processTick(symbol, data.price, data.volume, update.timestamp);

		// Broadcast 1m candle (passing interval="1m")
		this.broadcaster.broadcastOHLCV(symbol, "1m", candle);
	}

	async shutdown() {
		await this.subscriber.quit();
		logger.info("RedisStreamHandler shutdown");
	}
}
