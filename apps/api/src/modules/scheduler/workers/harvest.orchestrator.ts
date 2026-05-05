import { Worker, type Job } from "bullmq";
import { symbols, symbolFinancials, watchlistItems, holdings, backfillProgress, alerts } from "@packages/db/src/schema";
import { eq, isNull, sql, asc, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { Logger } from "../../../utils/logger";
import { redisConnection, alertQueue } from "../queue";
import { marketService } from "../../market/market.service";

const logger = new Logger("HarvestOrchestrator");

/**
 * Harvest Orchestrator (BullMQ)
 *
 * Satu worker untuk menangani semua tipe job di queue "harvest".
 * Mencegah "job stealing" antar worker yang mendengarkan queue yang sama.
 */
export function createHarvestWorker() {
	return new Worker(
		"harvest",
		async (job: Job) => {
			logger.info(`▶ Processing job: ${job.name} (${job.id})`);

			switch (job.name) {
				case "vip-sync":
					return await handleVipSync();
				case "standard-sync":
					return await handleStandardSync();
				case "discovery":
					return await handleDiscovery();
				case "enrichment":
					return await handleEnrichment();
				case "backfill":
					return await handleBackfill();
				case "incremental-sync":
					return await handleIncrementalSync();
				case "alert-evaluator":
					return await handleAlertEvaluator();
				default:
					logger.warn(`Unknown job type: ${job.name}`);
			}
		},
		{
			connection: redisConnection,
			concurrency: 30, // Menambah concurrency ke 30 (Extreme Ingestion Mode)
			lockDuration: 600000, // 10 menit lock per job
		},
	);
}

// ── HANDLER: Alert Evaluator ────────────────────────────────────────────────

async function handleAlertEvaluator() {
	const activeAlerts = await db.select({ id: alerts.id }).from(alerts).where(eq(alerts.status, "ACTIVE"));

	for (const alert of activeAlerts) {
		await alertQueue.add("evaluate-alert", { alertId: alert.id }, { jobId: `eval-alert-${alert.id}-${Date.now()}` });
	}

	if (activeAlerts.length > 0) {
		logger.info(`[AlertEvaluator] Queued ${activeAlerts.length} active alerts`);
	}
}

// ── HANDLER: VIP Sync ────────────────────────────────────────────────────────

async function handleVipSync() {
	const [watchlistRows, holdingRows] = await Promise.all([
		db.select({ id: watchlistItems.symbolId }).from(watchlistItems),
		db.select({ id: holdings.symbolId }).from(holdings),
	]);

	const vipIds = [...new Set([...watchlistRows.map((r) => r.id), ...holdingRows.map((r) => r.id)])];
	if (vipIds.length === 0) return;

	// Update Redis real-time set and metadata
	const allVipSymbols = await db
		.select({ ticker: symbols.ticker, lotSize: symbols.lotSize })
		.from(symbols)
		.where(inArray(symbols.id, vipIds));

	if (allVipSymbols.length > 0) {
		// 1. Symbol list for streamer
		await redisConnection.sadd("harvest:realtime:symbols", ...allVipSymbols.map((s) => s.ticker));

		// 2. Metadata for volume normalization (lotSize)
		const lotSizeMap: Record<string, string> = {};
		for (const s of allVipSymbols) {
			lotSizeMap[s.ticker] = (s.lotSize || 1).toString();
		}
		await redisConnection.hset("harvest:metadata:lotsizes", lotSizeMap);
	}

	const vipSymbols = await db
		.select()
		.from(symbols)
		.where(inArray(symbols.id, vipIds))
		.orderBy(asc(symbols.lastSyncedAt))
		.limit(30);

	for (const symbol of vipSymbols) {
		try {
			await marketService.syncSymbolData(symbol.ticker, symbol.type as any, "1d", undefined, "YAHOO");
			for (const interval of ["1m", "5m", "15m", "1h"]) {
				// Smart routing logic:
				// 1. If interval is 1d or 1h, use YAHOO (very fast API)
				// 2. If asset is CRYPTO, use CCXT (very fast & deep history)
				// 3. Otherwise use TRADINGVIEW_PW (for intraday 15m, 5m, 1m)
				let preferredSource = "YAHOO";
				if (symbol.type === "CRYPTO") {
					preferredSource = "CCXT";
				} else if (interval !== "1d" && interval !== "1h") {
					preferredSource = "TRADINGVIEW_PW";
				}
				await marketService.syncSymbolData(
					symbol.ticker,
					symbol.type as any,
					interval,
					undefined,
					preferredSource as any,
				);
				await new Promise((r) => setTimeout(r, 1000));
			}
			await db.update(symbols).set({ lastSyncedAt: new Date() }).where(eq(symbols.id, symbol.id));
		} catch (e: any) {
			logger.error(`VIP Sync failed for ${symbol.ticker}: ${e.message}`);
		}
	}
}

// ── HANDLER: Standard Sync ──────────────────────────────────────────────────

async function handleStandardSync() {
	const staleSymbols = await db
		.select()
		.from(symbols)
		.where(eq(symbols.isActive, true))
		.orderBy(asc(symbols.lastSyncedAt))
		.limit(200);

	// Parallel processing with batch limit to avoid burning API keys
	const BATCH_SIZE = 5;
	for (let i = 0; i < staleSymbols.length; i += BATCH_SIZE) {
		const chunk = staleSymbols.slice(i, i + BATCH_SIZE);
		await Promise.all(
			chunk.map(async (symbol) => {
				try {
					await marketService.syncSymbolData(symbol.ticker, symbol.type as any, "1d", undefined, "YAHOO");
					await marketService.syncSymbolData(symbol.ticker, symbol.type as any, "1h", undefined, "YAHOO");
					await db.update(symbols).set({ lastSyncedAt: new Date() }).where(eq(symbols.id, symbol.id));
				} catch (e: any) {
					logger.error(`Standard sync failed for ${symbol.ticker}: ${e.message}`);
				}
			}),
		);
		// Minimal delay between batches
		await new Promise((r) => setTimeout(r, 100));
	}
}

// ── HANDLER: Discovery ───────────────────────────────────────────────────────

async function handleDiscovery() {
	// Binance
	try {
		const resp = await fetch("https://api.binance.com/api/v3/exchangeInfo");
		const data = (await resp.json()) as any;
		const pairs = data.symbols.filter((s: any) => s.status === "TRADING" && s.quoteAsset === "USDT");
		for (const s of pairs) {
			const ticker = `BINANCE:${s.baseAsset}USDT`;
			await upsertAndBackfill(ticker, "CRYPTO", "BINANCE", s.baseAsset);
		}
	} catch (e: any) {
		logger.error(`Binance discovery failed: ${e.message}`);
	}

	// SEC EDGAR
	try {
		const resp = await fetch("https://www.sec.gov/files/company_tickers.json", {
			headers: { "User-Agent": "Anasys/1.0 admin@anasys.local" },
		});
		const data = (await resp.json()) as any;
		for (const c of Object.values(data) as any[]) {
			if (!c.ticker || c.ticker.includes(".")) continue;
			await upsertAndBackfill(c.ticker.toUpperCase(), "STOCK", "NASDAQ", c.title);
		}
	} catch (e: any) {
		logger.error(`SEC discovery failed: ${e.message}`);
	}
}

async function upsertAndBackfill(ticker: string, type: "STOCK" | "CRYPTO", exchange: string, name: string) {
	const existing = await db.select({ id: symbols.id }).from(symbols).where(eq(symbols.ticker, ticker)).limit(1);
	if (existing.length > 0) return;

	const [newSym] = await db
		.insert(symbols)
		.values({ ticker, type, exchange, name, isActive: true })
		.returning({ id: symbols.id });
	if (!newSym) return;

	// Add to backfill queue with explicit PENDING status (ADR-0013)
	const now = new Date();
	const targets = [
		{ i: "1d", y: 10 },
		{ i: "1h", y: 2 },
		{ i: "15m", y: 1 },
	];
	for (const t of targets) {
		const start = new Date(now);
		start.setFullYear(start.getFullYear() - t.y);
		await db
			.insert(backfillProgress)
			.values({
				symbolId: newSym.id,
				interval: t.i,
				targetStartDate: start,
				isCompleted: false,
				backfillStatus: "PENDING",
			})
			.onConflictDoNothing();
	}
}

// ── HANDLER: Enrichment ─────────────────────────────────────────────────────

async function handleEnrichment() {
	const unenriched = await db
		.select({ id: symbols.id, ticker: symbols.ticker })
		.from(symbols)
		.leftJoin(symbolFinancials, eq(symbolFinancials.symbolId, symbols.id))
		.where(isNull(symbolFinancials.symbolId))
		.orderBy(sql`RANDOM()`)
		.limit(20);

	for (const sym of unenriched) {
		try {
			await marketService.enrichSymbol(sym.ticker);
			logger.info(`✅ Enriched: ${sym.ticker}`);
		} catch (e: any) {
			logger.error(`Enrichment failed for ${sym.ticker}: ${e.message}`);
		}
		await new Promise((r) => setTimeout(r, 3000));
	}
}

// ── HANDLER: Backfill (Phase 5) ──────────────────────────────────────────────

async function handleBackfill() {
	// Ambil tasks yang belum selesai — gunakan enum status baru (ADR-0013)
	// Fallback: juga include rows lama yang pakai isCompleted=false tapi belum punya status enum
	const tasks = await db
		.select()
		.from(backfillProgress)
		.where(
			sql`(
				${backfillProgress.backfillStatus} IN ('PENDING', 'IN_PROGRESS')
				OR (${backfillProgress.backfillStatus} IS NULL AND ${backfillProgress.isCompleted} = false)
			)`,
		)
		.orderBy(asc(backfillProgress.updatedAt))
		.limit(1000);

	const BATCH_SIZE = 15;
	for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
		const chunk = tasks.slice(i, i + BATCH_SIZE);
		await Promise.all(
			chunk.map(async (task) => {
				const symbol = await db.query.symbols.findFirst({ where: eq(symbols.id, task.symbolId) });
				if (!symbol) return;

				// Mark as IN_PROGRESS to prevent duplicate processing
				await db
					.update(backfillProgress)
					.set({ backfillStatus: "IN_PROGRESS", updatedAt: new Date() })
					.where(eq(backfillProgress.id, task.id));

				try {
					const source = await marketService.resolveSymbolSource(symbol.ticker);

					// Validate YAHOO limitations
					const isYahooAndUnsupported = source === "YAHOO" && (symbol.type !== "STOCK" || !["1d", "1h", "1wk", "1mo"].includes(task.interval));
					
					if (isYahooAndUnsupported) {
						// Skip unsupported combos — mark as SKIPPED to avoid infinite retries
						await db
							.update(backfillProgress)
							.set({ backfillStatus: "SKIPPED", isCompleted: true, updatedAt: new Date() })
							.where(eq(backfillProgress.id, task.id));
						return;
					}

					logger.info(`⏳ [Backfill] ${symbol.ticker} (${task.interval}) via ${source}`);

					await marketService.syncSymbolData(
						symbol.ticker,
						symbol.type as any,
						task.interval as any,
						task.targetStartDate,
						source,
					);

					// Mark COMPLETED and promote to INCREMENTAL (ADR-0013)
					await db
						.update(backfillProgress)
						.set({
							backfillStatus: "INCREMENTAL", // Langsung ke mode incremental untuk monitoring real-time
							isCompleted: true,
							lastSyncedAt: new Date(),
							updatedAt: new Date(),
						})
						.where(eq(backfillProgress.id, task.id));
				} catch (e: any) {
					logger.error(`Backfill failed for ${symbol.ticker} ${task.interval}: ${e.message}`);
					const isRateLimit = e.message?.includes("429") || e.message?.includes("Circuit Breaker") || e.message?.toLowerCase().includes("rate limit");
					await db
						.update(backfillProgress)
						.set({ 
							backfillStatus: isRateLimit ? "PENDING" : "FAILED", 
							updatedAt: new Date() 
						})
						.where(eq(backfillProgress.id, task.id));
				}
			}),
		);
		// No artificial delay for backfill batches unless it's Playwright-heavy
		await new Promise((r) => setTimeout(r, 50));
	}
}

