import { Queue } from "bullmq";
import Redis from "ioredis";

async function triggerDiscovery() {
	console.log("🚀 Triggering Symbol Discovery Job...");

	const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
		maxRetriesPerRequest: null,
	});

	const harvestQueue = new Queue("harvest", { connection });

	const job = await harvestQueue.add(
		"discovery",
		{},
		{
			jobId: `manual-discovery-${Date.now()}`,
		},
	);

	console.log(`✅ Job added: ${job.id}`);
	process.exit(0);
}

triggerDiscovery().catch((err) => {
	console.error(err);
	process.exit(1);
});
