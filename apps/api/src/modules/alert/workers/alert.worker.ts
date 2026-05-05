import { type Job, Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { alertHistory, alerts, symbols } from "@packages/db/src/schema";
import { Logger } from "../../../utils/logger";
import { redisConnection } from "../../scheduler/queue";
import { alertEvaluationService } from "../services/AlertEvaluationService";
import { alertNotificationService, type AlertParams } from "../services/AlertNotificationService";

/**
 * Alert Worker (ADR-0014)
 *
 * Processes individual alert evaluation jobs dispatched by the HarvestOrchestrator.
 * Uses Redis for sub-ms cooldown checks (hot path) instead of querying Postgres timestamps.
 *
 * State machine:
 *   ACTIVE ──[condition met]──► TRIGGERED ──[notify]──► COOLDOWN (via Redis TTL)
 *   COOLDOWN ──[TTL expired]──► ACTIVE (automatic — no scheduler needed)
 *   ACTIVE/COOLDOWN ──[user pause]──► PAUSED
 */
export class AlertWorker {
	private logger = new Logger("AlertWorker");
	private worker: Worker;

	constructor() {
		this.worker = new Worker(
			"alerts",
			async (job: Job) => {
				await this.process(job);
			},
			{
				connection: redisConnection,
				concurrency: 5, // Evaluate up to 5 alerts in parallel
				removeOnComplete: { count: 100 },
				removeOnFail: { count: 100 },
			},
		);

		this.worker.on("failed", (job, err) => {
			this.logger.error(`Job ${job?.id} failed:`, err);
		});
	}

	private async process(job: Job) {
		const { alertId } = job.data;

		// 1. Fetch Alert Config (only ACTIVE alerts are processed)
		const [alert] = await db
			.select()
			.from(alerts)
			.where(and(eq(alerts.id, alertId), eq(alerts.status, "ACTIVE")))
			.limit(1);

		if (!alert) {
			this.logger.debug(`Alert ${alertId} not found or not ACTIVE — skipping.`);
			return;
		}

		// 2. Cooldown Check via Redis (HOT PATH — sub-ms)
		// Key format: alert:cooldown:{id} with TTL = cooldown_minutes * 60 seconds
		const cooldownKey = `alert:cooldown:${alert.id}`;
		const inCooldown = await redisConnection.exists(cooldownKey);

		if (inCooldown) {
			this.logger.debug(`Alert ${alert.id} is in cooldown (Redis). Skipping.`);
			return;
		}

		// 3. Resolve Symbol Info
		const [symbol] = await db.select().from(symbols).where(eq(symbols.id, alert.symbolId)).limit(1);

		if (!symbol) {
			this.logger.error(`Symbol ${alert.symbolId} not found for alert ${alert.id}`);
			return;
		}

		// 4. Evaluate using PineTS
		this.logger.debug(`Evaluating alert ${alert.id} (${alert.name}) for ${symbol.ticker}`);
		const result = await alertEvaluationService.evaluate(
			symbol.ticker,
			alert.interval,
			"YAHOO", // Default source — TODO: make configurable via alert.params
			alert.pineScript,
		);

		if (!result) return;

		// 5. Handle Trigger
		if (result.isTriggered) {
			this.logger.info(`🚨 ALERT TRIGGERED: [${alert.name}] for ${symbol.ticker} (Value: ${result.lastValue})`);

			const now = new Date();
			const cooldownSecs = (alert.cooldownMinutes ?? 60) * 60;

			// 5a. Set cooldown in Redis (hot path — prevents storm)
			await redisConnection.setex(cooldownKey, cooldownSecs, "1");

			// 5b. Update Alert State to TRIGGERED in Postgres (cold path)
			await db
				.update(alerts)
				.set({
					status: "TRIGGERED",
					lastTriggeredAt: now,
					updatedAt: now,
				})
				.where(eq(alerts.id, alert.id));

			// 5c. Build snapshot for history
			const snapshot: Record<string, number> = {};
			try {
				const parsed = JSON.parse(result.snapshot ?? "{}");
				for (const [k, v] of Object.entries(parsed)) {
					if (typeof v === "number") snapshot[k] = v;
				}
			} catch {
				// non-critical
			}

			// 5d. Record in History with PENDING delivery status
			const [historyRow] = await db
				.insert(alertHistory)
				.values({
					alertId: alert.id,
					message: `Condition met for ${symbol.ticker}. Value: ${result.lastValue.toFixed(4)}`,
					dataSnapshot: result.snapshot,
					triggeredAt: now,
					// deliveryStatus defaults to PENDING via schema
				})
				.returning({ id: alertHistory.id });

			// 5e. Dispatch notifications (async — does NOT block state machine)
			const params: AlertParams | null = alert.params ? JSON.parse(alert.params) : null;
			alertNotificationService
				.dispatch({
					historyId: historyRow.id,
					alertId: alert.id,
					alertName: alert.name,
					symbolTicker: symbol.ticker,
					message: `Condition met for ${symbol.ticker}. Value: ${result.lastValue.toFixed(4)}`,
					triggeredAt: now,
					snapshot,
					params,
				})
				.then(() => {
					// After notification completes, transition back to ACTIVE
					// (cooldown is managed by Redis TTL, not Postgres status)
					return db.update(alerts).set({ status: "ACTIVE", updatedAt: new Date() }).where(eq(alerts.id, alert.id));
				})
				.catch((e) => {
					this.logger.error(`Notification dispatch failed for alert ${alert.id}:`, e);
				});
		}
	}

	async stop() {
		await this.worker.close();
	}
}

export const alertWorker = new AlertWorker();
