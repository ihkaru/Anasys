import { performance } from "node:perf_hooks";

/**
 * Anasys API — Deep Pagination & Cold-Start Benchmark
 *
 * Tests the specific failure scenario identified in the 5 Whys RCA:
 *   "GET /history?before=<old_date> returns empty data"
 *
 * Test Flow for each provider:
 *   1.  🗑  EVICT — Delete symbol candles from QuestDB (cold-start simulation)
 *   2.  🔥  COLD  — Request latest data (miss → sync → return). Measures sync latency.
 *   3.  📦  WARM  — Request same data again (cache hit). Measures cached response time.
 *   4.  ◀◀  PAGE1 — Request data with before=T-60d (1 page back). Should trigger sync.
 *   5.  ◀◀  PAGE2 — Request data with before=T-120d (2 pages back). Tests new fix.
 *   6.  ◀◀  PAGE3 — Request data with before=T-180d (3 pages back). Tests deep scroll.
 *   7.  🗑  EVICT — Re-evict for cleanup, confirm deletion count.
 *
 * Providers tested: YAHOO (AAPL 1h), TRADINGVIEW (BINANCE:BTCUSDT 1d)
 * Run with: bun run scripts/benchmark-pagination.ts
 */

const API_BASE = process.env.API_URL || "http://localhost:28081/api";
const SECRET = "dev_secret_123";

const c = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	cyan: "\x1b[36m",
	magenta: "\x1b[35m",
	blue: "\x1b[34m",
	gray: "\x1b[90m",
	bgRed: "\x1b[41m",
	bgGreen: "\x1b[42m",
};

// ─── HTTP Helper ─────────────────────────────────────────────────────────────

async function req(
	path: string,
	method = "GET",
	body?: object,
): Promise<{ duration: number; data?: any; error?: string; isEmpty?: boolean }> {
	const isRoot = path.startsWith("/ping") || path.startsWith("/health");
	const base = API_BASE.replace("/api", "");
	const url = isRoot ? `${base}${path}` : `${API_BASE}${path}`;
	const start = performance.now();

	try {
		const res = await fetch(url, {
			method,
			headers: {
				"X-Dev-Secret": SECRET,
				"Content-Type": "application/json",
			},
			...(body ? { body: JSON.stringify(body) } : {}),
		});
		const duration = performance.now() - start;

		if (!res.ok) {
			const text = await res.text();
			return { duration, error: `HTTP ${res.status}: ${text}` };
		}

		const data = await res.json();
		const items = data?.data;
		const isEmpty = Array.isArray(items) && items.length === 0;
		return { duration, data, isEmpty };
	} catch (err: any) {
		return { duration: performance.now() - start, error: err.message };
	}
}

// ─── Evict Helper ─────────────────────────────────────────────────────────────

async function evict(symbol: string, interval: string, source: string): Promise<number> {
	const res = await req(
		`/market/internal/questdb/symbol?symbol=${encodeURIComponent(symbol)}&interval=${interval}&source=${source}`,
		"DELETE",
	);
	if (res.error) {
		console.log(`  ${c.red}⚠ Evict failed: ${res.error}${c.reset}`);
		return -1;
	}
	return res.data?.deleted ?? 0;
}

// ─── Single Step Runner ────────────────────────────────────────────────────────

interface StepResult {
	label: string;
	duration: number;
	candles: number;
	isEmpty: boolean;
	error?: string;
}

async function runStep(label: string, path: string, method = "GET"): Promise<StepResult> {
	const { duration, data, isEmpty, error } = await req(path, method);
	const candles = Array.isArray(data?.data) ? data.data.length : 0;

	let statusStr: string;
	if (error) {
		statusStr = `${c.red}✖ ERROR${c.reset}`;
	} else if (isEmpty) {
		statusStr = `${c.yellow}⚠ EMPTY${c.reset}`;
	} else {
		statusStr = `${c.green}✔ OK (${candles} candles)${c.reset}`;
	}

	const durColor = duration < 300 ? c.green : duration < 1500 ? c.yellow : c.red;
	console.log(
		`  ${c.gray}${label.padEnd(28)}${c.reset} ${durColor}${duration.toFixed(0).padStart(6)}ms${c.reset}  ${statusStr}`,
	);

	return { label, duration, candles, isEmpty: isEmpty ?? false, error };
}

