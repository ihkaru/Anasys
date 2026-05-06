import { performance } from "node:perf_hooks";
// import { Logger } from "../src/utils/logger";

// const logger = new Logger("StressAudit");

const API_PORT = process.env.PORT || 28081;
const API_BASE = `http://localhost:${API_PORT}/api/market`;
const DEV_SECRET = "dev_secret_123";

interface BenchmarkResult {
	scenario: string;
	latency: number;
	count: number;
	status: "PASS" | "FAIL" | "WARN";
	details: string;
}

async function fetchHistory(symbol: string, interval: string, before?: string) {
	const url = new URL(`${API_BASE}/history/${symbol}`);
	url.searchParams.set("interval", interval);
	url.searchParams.set("limit", "500");
	if (before) url.searchParams.set("before", before);

	const start = performance.now();
	const res = await fetch(url.toString(), {
		headers: { "X-Dev-Secret": DEV_SECRET },
	});
	const end = performance.now();

	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const body = (await res.json()) as any;

	return {
		latency: end - start,
		data: body.data || [],
		success: body.success,
	};
}

async function fetchMonitoring() {
	const start = performance.now();
	const res = await fetch(`${API_BASE}/monitoring`, {
		headers: { "X-Dev-Secret": DEV_SECRET },
	});
	const end = performance.now();
	return { latency: end - start, ok: res.ok };
}

async function run() {
	console.log("\n🔥 ANASYS STRESS-AUDIT BENCHMARK v2 🔥");
	console.log("======================================");

	const results: BenchmarkResult[] = [];
	const ticker = "AAPL";

	// --- Scenario 1: Recent Data (Warm/QuestDB) ---
	console.log("Scenario 1: Fetching Recent Data...");
	try {
		const res = await fetchHistory(ticker, "1d");
		results.push({
			scenario: "Recent Data (1d)",
			latency: res.latency,
			count: res.data.length,
			status: res.latency < 200 ? "PASS" : "WARN",
			details: `Latency: ${res.latency.toFixed(2)}ms`,
		});
	} catch (e: any) {
		results.push({ scenario: "Recent Data (1d)", latency: 0, count: 0, status: "FAIL", details: e.message });
	}

	// --- Scenario 2: Deep History (Cold Start / Smart Wait) ---
	// We use a specific date that likely hasn't been backfilled deep enough
	const historicalDate = "2021-01-01T00:00:00Z";
	console.log(`Scenario 2: Deep History Cold Start (${historicalDate})...`);
	try {
		const res = await fetchHistory(ticker, "1d", historicalDate);
		// With Adaptive Smart Wait, this should take ~2s if missing, or <100ms if exists
		const status = res.latency < 2500 ? "PASS" : "FAIL";
		results.push({
			scenario: "Deep History (Cold)",
			latency: res.latency,
			count: res.data.length,
			status,
			details: `Latency: ${res.latency.toFixed(2)}ms (Limit: 2.5s)`,
		});
	} catch (e: any) {
		results.push({ scenario: "Deep History (Cold)", latency: 0, count: 0, status: "FAIL", details: e.message });
	}

	// --- Scenario 3: Data Quality Audit (The Redness Check) ---
	console.log("Scenario 3: Auditing Data Integrity (OHLC Consistency)...");
	try {
		const res = await fetchHistory(ticker, "1d", "2022-01-01T00:00:00Z");
		const candles = res.data;
		let redCount = 0;
		let greenCount = 0;
		let anomalyCount = 0;

		for (const c of candles) {
			if (c.close < c.open) redCount++;
			else greenCount++;

			// Check if high is really high
			if (c.high < c.open || c.high < c.close || c.low > c.open || c.low > c.close) {
				anomalyCount++;
			}
		}

		const redRatio = redCount / (candles.length || 1);
		const qualityStatus = redRatio > 0.3 && redRatio < 0.7 && anomalyCount === 0 ? "PASS" : "WARN";

		results.push({
			scenario: "Data Integrity Audit",
			latency: 0,
			count: candles.length,
			status: qualityStatus,
			details: `Red/Green: ${redCount}/${greenCount}, Ratio: ${(redRatio * 100).toFixed(1)}%, Anomalies: ${anomalyCount}`,
		});
	} catch (e: any) {
		results.push({ scenario: "Data Integrity Audit", latency: 0, count: 0, status: "FAIL", details: e.message });
	}

	// --- Scenario 4: Monitoring Throughput (Load Test) ---
	console.log("Scenario 4: Monitoring Latency under potential load...");
	try {
		// Trigger a background sync first by requesting a new symbol
		fetchHistory("MSFT", "1h", "2020-01-01T00:00:00Z").catch(() => {});

		const m1 = await fetchMonitoring();
		const m2 = await fetchMonitoring(); // Second one should be cached (0ms)

		results.push({
			scenario: "Monitoring Latency",
			latency: m1.latency,
			count: 0,
			status: m1.latency < 500 ? "PASS" : "FAIL",
			details: `Request 1: ${m1.latency.toFixed(2)}ms, Request 2 (Cached): ${m2.latency.toFixed(2)}ms`,
		});
	} catch (e: any) {
		results.push({ scenario: "Monitoring Latency", latency: 0, count: 0, status: "FAIL", details: e.message });
	}

	console.log("\n📊 AUDIT REPORT SUMMARY");
	console.log("--------------------------------------");
	console.table(
		results.map((r) => ({
			Scenario: r.scenario,
			Status: r.status === "PASS" ? "✅ PASS" : r.status === "WARN" ? "⚠️ WARN" : "❌ FAIL",
			Result: r.details,
		})),
	);

	const failed = results.filter((r) => r.status === "FAIL");
	if (failed.length > 0) {
		console.log(`\n❌ Benchmark FAILED with ${failed.length} critical errors.`);
		process.exit(1);
	} else {
		console.log("\n🌟 ALL CRITICAL PERFORMANCE STANDARDS MET.");
	}
}

run().catch((e) => {
	console.error("Benchmark Execution Error:", e);
	process.exit(1);
});
