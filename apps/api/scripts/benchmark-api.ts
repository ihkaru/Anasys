import { performance } from "node:perf_hooks";

/**
 * Anasys API Benchmark Script
 *
 * Measures response times for critical market data endpoints.
 * Run with: bun run scripts/benchmark-api.ts
 */

const API_BASE = process.env.API_URL || "http://localhost:3002/api";
const SECRET = "dev_secret_123";
const ITERATIONS = 5;

// ANSI Colors for output
const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
};

async function request(path: string, options: any = {}) {
	const url = `${API_BASE}${path}`;
	const start = performance.now();

	try {
		const response = await fetch(url, {
			...options,
			headers: {
				...options.headers,
				"X-Dev-Secret": SECRET,
				"Content-Type": "application/json",
			},
		});

		const end = performance.now();
		const duration = end - start;

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`HTTP ${response.status}: ${text}`);
		}

		const data = await response.json();
		return { duration, data, status: response.status };
	} catch (err: any) {
		return { duration: performance.now() - start, error: err.message };
	}
}

async function runBenchmark(name: string, path: string, method = "GET", body?: any) {
	console.log(`${colors.bright}${colors.cyan}▶ Benchmarking ${name}...${colors.reset}`);
	console.log(`${colors.gray}  URL: ${method} ${path}${colors.reset}`);

	const results: number[] = [];
	let _successCount = 0;
	let sampleSize = 0;

	for (let i = 0; i < ITERATIONS; i++) {
		const res = await request(path, { method, body: body ? JSON.stringify(body) : undefined });

		if (res.error) {
			console.log(`  ${colors.red}✖ Iteration ${i + 1} FAILED: ${res.error}${colors.reset}`);
		} else {
			results.push(res.duration);
			_successCount++;
			if (i === 0 && res.data?.data) {
				sampleSize = Array.isArray(res.data.data) ? res.data.data.length : 1;
			}
			process.stdout.write(`${colors.green}.${colors.reset}`);
		}
		// Small delay between requests
		await new Promise((r) => setTimeout(r, 100));
	}
	console.log("");

	if (results.length === 0) {
		console.log(`  ${colors.red}!! ALL ITERATIONS FAILED !!${colors.reset}\n`);
		return;
	}

	const avg = results.reduce((a, b) => a + b, 0) / results.length;
	const min = Math.min(...results);
	const max = Math.max(...results);
	const p95 = results.sort((a, b) => a - b)[Math.floor(results.length * 0.95)];

	const speedColor = avg < 200 ? colors.green : avg < 1000 ? colors.yellow : colors.red;

	console.log(`  ${colors.bright}Results:${colors.reset}`);
	console.log(`  Average: ${speedColor}${avg.toFixed(2)}ms${colors.reset}`);
	console.log(`  Min/Max: ${min.toFixed(2)}ms / ${max.toFixed(2)}ms`);
	if (sampleSize > 0) {
		console.log(`  Payload: ${sampleSize} items returned`);
	}
	console.log("");

	return { avg, min, max, p95, name };
}

async function main() {
	console.log(`\n${colors.bright}====================================================`);
	console.log(`📊  ANASYS API PERFORMANCE BENCHMARK`);
	console.log(`====================================================${colors.reset}`);
	console.log(`Target: ${API_BASE}`);
	console.log(`Time:   ${new Date().toLocaleString()}`);
	console.log(`----------------------------------------------------\n`);

	const summary: any[] = [];

	// 1. Market Overview (Commonly used on Dashboard)
	summary.push(await runBenchmark("Market Overview", "/market/overview"));

	// 2. Market Search (High frequency)
	summary.push(await runBenchmark("Symbol Search (Apple)", "/market/search?q=Apple"));

	// 3. Historical Data - Daily (Standard Load)
	summary.push(await runBenchmark("History (AAPL 1d, 500 candles)", "/market/history/AAPL?interval=1d&limit=500"));

	// 4. Historical Data - Intraday (High Precision)
	summary.push(
		await runBenchmark("History (BTC-USD 1m, 100 candles)", "/market/history/BTC-USD?interval=1m&limit=100"),
	);

	// 5. Engine Native Query (Direct QuestDB)
	summary.push(
		await runBenchmark("Engine Native (AAPL 1d, 100 candles)", "/market/history/engine/AAPL?interval=1d&limit=100"),
	);

	// 6. Bulk History (Stress Test)
	summary.push(
		await runBenchmark("Bulk History (AAPL 1d, 2000 candles)", "/market/history/AAPL?interval=1d&limit=2000"),
	);

	// 7. Real-time Quotes (Bulk fetch)
	summary.push(await runBenchmark("Batch Quotes (5 Tickers)", "/market/quotes?tickers=AAPL,MSFT,GOOGL,TSLA,AMD"));

	// 7. Market Movers (Gainers/Losers)
	summary.push(await runBenchmark("Top Movers", "/market/movers"));

	console.log(`${colors.bright}====================================================`);
	console.log(`🏁  BENCHMARK SUMMARY`);
	console.log(`====================================================${colors.reset}`);

	const sortedSummary = summary.filter(Boolean).sort((a, b) => a.avg - b.avg);

	for (const item of sortedSummary) {
		const speedTag =
			item.avg < 150 ? "⚡ EXCELLENT" : item.avg < 500 ? "✅ GOOD" : item.avg < 1500 ? "⚠️ SLOW" : "🛑 CRITICAL";
		const color =
			item.avg < 150 ? colors.green : item.avg < 500 ? colors.cyan : item.avg < 1500 ? colors.yellow : colors.red;

		console.log(`${item.name.padEnd(35)}: ${color}${item.avg.toFixed(0)}ms${colors.reset} [${speedTag}]`);
	}
	console.log(`====================================================\n`);
}

main().catch((err) => {
	console.error(`${colors.red}FATAL ERROR: ${err.message}${colors.reset}`);
	process.exit(1);
});