// ─── Provider Scenario ────────────────────────────────────────────────────────

interface ProviderScenario {
	name: string;
	symbol: string;
	interval: string;
	source: string;
	limit: number;
	/** Offsets in days to test pagination. Each becomes a `before` param. */
	paginationOffsetsDays: number[];
}

const SCENARIOS: ProviderScenario[] = [
	{
		name: "Yahoo Finance — AAPL 1h",
		symbol: "AAPL",
		interval: "1h",
		source: "YAHOO",
		limit: 500,
		// ⚠ Yahoo Finance hard-limits 1h data to ~60 days back from today.
		// Deeper pagination will always return empty regardless of our fix.
		// Test within the provider's realistic range.
		paginationOffsetsDays: [15, 30, 55],
	},
	{
		name: "Yahoo Finance — AAPL 1d",
		symbol: "AAPL",
		interval: "1d",
		source: "YAHOO",
		limit: 500,
		// Yahoo 1d: ~252 candles/year. 2y window (our new backfill) ≈ 504 candles.
		// Greedy initial fetch pulls 10 years, so deep scroll should work.
		paginationOffsetsDays: [365, 730, 1095],
	},
	{
		name: "Yahoo Finance — BTC-USD 1d",
		symbol: "BTC-USD",
		interval: "1d",
		source: "YAHOO",
		limit: 200,
		paginationOffsetsDays: [180, 365, 730],
	},
	{
		name: "TradingView — BINANCE:BTCUSDT 1d",
		symbol: "BINANCE:BTCUSDT",
		interval: "1d",
		source: "TRADINGVIEW",
		limit: 100,
		paginationOffsetsDays: [90, 180, 360],
	},
];

// ─── Per-Scenario Test Suite ───────────────────────────────────────────────────

interface ScenarioSummary {
	name: string;
	steps: StepResult[];
	coldLatency: number;
	warmLatency: number;
	paginationResults: { offset: number; candles: number; isEmpty: boolean; duration: number }[];
	evictedAfter: number;
}

async function runScenario(scenario: ProviderScenario): Promise<ScenarioSummary> {
	const { name, symbol, interval, source, limit, paginationOffsetsDays } = scenario;
	const steps: StepResult[] = [];

	console.log(`\n${c.bright}${c.magenta}━━━ ${name} ━━━${c.reset}`);
	console.log(`${c.gray}  Symbol=${symbol}  Interval=${interval}  Source=${source}  Limit=${limit}${c.reset}\n`);

	// ── 1. EVICT ──────────────────────────────────────────────────────────────
	console.log(`${c.bright}${c.yellow}  [1/6] 🗑  EVICT — clearing QuestDB...${c.reset}`);
	const evictedBefore = await evict(symbol, interval, source);
	console.log(`  ${c.gray}  Removed ${evictedBefore} existing candles${c.reset}`);

	// Small grace period for WAL commit to flush
	await sleep(500);

	// ── 2. COLD START ─────────────────────────────────────────────────────────
	console.log(`\n${c.bright}${c.yellow}  [2/6] 🔥  COLD — first fetch (miss → sync → return)${c.reset}`);
	const coldStep = await runStep(
		"Cold start (no cache)",
		`/market/history/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}&source=${source}`,
	);
	steps.push(coldStep);

	// ── 3. WARM (Cache Hit) ────────────────────────────────────────────────────
	console.log(`\n${c.bright}${c.yellow}  [3/6] 📦  WARM — second fetch (LRU/QuestDB hit)${c.reset}`);
	const warmStep = await runStep(
		"Warm (cache hit)",
		`/market/history/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}&source=${source}`,
	);
	steps.push(warmStep);

	// ── 4-6. PAGINATION ────────────────────────────────────────────────────────
	console.log(`\n${c.bright}${c.yellow}  [4-6/6] ◀◀  PAGINATION — historical scroll-back${c.reset}`);

	const paginationResults = [];
	const now = Date.now();

	for (let i = 0; i < paginationOffsetsDays.length; i++) {
		const offsetDays = paginationOffsetsDays[i];
		const beforeDate = new Date(now - offsetDays * 24 * 60 * 60 * 1000);
		const beforeIso = beforeDate.toISOString();

		const pageStep = await runStep(
			`Page ${i + 1} (before T-${offsetDays}d)`,
			`/market/history/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}&source=${source}&before=${encodeURIComponent(beforeIso)}`,
		);
		steps.push(pageStep);
		paginationResults.push({
			offset: offsetDays,
			candles: pageStep.candles,
			isEmpty: pageStep.isEmpty,
			duration: pageStep.duration,
		});

		// Small delay between pages (simulate user scroll)
		await sleep(300);
	}

	// ── 7. RE-EVICT (Cleanup) ──────────────────────────────────────────────────
	console.log(`\n${c.bright}${c.yellow}  [7/7] 🗑  CLEANUP — evict test data from QuestDB...${c.reset}`);
	const evictedAfter = await evict(symbol, interval, source);
	console.log(`  ${c.gray}  Cleaned ${evictedAfter} candles (test data removed)${c.reset}`);

	// Summary for this scenario
	const coldLatency = coldStep.duration;
	const warmLatency = warmStep.duration;

	return { name, steps, coldLatency, warmLatency, paginationResults, evictedAfter };
}

