import { performance } from "node:perf_hooks";

// Mock logger or use a simple console wrapper
const logger = {
	info: (msg: string) => console.log(`[INFO] ${msg}`),
	warn: (msg: string) => console.warn(`[WARN] ${msg}`),
	error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

const API_PORT = process.env.PORT || 28081;
const API_BASE = `http://localhost:${API_PORT}/api/market`;
const DEV_SECRET = "dev_secret_123";

const SOURCES = ["YAHOO", "TRADINGVIEW_SOCKET", "TRADINGVIEW_RUST"];

async function runBenchmark(symbol: string = "GBPUSD", interval: string = "1h") {
	logger.info(`🏛️ Starting Institutional-Grade Performance Benchmark for ${symbol}...`);

	const results: any[] = [];

	for (const source of SOURCES) {
		logger.info(`📡 Testing Provider: ${source}...`);

		const startTime = performance.now();
		let attempts = 0;
		let success = false;
		let candleCount = 0;
		let errorMessage = "";

		const maxAttempts = 5;

		while (attempts < maxAttempts) {
			attempts++;
			try {
				// Correct route: /api/market/history/:ticker
				const url = `${API_BASE}/history/${encodeURIComponent(symbol)}?interval=${interval}&source=${source}&limit=500`;
				const response = await fetch(url, {
					headers: { "X-Dev-Secret": DEV_SECRET },
					signal: AbortSignal.timeout(5000),
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}

				const body = (await response.json()) as any;

				// Response format is { success: true, data: [...] }
				if (body?.success && body.data && body.data.length > 0) {
					success = true;
					candleCount = body.data.length;
					break;
				}

				logger.warn(`  [Attempt ${attempts}] Empty data for ${source}, retrying...`);
				await new Promise((r) => setTimeout(r, 500));
			} catch (error: any) {
				errorMessage = error.message;
				logger.error(`  ❌ Attempt ${attempts} failed: ${errorMessage}`);
				await new Promise((r) => setTimeout(r, 500));
			}
		}

		const endTime = performance.now();
		const latencyMs = endTime - startTime;
		const latencySec = latencyMs / 1000;

		results.push({
			Provider: source,
			Latency: `${latencySec.toFixed(3)}s`,
			Candles: candleCount,
			Success: success ? "✅" : "❌",
			Grade: success && latencySec < 1.5 ? "INSTITUTIONAL" : success ? "RETAIL" : "FAILED",
			Error: success ? "-" : errorMessage,
		});
	}

	console.log(`\n${"=".repeat(80)}`);
	console.log(`📊 BENCHMARK REPORT: ${symbol} (${interval})`);
	console.log("=".repeat(80));
	console.table(results);

	const metStandard = results.some((r) => r.Success === "✅" && parseFloat(r.Latency) < 1.5);
	if (metStandard) {
		console.log("🌟 STATUS: INSTITUTIONAL GRADE ACHIEVED (Sub-1.5s)");
	} else {
		console.warn("⚠️ STATUS: BELOW INSTITUTIONAL GRADE");
	}
	console.log("=".repeat(80));
}

function getArgs() {
	const args: any = {};
	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];
		if (arg === "--ticker" && process.argv[i + 1]) {
			args.ticker = process.argv[++i];
		} else if (arg === "--interval" && process.argv[i + 1]) {
			args.interval = process.argv[++i];
		} else if (!arg.startsWith("--")) {
			if (!args.ticker) args.ticker = arg;
			else if (!args.interval) args.interval = arg;
		}
	}
	return {
		ticker: args.ticker || "GBPUSD",
		interval: args.interval || "1h",
	};
}

const { ticker, interval } = getArgs();
runBenchmark(ticker, interval).catch(console.error);
