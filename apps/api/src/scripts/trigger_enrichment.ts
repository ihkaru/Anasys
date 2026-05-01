import { Queue } from "bullmq";
import Redis from "ioredis";

async function triggerEnrichment() {
	console.log("🚀 Triggering Fundamentals Enrichment Job...");

	const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
		maxRetriesPerRequest: null,
	});

	const harvestQueue = new Queue("harvest", { connection });

	const job = await harvestQueue.add(
		"enrichment",
		{},
		{
			jobId: `manual-enrichment-${Date.now()}`,
		},
	);

	console.log(`✅ Job added: ${job.id}`);
	process.exit(0);
}

triggerEnrichment().catch((err) => {
	console.error(err);
	process.exit(1);
});
