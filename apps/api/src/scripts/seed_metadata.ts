/**
 * seed_metadata.ts — Smart Metadata Seeder
 *
 * Strategy:
 *   1. Ambil top N simbol dari Yahoo Finance screener (day_gainers, day_losers, most_actives)
 *      → Dapat: name, exchange, currency dari Yahoo `quote` (no extra quoteSummary calls)
 *   2. Untuk simbol IDX (*.JK), gunakan Yahoo search karena screener US tidak cover IDX
 *   3. Update DB hanya jika field masih kosong (tidak overwrite data yang sudah ada)
 *
 * Tujuan: Mengisi metadata dasar (name, exchange, currency) untuk simbol paling relevan
 * tanpa membebani API rate limit.
 *
 * Jalankan di dalam container:
 *   docker exec anasys-dev-api bun run src/scripts/seed_metadata.ts [--limit=200]
 *
 * Atau dari host:
 *   ./dev.sh exec api bun run src/scripts/seed_metadata.ts
 */

import yahooFinance from "yahoo-finance2";
import { db } from "../db";
import { symbols } from "@packages/db/src/schema";
import { eq, sql } from "drizzle-orm";
import { Logger } from "../utils/logger";

const logger = new Logger("SeedMetadata");

// ─── Configuration ────────────────────────────────────────────────────────────
const ARGS = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((a) => a.startsWith("--"))
		.map((a) => {
			const [k, v] = a.slice(2).split("=");
			return [k, v ?? "true"];
		}),
);

const LIMIT = parseInt(ARGS.limit ?? "300", 10);
const DELAY_MS = parseInt(ARGS.delay ?? "400", 10);
const DRY_RUN = ARGS["dry-run"] === "true";

// ─── Yahoo Screener Sources ───────────────────────────────────────────────────
const SCREENER_IDS = [
	"day_gainers",        // Top gainers
	"day_losers",         // Top losers
	"most_actives",       // Most traded
	"growth_technology_stocks", // Tech growth
	"undervalued_large_caps",   // Large caps
];

const yf = new (yahooFinance as any)();

// ─── Stats ─────────────────────────────────────────────────────────────────
let updated = 0;
let skipped = 0;
let failed = 0;
let notInDb = 0;

// ─── Core ─────────────────────────────────────────────────────────────────────

async function writeBack(ticker: string, name: string, exchange: string | undefined, currency: string | undefined) {
	const results = await db.select({
		id: symbols.id,
		name: symbols.name,
		exchange: symbols.exchange,
		currency: symbols.currency,
	}).from(symbols).where(eq(symbols.ticker, ticker)).limit(1);

	const existing = results[0];

	if (!existing) {
		notInDb++;
		return;
	}

	const needsUpdate =
		(existing.name === ticker && name && name !== ticker) ||
		(!existing.exchange && exchange) ||
		(!existing.currency && currency);

	if (!needsUpdate) {
		skipped++;
		return;
	}

	const patch: Record<string, any> = {};
	if (existing.name === ticker && name && name !== ticker) patch.name = name;
	if (!existing.exchange && exchange) patch.exchange = exchange;
	if (!existing.currency && currency) patch.currency = currency;

	if (DRY_RUN) {
		logger.info(`[DRY] ${ticker} → ${JSON.stringify(patch)}`);
		updated++;
		return;
	}

	await db.update(symbols).set(patch).where(eq(symbols.id, existing.id)).execute();
	logger.info(`✏️  ${ticker.padEnd(12)} ${(patch.name || existing.name).substring(0, 35)}`);
	updated++;
}

async function seedFromScreener(scrId: string, count: number) {
	logger.info(`📋 Screener: ${scrId} (up to ${count})`);
	try {
		const result: any = await yf.screener({
			scrIds: scrId,
			count,
			region: "US",
			lang: "en-US",
		});
		const quotes = result?.quotes ?? [];
		logger.info(`   → ${quotes.length} quotes found`);

		for (const q of quotes) {
			if (!q.symbol) continue;
			const name = q.shortName || q.longName || q.symbol;
			await writeBack(q.symbol, name, q.exchange || undefined, q.currency || undefined);
		}
	} catch (e: any) {
		logger.warn(`Screener ${scrId} failed: ${e.message}`);
		failed++;
	}
}

async function seedFromTrendingUS(count: number) {
	logger.info(`📈 Trending US (up to ${count})`);
	try {
		const result: any = await yf.trendingSymbols("US", { count });
		const tickers = (result?.quotes ?? []).map((q: any) => q.symbol).filter(Boolean);
		if (!tickers.length) return;

		// Fetch quotes in one batch to get name/exchange/currency
		const quotes: any[] = await yf.quote(tickers);
		for (const q of [].concat(quotes)) {
			if (!q?.symbol) continue;
			const name = q.shortName || q.longName || q.symbol;
			await writeBack(q.symbol, name, q.exchange || undefined, q.currency || undefined);
		}
	} catch (e: any) {
		logger.warn(`Trending US failed: ${e.message}`);
	}
}

async function seedFromIDXSearch() {
	logger.info(`🇮🇩 IDX symbols — seeding via Yahoo search`);

	// Get IDX symbols already in DB that still have name === ticker
	const idxStubs = await db.execute(
		sql`SELECT ticker FROM symbols WHERE ticker LIKE '%.JK' AND (name IS NULL OR name = ticker) LIMIT 100`
	);
	
	const rows = (idxStubs.rows || idxStubs) as any[];
	logger.info(`   → ${rows.length} IDX stubs found`);

	for (const row of rows) {
		const ticker = row.ticker;
		try {
			const q: any = await yf.quote(ticker);
			if (q?.shortName || q?.longName) {
				const name = q.shortName || q.longName;
				await writeBack(ticker, name, q.exchange || undefined, q.currency || undefined);
			}
			await sleep(DELAY_MS); 
		} catch {
			failed++;
		}
	}
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
	const countPerScreener = Math.ceil(LIMIT / SCREENER_IDS.length);

	logger.info("═".repeat(60));
	logger.info(`🌱 Anasys Metadata Seeder`);
	logger.info(`   limit=${LIMIT}  delay=${DELAY_MS}ms  dry-run=${DRY_RUN}`);
	logger.info(`   Sources: Yahoo Finance screener + trending + IDX quotes`);
	logger.info("═".repeat(60));

	// 1. Seed from Yahoo screeners (US market coverage)
	for (const scrId of SCREENER_IDS) {
		await seedFromScreener(scrId, countPerScreener);
	}

	// 2. Seed trending symbols (often not in screeners)
	await seedFromTrendingUS(50);

	// 3. Seed IDX symbols separately (Yahoo screener doesn't cover them)
	await seedFromIDXSearch();

	logger.info("═".repeat(60));
	logger.info(`✅ Done: updated=${updated}  skipped=${skipped}  failed=${failed}  not_in_db=${notInDb}`);

	// Final DB state
	const [stats] = await db.execute(
		sql`SELECT
			COUNT(*) AS total,
			COUNT(CASE WHEN name != ticker THEN 1 END) AS has_real_name,
			COUNT(CASE WHEN exchange IS NOT NULL AND exchange != '' THEN 1 END) AS has_exchange,
			COUNT(CASE WHEN currency IS NOT NULL AND currency != '' THEN 1 END) AS has_currency
		FROM symbols`
	);
	logger.info("📊 DB State after seeding:", (stats as any).rows?.[0] ?? stats);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		logger.error("Fatal:", e);
		process.exit(1);
	});
