import { Queue } from "bullmq";
import Redis from "ioredis";

// Shared Redis connection untuk BullMQ
// maxRetriesPerRequest: null wajib untuk BullMQ workers
export const redisConnection = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
	maxRetriesPerRequest: null,
	lazyConnect: true,
});

// Satu queue untuk semua harvest jobs
export const harvestQueue = new Queue("harvest", {
	connection: redisConnection,
	defaultJobOptions: {
		removeOnComplete: 100, // simpan 100 completed jobs terakhir untuk audit
		removeOnFail: 50,
		attempts: 3,
		backoff: {
			type: "exponential",
			delay: 5000, // mulai dari 5 detik, naik 2x tiap retry
		},
	},
});

// Queue khusus untuk evaluasi alert algo trading
export const alertQueue = new Queue("alerts", {
	connection: redisConnection,
	defaultJobOptions: {
		removeOnComplete: 200,
		removeOnFail: 100,
		attempts: 2,
		backoff: {
			type: "fixed",
			delay: 60000, // retry setelah 1 menit jika gagal
		},
	},
});

/**
 * Daftarkan semua recurring jobs.
 * Idempotent: aman dipanggil berkali-kali (BullMQ de-duplikasi berdasarkan jobId).
 */
export async function registerRecurringJobs(): Promise<void> {
	// VIP Sync: watchlist + holdings — tiap 15 menit
	await harvestQueue.add(
		"vip-sync",
		{},
		{
			repeat: { pattern: "*/15 * * * *" },
			jobId: "recurring-vip-sync",
		},
	);

	// Standard Sync: semua simbol di DB — tiap jam
	await harvestQueue.add(
		"standard-sync",
		{},
		{
			repeat: { pattern: "0 * * * *" },
			jobId: "recurring-standard-sync",
		},
	);

	// Discovery: cari simbol baru dari Binance + SEC EDGAR + IDX — tiap hari jam 2 pagi
	await harvestQueue.add(
		"discovery",
		{},
		{
			repeat: { pattern: "0 2 * * *" },
			jobId: "recurring-discovery",
		},
	);

	// Enrichment: isi metadata fundamental yang kosong — tiap 6 jam
	await harvestQueue.add(
		"enrichment",
		{},
		{
			repeat: { pattern: "0 */6 * * *" },
			jobId: "recurring-enrichment",
		},
	);

	// Backfill: proses antrean backfill historis — tiap 5 menit
	await harvestQueue.add(
		"backfill",
		{},
		{
			repeat: { pattern: "*/5 * * * *" },
			jobId: "recurring-backfill",
		},
	);

	// Incremental Sync: Forward fill for completed backfills — tiap 15 menit
	await harvestQueue.add(
		"incremental-sync",
		{},
		{
			repeat: { pattern: "*/15 * * * *" },
			jobId: "recurring-incremental-sync",
		},
	);

	console.log("[BullMQ] ✅ Recurring jobs registered");
}
