/**
 * Alert Notification Dispatcher (ADR-0014 — Tahap 2 Foundation)
 *
 * Pluggable dispatcher that routes alert events to one or more channels.
 * Channel detection is based on the alert's `params` JSON field:
 *   - { webhook_url: "https://..." }   → Webhook channel
 *   - { telegram_chat_id: "123..." }   → Telegram channel (requires BOT_TOKEN env)
 *
 * Log channel is always active for observability.
 *
 * Adding a new channel:
 *   1. Add its config key to AlertParams interface
 *   2. Add a private sendX() method
 *   3. Call it in dispatch()
 */

import { Logger } from "../../../utils/logger";
import { db } from "../../../db";
import { eq } from "drizzle-orm";
import { realtimeService } from "../../realtime/realtime.service";
import { alertHistory, alerts } from "@packages/db/src/schema";

export interface AlertParams {
	webhook_url?: string;
	telegram_chat_id?: string;
	// Future: slack_webhook_url, email, etc.
}

export interface AlertNotificationPayload {
	historyId: number; // ID of the alert_history row just created
	alertId: number;
	alertName: string;
	symbolTicker: string;
	message: string;
	triggeredAt: Date;
	snapshot?: Record<string, number>;
	params?: AlertParams | null;
}

export class AlertNotificationService {
	private logger = new Logger("AlertNotificationService");

	/**
	 * Main dispatch entry point.
	 * Tries all configured channels, marks delivery_status accordingly.
	 */
	async dispatch(payload: AlertNotificationPayload): Promise<void> {
		const channels: Promise<void>[] = [this.sendLog(payload), this.sendWebSocket(payload)];

		if (payload.params?.webhook_url) {
			channels.push(this.sendWebhook(payload, payload.params.webhook_url));
		}

		if (payload.params?.telegram_chat_id) {
			channels.push(this.sendTelegram(payload, payload.params.telegram_chat_id));
		}

		const results = await Promise.allSettled(channels);
		const anyFailed = results.some((r) => r.status === "rejected");

		if (!anyFailed) {
			await this.markDelivered(payload.historyId);
		} else {
			results.forEach((r) => {
				if (r.status === "rejected") {
					this.logger.error("Notification channel failed:", r.reason);
				}
			});
			await this.markFailed(payload.historyId);
		}
	}

	// ── Channel: Console Log (always active) ────────────────────────────────

	private async sendLog(payload: AlertNotificationPayload): Promise<void> {
		this.logger.info(
			`📣 ALERT [${payload.alertName}] — ${payload.symbolTicker}: ${payload.message} (at ${payload.triggeredAt.toISOString()})`,
		);
	}

	// ── Channel: WebSocket (per-user) ────────────────────────────────────────
	private async sendWebSocket(payload: AlertNotificationPayload): Promise<void> {
		// 1. Get userId from the alert config
		const [alert] = await db
			.select({ userId: alerts.userId })
			.from(alerts)
			.where(eq(alerts.id, payload.alertId))
			.limit(1);

		if (!alert) {
			this.logger.error(`Failed to find alert ${payload.alertId} for WS notification`);
			return;
		}

		// 2. Dispatch via RealtimeService
		realtimeService.sendToUser(alert.userId, "ALERT_TRIGGERED", {
			id: payload.alertId,
			historyId: payload.historyId,
			name: payload.alertName,
			symbol: payload.symbolTicker,
			message: payload.message,
			triggeredAt: payload.triggeredAt.toISOString(),
			snapshot: payload.snapshot || {},
		});

		this.logger.info(`[WebSocket] ✅ Dispatched to user ${alert.userId}`);
	}

	// ── Channel: Generic Webhook ─────────────────────────────────────────────

	private async sendWebhook(payload: AlertNotificationPayload, webhookUrl: string): Promise<void> {
		const body = {
			alert_id: payload.alertId,
			alert_name: payload.alertName,
			symbol: payload.symbolTicker,
			message: payload.message,
			triggered_at: payload.triggeredAt.toISOString(),
			snapshot: payload.snapshot ?? {},
		};

		const res = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			throw new Error(`Webhook delivery failed (${res.status}): ${await res.text()}`);
		}

		this.logger.info(`[Webhook] ✅ Delivered to ${webhookUrl}`);
	}

	// ── Channel: Telegram Bot ────────────────────────────────────────────────

	private async sendTelegram(payload: AlertNotificationPayload, chatId: string): Promise<void> {
		const botToken = process.env.TELEGRAM_BOT_TOKEN;

		if (!botToken) {
			this.logger.warn("[Telegram] TELEGRAM_BOT_TOKEN not set — skipping.");
			return;
		}

		const text = [
			`🚨 *Alert Triggered*`,
			`*Name:* ${payload.alertName}`,
			`*Symbol:* ${payload.symbolTicker}`,
			`*Message:* ${payload.message}`,
			`*Time:* ${payload.triggeredAt.toISOString()}`,
		].join("\n");

		const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: chatId,
				text,
				parse_mode: "Markdown",
			}),
		});

		if (!res.ok) {
			throw new Error(`Telegram delivery failed (${res.status}): ${await res.text()}`);
		}

		this.logger.info(`[Telegram] ✅ Delivered to chat ${chatId}`);
	}

	// ── Delivery Status Helpers ──────────────────────────────────────────────

	private async markDelivered(historyId: number): Promise<void> {
		await db
			.update(alertHistory)
			.set({ deliveryStatus: "SENT", deliveredAt: new Date() })
			.where(eq(alertHistory.id, historyId));
	}

	private async markFailed(historyId: number): Promise<void> {
		await db.update(alertHistory).set({ deliveryStatus: "FAILED" }).where(eq(alertHistory.id, historyId));
	}
}

export const alertNotificationService = new AlertNotificationService();
