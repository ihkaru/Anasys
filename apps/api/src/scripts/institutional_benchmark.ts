import { execSync } from "node:child_process";
import { sql, eq, desc } from "drizzle-orm";
import { db } from "../db";
import {
	symbols,
	symbolFinancials,
	corporateActions,
	insiderTransactions,
	macroData,
	backfillProgress,
	symbolEarnings,
	analystRatings,
	users,
	strategies,
	categories,
	symbolCategories,
	watchlists,
	watchlistItems,
	marketData,
	holdings,
} from "../../../../packages/db/src/schema";
import * as fs from "node:fs";
import * as path from "node:path";

const questdbUrl = process.env.QUESTDB_URL || "http://localhost:9000";

// ─── QuestDB Helpers ──────────────────────────────────────────────────────────

async function questdbQuery(query: string): Promise<any> {
	const res = await fetch(`${questdbUrl}/exec?query=${encodeURIComponent(query)}`);
	if (!res.ok) throw new Error(`QuestDB HTTP ${res.status}: ${res.statusText}`);
	return res.json();
}

async function questdbCount(table: string): Promise<number> {
	try {
		const data = await questdbQuery(`SELECT count(*) FROM ${table}`);
		return Number(data.dataset[0][0]);
	} catch {
		return -1;
	}
}

async function questdbLatestRows(
	table: string,
	orderBy: string,
	limit = 2,
): Promise<{ columns: string[]; rows: any[][] } | null> {
	try {
		const data = await questdbQuery(`SELECT * FROM ${table} ORDER BY ${orderBy} DESC LIMIT ${limit}`);
		if (!data.dataset || data.dataset.length === 0) return null;
		return {
			columns: data.columns.map((c: any) => c.name),
			rows: data.dataset,
		};
	} catch {
		return null;
	}
}

// ─── Markdown Table Helpers ───────────────────────────────────────────────────

function mdTable(headers: string[], rows: (string | number | null | undefined)[][]): string {
	let out = `| ${headers.join(" | ")} |\n`;
	out += `| ${headers.map(() => ":---").join(" | ")} |\n`;
	for (const row of rows) {
		const cells = row.map((v) => {
			if (v === null || v === undefined) return "";
			const s = String(v);
			// Truncate long JSON blobs to keep table readable
			return s.length > 80 ? `${s.substring(0, 77)}...` : s;
		});
		out += `| ${cells.join(" | ")} |\n`;
	}
	return `${out}\n`;
}

function pgRowsToMd(rows: any[]): string {
	if (rows.length === 0) return "*No data found.*\n\n";
	const headers = Object.keys(rows[0]);
	const tableRows = rows.map((row) =>
		headers.map((h) => {
			const val = row[h];
			if (val instanceof Date) return val.toISOString();
			if (typeof val === "object" && val !== null) return `${JSON.stringify(val).substring(0, 77)}...`;
			return val;
		}),
	);
	return mdTable(headers, tableRows);
}

// ─── Main Benchmark ───────────────────────────────────────────────────────────

