import { Queue } from "bullmq";
import Redis from "ioredis";

async function triggerBackfill() {
	console.log("🚀 Triggering Historical Backfill Job...");

	const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
		maxRetriesPerRequest: null,
	});

	const harvestQueue = new Queue("harvest", { connection });

	const job = await harvestQueue.add(
		"backfill",
		{},
		{
			jobId: `manual-backfill-${Date.now()}`,
		},
	);

	console.log(`✅ Job added: ${job.id}`);
	process.exit(0);
}

triggerBackfill().catch((err) => {
	console.error(err);
	process.exit(1);
});