// ── HANDLER: Incremental Sync (Forward Fill — ADR-0013) ──────────────────────

async function handleIncrementalSync() {
	// 1. Dapatkan semua task yang sudah masuk mode INCREMENTAL
	const tasks = await db
		.select()
		.from(backfillProgress)
		.where(eq(backfillProgress.backfillStatus, "INCREMENTAL"))
		.orderBy(asc(backfillProgress.updatedAt));

	if (tasks.length === 0) return;

	// 2. Identifikasi VIP (watchlist/holdings) untuk prioritas tinggi
	const [watchlistRows, holdingRows] = await Promise.all([
		db.select({ id: watchlistItems.symbolId }).from(watchlistItems),
		db.select({ id: holdings.symbolId }).from(holdings),
	]);
	const vipIds = new Set([...watchlistRows.map((r) => r.id), ...holdingRows.map((r) => r.id)]);

	// 3. Filter tasks:
	// - VIP: tiap 15 menit (semua diproses tiap run)
	// - Standard: tiap jam (hanya yang sudah stale > 60m)
	const now = new Date();
	const tasksToProcess = tasks.filter((task) => {
		const isVip = vipIds.has(task.symbolId);
		if (isVip) return true; // VIP selalu sinkron tiap 15m (frekuensi job)

		// Standard: cek apakah sudah > 60 menit sejak update terakhir
		const lastUpdate = task.updatedAt || new Date(0);
		const diffMinutes = (now.getTime() - lastUpdate.getTime()) / 60000;
		return diffMinutes >= 60;
	});

	if (tasksToProcess.length === 0) return;

	logger.info(`🔄 [IncrementalSync] Processing ${tasksToProcess.length} tasks (${vipIds.size} VIPs detected)`);

	const BATCH_SIZE = 10;
	for (let i = 0; i < tasksToProcess.length; i += BATCH_SIZE) {
		const chunk = tasksToProcess.slice(i, i + BATCH_SIZE);
		await Promise.all(
			chunk.map(async (task) => {
				const symbol = await db.query.symbols.findFirst({ where: eq(symbols.id, task.symbolId) });
				if (!symbol) return;

				try {
					// Forward fill: sync data terbaru
					await marketService.syncSymbolData(
						symbol.ticker,
						symbol.type as any,
						task.interval as any,
						undefined,
						"YAHOO",
					);

					await db
						.update(backfillProgress)
						.set({ updatedAt: new Date(), lastSyncedAt: new Date() })
						.where(eq(backfillProgress.id, task.id));
				} catch (e: any) {
					logger.error(`Incremental sync failed for ${symbol.ticker} ${task.interval}: ${e.message}`);
				}
			}),
		);
		await new Promise((r) => setTimeout(r, 100));
	}
}