async function runBenchmark() {
	console.log("📊 Running Institutional Data Benchmark...");
	const reportPath = path.join(process.cwd(), "docs/benchmarks/harvest_report.md");

	const dir = path.dirname(reportPath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

	let md = `# 📊 Anasys Institutional Harvesting Benchmark\n`;
	md += `Generated at: ${new Date().toISOString()}\n\n`;

	// ═══════════════════════════════════════════════════════════════════════
	// SECTION 1: REAL-TIME THROUGHPUT (10-second delta measurement)
	// ═══════════════════════════════════════════════════════════════════════
	md += `## 🚀 Real-time Throughput & Estimate\n\n`;

	// --- Snapshot 1 ---
	const completed1Res = await db
		.select({ count: sql`count(*)` })
		.from(backfillProgress)
		.where(eq(backfillProgress.isCompleted, true));
	const completed1 = Number(completed1Res[0].count);
	const nowDb = new Date();

	const questdbCandles1 = await questdbCount("candles");

	console.log("⏱️ Measuring real-time delta (10 seconds)...");
	await new Promise((resolve) => setTimeout(resolve, 10000));

	let rateLimitCount = 0;
	try {
		const output = execSync('docker logs --since 10s anasys-dev-engine 2>&1 | grep -c "429" || true').toString().trim();
		rateLimitCount = parseInt(output, 10) || 0;
	} catch (e) {
		// Ignore if docker logs fail
	}

	// --- Snapshot 2 ---
	const completed2Res = await db
		.select({ count: sql`count(*)` })
		.from(backfillProgress)
		.where(eq(backfillProgress.isCompleted, true));
	const completed2 = Number(completed2Res[0].count);

	const activityRes = await db
		.select({ count: sql`count(*)` })
		.from(backfillProgress)
		.where(sql`${backfillProgress.updatedAt} >= ${nowDb.toISOString()}`);
	const activityCount = Number(activityRes[0].count);

	const questdbCandles2 = await questdbCount("candles");

	const symRes = await db.select({ count: sql`count(*)` }).from(symbols);
	const totalSymbols = Number(symRes[0].count);

	const completionTPS = ((completed2 - completed1) / 10).toFixed(2);
	const activityTPS = (activityCount / 10).toFixed(2);
	const candleRPS =
		questdbCandles1 >= 0 && questdbCandles2 >= 0 ? ((questdbCandles2 - questdbCandles1) / 10).toFixed(2) : "N/A";

	const totalExpectedTasks = totalSymbols * 4; // 1d, 1h, 15m, 1m for each symbol
	const remainingTasks = totalExpectedTasks - completed2;
	const effectiveTPS = Number(completionTPS) > 0 ? Number(completionTPS) : Number(activityTPS) * 0.05;
	const secondsLeft = effectiveTPS > 0 ? remainingTasks / effectiveTPS : Infinity;
	const hoursLeft = secondsLeft !== Infinity ? (secondsLeft / 3600).toFixed(2) : "∞";

	md += mdTable(
		["Metric", "Value"],
		[
			["**Total Symbols**", totalSymbols.toLocaleString()],
			["**Total Expected Tasks**", totalExpectedTasks.toLocaleString()],
			[
				"**Completed Tasks**",
				`${completed2.toLocaleString()} (${((completed2 / totalExpectedTasks) * 100).toFixed(2)}%)`,
			],
			["**Activity TPS**", `**${activityTPS} tasks/sec** (Movement)`],
			["**Completion TPS**", `**${completionTPS} tasks/sec** (Done)`],
			["**QuestDB Candle Ingestion**", `**${candleRPS} rows/sec**`],
			["**Yahoo Rate Limits (429)**", `**${rateLimitCount} errors** in 30s`],
			["**Estimated Completion**", `**${hoursLeft} hours**`],
		],
	);

	md += `## 📋 Harvesting Task Status Breakdown\n\n`;

	const statusBreakdownRes = await db.execute(sql`
		SELECT 
			interval,
			count(*) filter (where is_completed = true) as completed,
			count(*) filter (where is_completed = false and last_backfilled_at is not null) as in_progress,
			count(*) filter (where last_backfilled_at is null) as never_started,
			count(*) as total
		FROM backfill_progress
		GROUP BY interval
		ORDER BY interval
	`);

	md += mdTable(
		["Interval", "Completed", "In Progress", "Never Started", "Total", "% Done"],
		statusBreakdownRes.map((r: any) => {
			const done = Number(r.completed);
			const total = Number(r.total);
			return [
				`\`${r.interval}\``,
				done.toLocaleString(),
				Number(r.in_progress).toLocaleString(),
				Number(r.never_started).toLocaleString(),
				total.toLocaleString(),
				`**${((done / total) * 100).toFixed(2)}%**`,
			];
		}),
	);
	md += `\n`;

	// 🌍 NEW: ASSET DIVERSITY & PROVIDER COVERAGE
	md += `## 🌍 Asset Diversity & Provider Coverage\n\n`;

	// 1. Asset Type Breakdown
	const assetTypeRes = await db.execute(sql`
		SELECT type, count(*) as count 
		FROM symbols 
		GROUP BY type 
		ORDER BY count DESC
	`);

	md += `### 🏷️ Asset Classes\n\n`;
	md += mdTable(
		["Asset Type", "Count", "Percentage"],
		assetTypeRes.map((r: any) => [
			`**${r.type}**`,
			Number(r.count).toLocaleString(),
			`${((Number(r.count) / totalSymbols) * 100).toFixed(1)}%`,
		]),
	);
	md += `\n`;

	// 2. Source Breakdown (QuestDB)
	const sourceRes = await questdbQuery("select source, count(*) from candles group by source");
	const sourceData = sourceRes.dataset || [];

	md += `### 📡 Data Source Efficiency (QuestDB)\n\n`;
	md += mdTable(
		["Provider", "Candles Ingested", "Role"],
		sourceData.map((r: any) => [
			`**${r[0]}**`,
			Number(r[1]).toLocaleString(),
			r[0] === "TRADINGVIEW" ? "Primary (High Precision)" : "Fallback (Institution)",
		]),
	);
	md += `\n`;

	// ═══════════════════════════════════════════════════════════════════════
	// SECTION 2: DATABASE OVERVIEW (Row counts for all tables)
	// ═══════════════════════════════════════════════════════════════════════
	md += `## 📦 Database Overview (Row Counts)\n\n`;

	// QuestDB counts
	const questdbTables = ["candles"];
	const questdbCounts: Record<string, number> = {};
	for (const t of questdbTables) {
		questdbCounts[t] = await questdbCount(t);
	}

	// PostgreSQL counts
	const pgTableDefs = [
		{ label: "symbols", table: symbols },
		{ label: "symbol_financials", table: symbolFinancials },
		{ label: "symbol_earnings", table: symbolEarnings },
		{ label: "analyst_ratings", table: analystRatings },
		{ label: "corporate_actions", table: corporateActions },
		{ label: "insider_transactions", table: insiderTransactions },
		{ label: "macro_data", table: macroData },
		{ label: "backfill_progress", table: backfillProgress },
		{ label: "market_data", table: marketData },
		{ label: "categories", table: categories },
		{ label: "symbol_categories", table: symbolCategories },
		{ label: "watchlists", table: watchlists },
		{ label: "watchlist_items", table: watchlistItems },
		{ label: "holdings", table: holdings },
		{ label: "users", table: users },
		{ label: "strategies", table: strategies },
	];

	const pgCounts: Record<string, number> = {};
	for (const t of pgTableDefs) {
		try {
			const res = await db.select({ count: sql`count(*)` }).from(t.table as any);
			pgCounts[t.label] = Number(res[0].count);
		} catch {
			pgCounts[t.label] = -1;
		}
	}

	// --- QuestDB Summary ---
	md += `### 🟡 QuestDB Tables\n\n`;
	md += mdTable(
		["Table", "Row Count", "Description"],
		questdbTables.map((t) => [
			`\`${t}\``,
			questdbCounts[t] >= 0 ? questdbCounts[t].toLocaleString() : "❌ Error",
			t === "candles" ? "OHLCV time-series market data (intraday & daily)" : "",
		]),
	);

	// --- PostgreSQL Summary ---
	md += `### 🐘 PostgreSQL Tables\n\n`;
	const pgSummaryRows = pgTableDefs.map(({ label }) => {
		const count = pgCounts[label];
		return [`\`${label}\``, count >= 0 ? count.toLocaleString() : "❌ Error"];
	});
	md += mdTable(["Table", "Row Count"], pgSummaryRows);

	// ═══════════════════════════════════════════════════════════════════════
	// SECTION 3: DATA DIVERSITY SNAPSHOT (Latest rows per table)
	// ═══════════════════════════════════════════════════════════════════════
	md += `## 🗃️ Data Diversity Snapshot (Latest 2 Rows per Table)\n\n`;

	// ── QuestDB ─────────────────────────────────────────────────────────────
	md += `---\n\n`;
	md += `### 🟡 QuestDB\n\n`;

	md += `#### \`candles\` — OHLCV Time-Series\n\n`;
	const candleData = await questdbLatestRows("candles", "timestamp");
	if (!candleData) {
		md += `*No data found in QuestDB candles.*\n\n`;
	} else {
		md += mdTable(candleData.columns, candleData.rows);
	}

	// ── PostgreSQL — Harvesting Core ─────────────────────────────────────────
	md += `---\n\n`;
	md += `### 🐘 PostgreSQL — Harvesting Core\n\n`;

	const harvestingTables = [
		{ name: "symbols", label: "Symbols — Master list of all tracked instruments", table: symbols, orderBy: symbols.id },
		{
			name: "backfill_progress",
			label: "Backfill Progress — Harvesting task tracker",
			table: backfillProgress,
			orderBy: backfillProgress.updatedAt,
		},
	];

	for (const t of harvestingTables) {
		md += `#### \`${t.name}\` — ${t.label}\n\n`;
		try {
			const rows = await db
				.select()
				.from(t.table as any)
				.orderBy(desc(t.orderBy as any))
				.limit(2);
			md += pgRowsToMd(rows);
		} catch (e: any) {
			md += `*Error: ${e.message}*\n\n`;
		}
	}

	// ── PostgreSQL — Institutional/Fundamental Data ───────────────────────────
	md += `---\n\n`;
	md += `### 🐘 PostgreSQL — Institutional & Fundamental Data\n\n`;

	const institutionalTables = [
		{
			name: "symbol_financials",
			label: "Financials — P/E, Market Cap, Revenue, Margins…",
			table: symbolFinancials,
			orderBy: symbolFinancials.updatedAt,
		},
		{
			name: "symbol_earnings",
			label: "Earnings — EPS history, revenue trend, next earnings date",
			table: symbolEarnings,
			orderBy: symbolEarnings.updatedAt,
		},
		{
			name: "analyst_ratings",
			label: "Analyst Ratings — Buy/Hold/Sell breakdown & trend",
			table: analystRatings,
			orderBy: analystRatings.updatedAt,
		},
		{
			name: "corporate_actions",
			label: "Corporate Actions — Dividends & stock splits",
			table: corporateActions,
			orderBy: corporateActions.createdAt,
		},
		{
			name: "insider_transactions",
			label: "Insider Transactions — Executive buy/sell activity",
			table: insiderTransactions,
			orderBy: insiderTransactions.transactionDate,
		},
		{
			name: "macro_data",
			label: "Macro Data — Fed rates, CPI, GDP indicators",
			table: macroData,
			orderBy: macroData.timestamp,
		},
	];

	for (const t of institutionalTables) {
		md += `#### \`${t.name}\` — ${t.label}\n\n`;
		try {
			const rows = await db
				.select()
				.from(t.table as any)
				.orderBy(desc(t.orderBy as any))
				.limit(2);
			md += pgRowsToMd(rows);
		} catch (e: any) {
			md += `*Error: ${e.message}*\n\n`;
		}
	}

	// ── PostgreSQL — Market Data (Legacy PG cache) ───────────────────────────
	md += `---\n\n`;
	md += `### 🐘 PostgreSQL — Market Data Cache (Legacy)\n\n`;

	md += `#### \`market_data\` — Daily/Intraday OHLCV cached in Postgres\n\n`;
	try {
		const rows = await db
			.select()
			.from(marketData as any)
			.orderBy(desc(marketData.timestamp))
			.limit(2);
		md += pgRowsToMd(rows);
	} catch (e: any) {
		md += `*Error: ${e.message}*\n\n`;
	}

	// ── PostgreSQL — Application / User Data ────────────────────────────────
	md += `---\n\n`;
	md += `### 🐘 PostgreSQL — Application & User Data\n\n`;

	const appTables = [
		{ name: "users", label: "Users — Registered accounts", table: users, orderBy: users.createdAt },
		{
			name: "strategies",
			label: "Strategies — Trading strategy definitions",
			table: strategies,
			orderBy: strategies.id,
		},
		{ name: "categories", label: "Categories — Symbol classification tags", table: categories, orderBy: categories.id },
		{
			name: "watchlists",
			label: "Watchlists — User-curated symbol lists",
			table: watchlists,
			orderBy: watchlists.updatedAt,
		},
		{ name: "holdings", label: "Holdings — Portfolio positions", table: holdings, orderBy: holdings.updatedAt },
	];

	for (const t of appTables) {
		md += `#### \`${t.name}\` — ${t.label}\n\n`;
		try {
			const rows = await db
				.select()
				.from(t.table as any)
				.orderBy(desc(t.orderBy as any))
				.limit(2);
			md += pgRowsToMd(rows);
		} catch (e: any) {
			md += `*Error: ${e.message}*\n\n`;
		}
	}

	// ── PostgreSQL — Junction Tables (counts only, no row dump) ─────────────
	md += `---\n\n`;
	md += `### 🐘 PostgreSQL — Junction Tables (count only)\n\n`;
	md += mdTable(
		["Table", "Row Count", "Description"],
		[
			[
				"`symbol_categories`",
				(pgCounts.symbol_categories ?? -1) >= 0 ? pgCounts.symbol_categories.toLocaleString() : "❌ Error",
				"Many-to-many: symbols ↔ categories",
			],
			[
				"`watchlist_items`",
				(pgCounts.watchlist_items ?? -1) >= 0 ? pgCounts.watchlist_items.toLocaleString() : "❌ Error",
				"Many-to-many: watchlists ↔ symbols",
			],
		],
	);

	fs.writeFileSync(reportPath, md);
	console.log(`✅ Benchmark Report saved to: ${reportPath}`);
	process.exit(0);
}

runBenchmark().catch((err) => {
	console.error("❌ Benchmark Failed:", err);
	process.exit(1);
});
