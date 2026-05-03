/**
 * CandleConsumer — Redis Streams → BullMQ bridge (ADR-0015)
 *
 * Reads closed OHLCV candle events from `stream:candles:{interval}` (written
 * by the Rust CandleStreamer) and fans them out to the existing BullMQ `alerts`
 * queue for PineTS evaluation by AlertWorker.
 *
 * Design decisions:
 * - Uses Redis Streams + consumer groups (NOT Pub/Sub) for at-least-once delivery.
 *   If this process restarts, it resumes from the last ACK'd entry.
 * - Does NOT evaluate PineTS directly — delegates to AlertWorker (separation of concerns).
 * - XACK is called only AFTER the BullMQ job is enqueued, ensuring no candle is silently dropped.
 *
 * Consumer group: `alert-engine`
 * Consumer name:  `candle-consumer-{process.pid}`
 */

import { Queue } from "bullmq";
import { db } from "../../../db";
import { alerts } from "@packages/db/src/schema";
import { and, eq } from "drizzle-orm";
import { redisConnection } from "../../scheduler/queue";
import { Logger } from "../../../utils/logger";

// Intervals we subscribe to — must match CandleStreamer STREAMING_INTERVALS in Rust
const STREAMING_INTERVALS = ["1m", "5m", "15m", "1h"];
const CONSUMER_GROUP = "alert-engine";
const CONSUMER_NAME = `candle-consumer-${process.pid}`;
const BLOCK_MS = 2000; // Long-poll timeout per XREADGROUP call
const BATCH_SIZE = 20; // Max entries per XREADGROUP call

interface CandleEntry {
	id: string; // Redis Stream entry ID
	symbol: string;
	interval: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	timestamp: number; // Unix seconds UTC (bar close)
}

export class CandleConsumer {
	private logger = new Logger("CandleConsumer");
	private alertQueue: Queue;
	private running = false;

	constructor() {
		this.alertQueue = new Queue("alerts", { connection: redisConnection });
	}

	/**
	 * Start the consumer. Call once at API boot.
	 * Runs in background — returns immediately.
	 */
	async start(): Promise<void> {
		if (this.running) return;
		this.running = true;

		// Ensure consumer groups exist for all intervals
		for (const interval of STREAMING_INTERVALS) {
			await this.ensureConsumerGroup(`stream:candles:${interval}`);
		}

		this.logger.info(
			`[CandleConsumer] Started — group=${CONSUMER_GROUP} consumer=${CONSUMER_NAME} intervals=${STREAMING_INTERVALS.join(",")}`,
		);

		// Run each interval consumer in its own async loop
		for (const interval of STREAMING_INTERVALS) {
			this.runLoop(interval).catch((e) => {
				this.logger.error(`[CandleConsumer] Loop for ${interval} crashed:`, e);
			});
		}
	}

	async stop(): Promise<void> {
		this.running = false;
		this.logger.info("[CandleConsumer] Stopping...");
	}

	// ── Per-interval consumer loop ────────────────────────────────────────────

	private async runLoop(interval: string): Promise<void> {
		const streamKey = `stream:candles:${interval}`;

		while (this.running) {
			try {
				const entries = await this.readEntries(streamKey);
				if (entries.length === 0) continue; // Timeout (BLOCK_MS elapsed, no new data)

				for (const entry of entries) {
					await this.processEntry(entry);
					await this.ack(streamKey, entry.id);
				}
			} catch (e) {
				this.logger.error(`[CandleConsumer] Error in ${interval} loop:`, e);
				await new Promise((r) => setTimeout(r, 1000)); // Brief pause before retry
			}
		}
	}

	// ── Redis Stream read ─────────────────────────────────────────────────────

	private async readEntries(streamKey: string): Promise<CandleEntry[]> {
		// XREADGROUP GROUP alert-engine candle-consumer-{pid}
		//   COUNT 20 BLOCK 2000 STREAMS stream:candles:1m >
		const result = await (redisConnection as any).xreadgroup(
			"GROUP",
			CONSUMER_GROUP,
			CONSUMER_NAME,
			"COUNT",
			BATCH_SIZE,
			"BLOCK",
			BLOCK_MS,
			"STREAMS",
			streamKey,
			">", // '>' means: only undelivered messages
		);

		if (!result) return []; // BLOCK timeout

		const entries: CandleEntry[] = [];
		for (const [, streamEntries] of result) {
			for (const [id, fields] of streamEntries) {
				const entry = parseStreamEntry(id, fields);
				if (entry) entries.push(entry);
			}
		}
		return entries;
	}

	// ── Process one candle entry ──────────────────────────────────────────────

	private async processEntry(entry: CandleEntry): Promise<void> {
		// Find all ACTIVE alerts matching this symbol + interval
		const matchingAlerts = await db
			.select({ id: alerts.id, name: alerts.name })
			.from(alerts)
			.innerJoin(symbols, eq(alerts.symbolId, symbols.id))
			.where(
				and(
					eq(alerts.status, "ACTIVE"),
					eq(alerts.interval, entry.interval),
					eq(symbols.ticker, entry.symbol),
				),
			);

		if (matchingAlerts.length === 0) {
			return; // No active alerts for this specific symbol/interval
		}

		// Enqueue one BullMQ job per alert
		const jobs = matchingAlerts.map((alert) => ({
			name: "evaluate",
			data: {
				alertId: alert.id,
				candle: entry, // Pass the candle so AlertWorker can skip re-fetch if needed
			},
		}));

		await this.alertQueue.addBulk(jobs);

		this.logger.debug(
			`[CandleConsumer] ${entry.symbol}/${entry.interval} ts=${entry.timestamp} → ${jobs.length} alert jobs enqueued`,
		);
	}

	// ── Redis Stream helpers ──────────────────────────────────────────────────

	private async ensureConsumerGroup(streamKey: string): Promise<void> {
		try {
			await (redisConnection as any).xgroup(
				"CREATE",
				streamKey,
				CONSUMER_GROUP,
				"$", // Start from new messages (backfill already in QuestDB)
				"MKSTREAM",
			);
			this.logger.info(`[CandleConsumer] Consumer group created: ${streamKey}`);
		} catch (e: any) {
			if (e.message?.includes("BUSYGROUP")) {
				// Already exists — idempotent
				this.logger.debug(`[CandleConsumer] Consumer group already exists: ${streamKey}`);
			} else {
				throw e;
			}
		}
	}

	private async ack(streamKey: string, entryId: string): Promise<void> {
		await (redisConnection as any).xack(streamKey, CONSUMER_GROUP, entryId);
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseStreamEntry(id: string, fields: string[]): CandleEntry | null {
	// Redis returns fields as flat [key, value, key, value, ...] array
	const map: Record<string, string> = {};
	for (let i = 0; i < fields.length - 1; i += 2) {
		map[fields[i]] = fields[i + 1];
	}

	const symbol = map["symbol"];
	const interval = map["interval"];
	const timestamp = parseInt(map["timestamp"] ?? "0", 10);

	if (!symbol || !interval || !timestamp) return null;

	return {
		id,
		symbol,
		interval,
		open: parseFloat(map["open"] ?? "0"),
		high: parseFloat(map["high"] ?? "0"),
		low: parseFloat(map["low"] ?? "0"),
		close: parseFloat(map["close"] ?? "0"),
		volume: parseFloat(map["volume"] ?? "0"),
		timestamp,
	};
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const candleConsumer = new CandleConsumer();
