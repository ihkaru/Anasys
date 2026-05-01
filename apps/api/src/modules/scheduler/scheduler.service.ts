import { Logger } from "../../utils/logger";
import { harvestQueue, redisConnection, registerRecurringJobs } from "./queue";
import { createHarvestWorker } from "./workers/harvest.orchestrator";

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
		await redisConnection.quit();
		logger.info("Scheduler stopped.");
	}
}

export const schedulerService = new SchedulerService();
