import Redis from "ioredis";
import { Queue } from "bullmq";

const redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const harvestQueue = new Queue("harvest", { connection: redisConnection });

async function trigger() {
	console.log("🚀 Triggering Optimized Backfill Test...");
	const job = await harvestQueue.add(
		"backfill",
		{},
		{
			jobId: `test-backfill-final-${Date.now()}`,
			removeOnComplete: true,
		},
	);
	console.log(`✅ Job added: ${job.id}`);
	process.exit(0);
}

trigger().catch(console.error);
