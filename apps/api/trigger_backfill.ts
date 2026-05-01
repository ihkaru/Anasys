import { harvestQueue } from "./src/modules/scheduler/queue";

async function run() {
	console.log("Manual high-throughput backfill triggered...");
	await harvestQueue.add("backfill", {}, { jobId: `manual-burst-${Date.now()}` });
	process.exit(0);
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