// ─── Print Global Summary ──────────────────────────────────────────────────────

function printSummary(results: ScenarioSummary[]) {
	console.log(`\n${c.bright}${"═".repeat(70)}`);
	console.log(`  📊  PAGINATION BENCHMARK — GLOBAL SUMMARY`);
	console.log(`${"═".repeat(70)}${c.reset}`);

	for (const r of results) {
		console.log(`\n${c.bright}${c.cyan}▸ ${r.name}${c.reset}`);

		const coldColor = r.coldLatency < 2000 ? c.green : r.coldLatency < 5000 ? c.yellow : c.red;
		const warmColor = r.warmLatency < 200 ? c.green : r.warmLatency < 500 ? c.yellow : c.red;
		console.log(`  Cold Start : ${coldColor}${r.coldLatency.toFixed(0)}ms${c.reset}`);
		console.log(`  Warm Cache : ${warmColor}${r.warmLatency.toFixed(0)}ms${c.reset}`);

		console.log(`  Pagination :`);
		for (const p of r.paginationResults) {
			const tag = p.isEmpty
				? `${c.red}EMPTY — BUG DETECTED${c.reset}`
				: `${c.green}${p.candles} candles${c.reset}`;
			const durColor = p.duration < 2000 ? c.green : p.duration < 5000 ? c.yellow : c.red;
			console.log(
				`    ◀ T-${String(p.offset).padStart(4)}d : ${durColor}${p.duration.toFixed(0).padStart(6)}ms${c.reset}  ${tag}`,
			);
		}

		// Overall verdict
		const anyEmpty = r.paginationResults.some((p) => p.isEmpty);
		if (anyEmpty) {
			console.log(`  ${c.bgRed}${c.bright} ✖ PAGINATION BUG STILL PRESENT ${c.reset}`);
		} else {
			console.log(`  ${c.bgGreen}${c.bright} ✔ PAGINATION WORKING CORRECTLY ${c.reset}`);
		}
		console.log(`  Cleanup    : ${r.evictedAfter} candles removed`);
	}

	console.log(`\n${c.bright}${"═".repeat(70)}${c.reset}\n`);
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log(`\n${c.bright}${"═".repeat(70)}`);
	console.log(`  🔬  ANASYS — PAGINATION & COLD-START BENCHMARK`);
	console.log(`${"═".repeat(70)}${c.reset}`);
	console.log(`  Target : ${API_BASE}`);
	console.log(`  Time   : ${new Date().toLocaleString()}`);
	console.log(`\n  This test evicts and re-fetches data per scenario.`);
	console.log(`  All test data is cleaned from QuestDB at the end.\n`);

	// Sanity check — API must be up
	const ping = await req("/ping");
	if (ping.error) {
		console.error(`${c.red}✖ API unreachable: ${ping.error}${c.reset}`);
		process.exit(1);
	}
	console.log(`  ${c.green}✔ API reachable (${ping.duration.toFixed(0)}ms)${c.reset}\n`);

	const results: ScenarioSummary[] = [];

	for (const scenario of SCENARIOS) {
		const result = await runScenario(scenario);
		results.push(result);
		// Pause between scenarios to avoid rate-limiting
		await sleep(2000);
	}

	printSummary(results);
}

main().catch((err) => {
	console.error(`${c.red}FATAL: ${err.message}${c.reset}`);
	process.exit(1);
});
