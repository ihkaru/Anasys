import { Logger } from "../../utils/logger";
import { harvestQueue, redisConnection, registerRecurringJobs } from "./queue";
import { createHarvestWorker } from "./workers/harvest.orchestrator";
import { alertWorker } from "../alert/workers/alert.worker";
import { candleConsumer } from "../alert/services/CandleConsumer";

const logger = new Logger("SchedulerService");

/**
 * SchedulerService — BullMQ Edition
 *
 * Menggantikan setInterval yang fragile dengan BullMQ:
 * - Jobs persist saat API restart (disimpan di Redis)
 * - Retry otomatis dengan exponential backoff
 * - Deduplication via jobId
 * - Monitoring via Bull Board UI
 */
export class SchedulerService {
	private worker: ReturnType<typeof createHarvestWorker> | null = null;
	private alertWorker = alertWorker;
	private candleConsumer = candleConsumer;

	async start() {
		logger.info("🚀 Starting BullMQ-based Scheduler...");

		// Pastikan koneksi Redis siap
		await redisConnection.connect().catch(() => {
			// lazyConnect: sudah connected, ignore
		});

		// Daftarkan recurring cron jobs (idempotent)
		await registerRecurringJobs();

		// Buat dan jalankan central harvest worker
		this.worker = createHarvestWorker();

		// Wire up error handlers
		this.worker.on("completed", (job) => {
			logger.info(`✅ Job completed: ${job.name} (${job.id})`);
		});
		this.worker.on("failed", (job, err) => {
			logger.error(`❌ Job failed: ${job?.name} (${job?.id}): ${err.message}`);
		});

		logger.info("✅ BullMQ Scheduler running. Central HarvestOrchestrator active.");
		logger.info("✅ Alert evaluation worker active.");

		// Start CandleConsumer (Redis Stream -> BullMQ bridge)
		this.candleConsumer.start().catch((err) => {
			logger.error("❌ Failed to start CandleConsumer", err);
		});
		logger.info("✅ CandleConsumer running.");

		// Trigger VIP sync segera saat startup (bukan tunggu 15 menit)
		await harvestQueue.add(
			"vip-sync",
			{},
			{
				jobId: `startup-vip-${Date.now()}`,
			},
		);
	}

	async stop() {
		logger.info("Stopping BullMQ Scheduler...");
		if (this.worker) await this.worker.close();
		await this.alertWorker.stop();
		await this.candleConsumer.stop();
		await redisConnection.quit();
		logger.info("Scheduler stopped.");
	}
}

export const schedulerService = new SchedulerService();
