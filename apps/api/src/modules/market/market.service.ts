import { sql } from "drizzle-orm";
import { symbols, backfillProgress } from "@packages/db/src/schema";
import { db } from "../../db";
import { redisConnection } from "../scheduler/queue";
import { Logger } from "../../utils/logger";
import { CacheService } from "./cache/cache.service";
import { DataProviderFactory } from "./providers/provider.factory";
import { TradingViewRustProvider } from "./providers/tradingview-rust.provider";
import { YahooFinanceProvider } from "./providers/yahoo-finance.provider";

import { SymbolRepository } from "./repositories/symbol.repository";
import { CandleService } from "./services/candle.service";
import { FinancialsService } from "./services/financials.service";
import { MoversService } from "./services/movers.service";
import { OverviewService } from "./services/overview.service";
import { QuoteService } from "./services/quote.service";
import { questDbService } from "./services/QuestDBService";
import { SymbolService } from "./services/symbol.service";
import { SyncService } from "./services/sync.service";

// Initialize Dependencies
const logger = new Logger("MarketService");
const symbolRepo = new SymbolRepository(db);

const dataProvider = new YahooFinanceProvider();
const providerFactory = new DataProviderFactory();
const cacheService = new CacheService();
const tvProvider = new TradingViewRustProvider();

const symbolService = new SymbolService(symbolRepo, dataProvider, redisConnection, logger, tvProvider);
export const syncService = new SyncService(symbolService, providerFactory, redisConnection, logger);
export const candleService = new CandleService(symbolService, syncService, redisConnection, logger);
const overviewService = new OverviewService(symbolRepo, logger);
const quoteService = new QuoteService(symbolRepo, providerFactory, cacheService, logger);
const moversService = new MoversService(quoteService, cacheService, logger);
const financialsService = new FinancialsService(dataProvider);

export class MarketService {
	// Delegate to SymbolService
	async ensureSymbol(
		ticker: string,
		type: "STOCK" | "CRYPTO",
		metadata?: { provider?: string; exchange?: string; currency?: string; name?: string },
	) {
		return symbolService.ensureSymbol(ticker, type, metadata);
	}

	async getSymbols() {
		return symbolService.getSymbols();
	}

	async enrichSymbol(ticker: string) {
		const symbol = await symbolService.enrichSymbol(ticker);
		if (symbol) {
			// Trigger detailed enrichment in background
			Promise.all([
				financialsService.getFinancials(ticker),
				financialsService.getEarnings(ticker),
				financialsService.getAnalystRatings(ticker),
			]).catch((err) => logger.error(`Detailed enrichment failed for ${ticker}`, err));
		}
		return symbol;
	}

	async getSymbolByTicker(ticker: string) {
		return symbolService.getSymbolByTicker(ticker);
	}

	// Delegate to SyncService
	async syncSymbolData(
		ticker: string,
		type: "STOCK" | "CRYPTO",
		interval: string = "1h",
		endDate?: Date,
		source: string = "YAHOO",
	) {
		return syncService.syncSymbolData(ticker, type, interval, endDate, source);
	}

	/**
	 * Unified OHLCV fetch — QuestDB as single source of truth.
	 *
	 * Flow (owned by CandleService):
	 * 1. LRU in-process cache (30s TTL)
	 * 2. QuestDB query (source-aware)
	 * 3. On MISS: backfill from TV/Yahoo → promote to QuestDB → serve from QuestDB
	 *
	 * Source resolution:
	 * - Explicit source from frontend → use it
	 * - No source → look up symbol's pinned provider in DB
	 * - Unknown symbol → TRADINGVIEW for intraday, YAHOO for daily+
	 */
	async getOHLCV(ticker: string, interval: string, limit: number, before?: string, explicitSource?: string) {
		// Resolve source: explicit → DB-pinned → smart default
		let source = explicitSource;

		if (!source) {
			const existing = await symbolService.getSymbolByTicker(ticker);
			if (existing?.provider) {
				const providerMap: Record<string, string> = {
					tradingview: "TRADINGVIEW",
					yahoo: "YAHOO",
					ccxt: "CCXT",
				};
				source = providerMap[existing.provider.toLowerCase()] || existing.provider.toUpperCase();
				logger.debug(`[getOHLCV] DB-pinned source for ${ticker}: ${source}`);
			}
		}

		if (!source) {
			const intradayIntervals = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h"];
			source = intradayIntervals.includes(interval) ? "TRADINGVIEW" : "YAHOO";
			logger.debug(`[getOHLCV] No source for ${ticker}, defaulting to ${source}`);
		}

		// CandleService owns: LRU → QuestDB → backfill → promote → QuestDB
		return candleService.getOHLCV(ticker, interval, limit, before, source);
	}

	// async getDownsampledCandles(ticker: string, resolution: string, limit: number) {
	// 	return candleService.getDownsampledCandles(ticker, resolution, limit);
	// }

	// Delegate to OverviewService (for backward compatibility)
	async getMarketOverview(tickers: string[]) {
		return overviewService.getMarketOverview(tickers);
	}

	// Delegate to MoversService
	async getTopMovers(limit = 6) {
		return moversService.getTopMovers(limit);
	}

	// ===== Delegate to QuoteService =====

	/**
	 * Get real-time quotes with smart routing.
	 * Group tickers by their pinned provider in DB to ensure correct sourcing.
	 */
	async getQuotes(tickers: string[], period: string = "7d", explicitSource?: string) {
		if (tickers.length === 0) return [];

		// If a source is explicitly provided (e.g. from a specific UI context), use it for all.
		if (explicitSource && explicitSource !== "AUTO") {
			return quoteService.getQuotes(tickers, period, explicitSource);
		}

		// Otherwise, look up each ticker in DB to find its provider
		const syms = await symbolRepo.findByTickers(tickers);
		const providerMap = new Map<string, string>(); // Ticker -> Source

		for (const s of syms) {
			const provider = s.provider?.toLowerCase();
			let source = "YAHOO";
			if (provider === "tradingview") source = "TRADINGVIEW";
			else if (provider === "ccxt") source = "CCXT";
			providerMap.set(s.ticker.toUpperCase(), source);
		}

		// Group tickers by source
		const groups = new Map<string, string[]>();
		for (const ticker of tickers) {
			const upper = ticker.toUpperCase();
			const source = providerMap.get(upper) || "YAHOO"; // Fallback to YAHOO for new symbols
			if (!groups.has(source)) groups.set(source, []);
			groups.get(source)!.push(upper);
		}

		// Fetch from each source in parallel
		const promises = Array.from(groups.entries()).map(([source, groupTickers]) => {
			return quoteService.getQuotes(groupTickers, period, source);
		});

		const results = await Promise.all(promises);
		return results.flat();
	}

	/**
	 * Resolve the preferred data source (provider) for a symbol from the DB.
	 * Used by sync and other operations that need to know the correct provider
	 * without the frontend specifying it explicitly.
	 * Falls back to 'YAHOO' only for symbols not yet in DB (new discovery).
	 */
	async resolveSymbolSource(ticker: string): Promise<string> {
		try {
			const sym = await symbolRepo.findByTicker(ticker.toUpperCase());
			if (sym?.provider) {
				const p = sym.provider.toLowerCase();
				if (p === "tradingview") return "TRADINGVIEW";
				if (p === "ccxt") return "CCXT";
			}
		} catch (e) {
			logger.warn(`[resolveSymbolSource] DB lookup failed for ${ticker}`, e);
		}
		return "YAHOO"; // Only for genuinely new/unknown symbols
	}

	/**
	 * Search for symbols using Yahoo Finance
	 */
	async searchSymbols(query: string, limit: number = 15) {
		return quoteService.search(query, limit);
	}

	/**
	 * Search for symbols across multiple sources (Yahoo + TradingView + Local DB).
	 * Returns ALL results from ALL sources without deduplication.
	 * The identity of a result is (symbol, exchange, source) — not just ticker.
	 * Results from DB use their original provider as source (not forced to "LOCAL").
	 */
	async searchSymbolsMultiSource(query: string, limit: number = 15): Promise<any[]> {
		const cacheKey = `search:${query.toLowerCase()}:${limit}`;
		const cached = cacheService.get<any[]>(cacheKey);
		if (cached) {
			logger.debug(`Cache hit for search: ${query}`);
			return cached;
		}

		logger.debug(`Multi-source search for: ${query}`);

		// Helper to add timeout to promises
		const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> =>
			Promise.race([
				promise,
				new Promise<null>((resolve) =>
					setTimeout(() => {
						logger.warn(`${label} search timed out after ${ms}ms`);
						resolve(null);
					}, ms),
				),
			]);

		// Query all sources in parallel with strict timeouts for external providers
		const [yahooResults, tvResults, localResults] = await Promise.allSettled([
			withTimeout(quoteService.search(query, limit), 2000, "Yahoo"),
			withTimeout(tvProvider.search(query, limit), 2500, "TradingView"),
			symbolRepo.search(query, limit), // No timeout for local DB
		]);

		const all: any[] = [];
		const seen = new Set<string>();

		// 1. Database results first (High Reliability & Pre-followed)
		if (localResults.status === "fulfilled" && localResults.value) {
			for (const r of localResults.value) {
				const provider = r.provider?.toUpperCase();
				let source = "YAHOO";
				if (provider === "TRADINGVIEW") source = "TRADINGVIEW";
				else if (provider === "ENGINE") source = "ENGINE";

				const key = `${r.ticker}:${r.exchange}`.toUpperCase();
				seen.add(key);

				all.push({
					symbol: r.ticker,
					name: r.name,
					type: r.type,
					exchange: r.exchange,
					source,
					isFollowed: true,
				});
			}
		}

		// 2. TradingView results (High Precision)
		if (tvResults.status === "fulfilled" && tvResults.value) {
			for (const r of tvResults.value) {
				const key = `${r.ticker}:${r.exchange}`.toUpperCase();
				if (!seen.has(key)) {
					seen.add(key);
					all.push({ ...r, isFollowed: false });
				}
			}
		}

		// 3. Yahoo Finance results (Broad Coverage)
		if (yahooResults.status === "fulfilled" && yahooResults.value) {
			for (const r of yahooResults.value) {
				const ticker = (r as any).ticker || (r as any).symbol;
				const exchange = (r as any).exchange || (r as any).exchDisp;
				const key = `${ticker}:${exchange}`.toUpperCase();

				if (!seen.has(key)) {
					seen.add(key);
					all.push({
						symbol: ticker,
						name: (r as any).name || (r as any).longName || (r as any).shortName,
						type: (r as any).type || (r as any).quoteType,
						exchange: exchange,
						currency: (r as any).currency,
						source: "YAHOO",
						isFollowed: false,
					});
				}
			}
		}

		logger.debug(`Multi-source search returned ${all.length} unique results`);
		const finalResults = all.slice(0, limit);

		// Cache for 5 minutes
		cacheService.set(cacheKey, finalResults, 5 * 60 * 1000);

		return finalResults;
	}

	/**
	 * Get trending symbols
	 */
	async getTrendingSymbols(region: string = "US", count: number = 10) {
		return quoteService.getTrending(region, count);
	}

	/**
	 * Get recommendations for a symbol
	 */
	async getRecommendations(ticker: string) {
		return quoteService.getRecommendations(ticker);
	}

	// ===== Delegate to FinancialsService =====

	async getFinancials(ticker: string) {
		return financialsService.getFinancials(ticker);
	}

	async getEarnings(ticker: string) {
		return financialsService.getEarnings(ticker);
	}

	async getAnalystRatings(ticker: string) {
		return financialsService.getAnalystRatings(ticker);
	}

	/**
	 * Fetches historical OHLCV data from QuestDB (Anasys Engine).
	 * Data is retrieved from the 'candles' table which stores pre-aggregated OHLCV data.
	 */
	/**
	 * Direct QuestDB query — used by Engine health checks and admin endpoints.
	 * For chart serving, use getOHLCV() which goes through CandleService.
	 */
	async getHistoricalOHLCV(symbol: string, interval = "1d", limit = 500, source?: string) {
		try {
			return await questDbService.getCandles(symbol, interval, source || "YAHOO", limit);
		} catch (err) {
			logger.error(`[QuestDB] getHistoricalOHLCV failed for ${symbol}`, err);
			return [];
		}
	}

	/**
	 * Get market-wide data statistics (coverage, gaps, totals)
	 */
	async getMarketStats() {
		logger.debug("Calculating market stats...");
		// 1. Total tickers in database
		const totalTickersCount = await db.select({ count: sql`count(*)` }).from(symbols);
		const totalTickers = Number(totalTickersCount[0]?.count || 0);
		logger.debug(`Total tickers: ${totalTickers}`);

		// 2. Tickers with data gaps for different periods
		// We define a "gap" if backfill_progress.is_completed is false for '1d' interval
		// or if there's no progress entry at all.
		const periods = [
			{ label: "10y", years: 10 },
			{ label: "5y", years: 5 },
			{ label: "1y", years: 1 },
			{ label: "6m", months: 6 },
			{ label: "3m", months: 3 },
			{ label: "1m", months: 1 },
		];

		const coverage: Record<string, number> = {};

		for (const period of periods) {
			const targetDate = new Date();
			if (period.years) targetDate.setFullYear(targetDate.getFullYear() - period.years);
			if (period.months) targetDate.setMonth(targetDate.getMonth() - period.months);

			// Count symbols that have completed backfill for this period (or better)
			// For simplicity now, we check if they have a completed record with targetDate <= this period's targetDate
			const result = await db.execute(sql`
                SELECT count(DISTINCT s.id) as count
                FROM symbols s
                JOIN backfill_progress bp ON s.id = bp.symbol_id
                WHERE bp.interval = '1d' 
                AND bp.is_completed = true
                AND bp.target_start_date <= ${targetDate.toISOString()}
            `);

			const completedCount = Number((result[0] as any)?.count || 0);
			coverage[period.label] = totalTickers - completedCount; // "Gaps" count
		}

		return {
			totalTickers,
			gaps: coverage,
			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Get high-resolution monitoring stats for the harvesting engine.
	 * Uses Redis to calculate deltas between snapshots for real-time throughput.
	 */
	async getMonitoringStats() {
		const MONITORING_CACHE_KEY = "anasys:monitoring:snapshot";

		// 1. Current State (Postgres)
		const completedTasksRes = await db
			.select({ count: sql`count(*)` })
			.from(backfillProgress)
			.where(sql`is_completed = true`);
		const completedTasks = Number(completedTasksRes[0]?.count || 0);

		const totalTasksRes = await db.select({ count: sql`count(*)` }).from(backfillProgress);
		const totalTasks = Number(totalTasksRes[0]?.count || 0);

		// 2. Current State (QuestDB Candles)
		let candleCount = 0;
		try {
			const qdbRes = await questDbService.query("SELECT count(*) as count FROM candles");
			const qdbData = questDbService.formatResult<any>(qdbRes);
			candleCount = Number(qdbData[0]?.count || 0);
		} catch (e) {
			logger.warn("Failed to get candle count from QuestDB", e);
		}

		// 3. Get Previous Snapshot from Redis
		const prevSnapshotRaw = await redisConnection.get(MONITORING_CACHE_KEY);
		const now = Date.now();
		let tps = 0;
		let cps = 0;
		let timeRemaining = "Unknown";

		if (prevSnapshotRaw) {
			const prev = JSON.parse(prevSnapshotRaw);
			// Gunakan CPS dan TPS yang tersimpan di cache untuk ditampilkan ke UI
			tps = prev.tps || 0;
			cps = prev.cps || 0;
			timeRemaining = prev.timeRemaining || "Unknown";

			// Preserve the absolute start of this monitoring session for global average
			const firstTimestamp = prev.firstTimestamp || prev.timestamp;
			const firstCompletedTasks = prev.firstCompletedTasks || prev.completedTasks;

			const timeDeltaSec = (now - prev.timestamp) / 1000;

			// Perbarui rata-rata throughput setiap 60 detik (sangat stabil untuk batch besar)
			if (timeDeltaSec >= 60) {
				const globalTimeElapsedSec = Math.max(1, (now - firstTimestamp) / 1000);

				// Calculate Global TPS for ETA (Tasks take a long time, 60s is too small)
				const globalTps = Math.max(0, (completedTasks - firstCompletedTasks) / globalTimeElapsedSec);

				// Calculate Moving Average CPS (Candles move fast, 60s is good)
				const newCps = Math.max(0, (candleCount - prev.candleCount) / timeDeltaSec);

				let newTimeRemaining = "Unknown";
				const remaining = totalTasks - completedTasks;

				if (globalTps > 0) {
					const secondsLeft = remaining / globalTps;
					const hours = Math.floor(secondsLeft / 3600);
					const minutes = Math.floor((secondsLeft % 3600) / 60);
					newTimeRemaining = `${hours}h ${minutes}m`;
				}

				await redisConnection.set(
					MONITORING_CACHE_KEY,
					JSON.stringify({
						timestamp: now,
						firstTimestamp,
						firstCompletedTasks,
						completedTasks,
						candleCount,
						tps: globalTps,
						cps: newCps,
						timeRemaining: newTimeRemaining,
					}),
					"EX",
					60 * 60 * 24, // 24 hours expiry so global average persists longer
				);

				tps = globalTps;
				cps = newCps;
				timeRemaining = newTimeRemaining;
			}
		} else {
			// Inisialisasi awal
			await redisConnection.set(
				MONITORING_CACHE_KEY,
				JSON.stringify({
					timestamp: now,
					firstTimestamp: now,
					firstCompletedTasks: completedTasks,
					completedTasks,
					candleCount,
					tps: 0,
					cps: 0,
					timeRemaining: "Unknown",
				}),
				"EX",
				60 * 60 * 24,
			);
		}

		// 5. Status Breakdown
		const statusBreakdown = await db.execute(sql`
			SELECT 
				interval,
				count(*) filter (where is_completed = true) as completed,
				count(*) as total
			FROM backfill_progress
			GROUP BY interval
		`);

		return {
			tasks: {
				completed: completedTasks,
				total: totalTasks,
				percentage: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : "0",
				tps: tps.toFixed(2),
			},
			candles: {
				total: candleCount,
				cps: cps.toFixed(2),
			},
			estimate: {
				timeRemaining,
			},
			breakdown: statusBreakdown,
			timestamp: new Date().toISOString(),
		};
	}
}

// Export singleton
export const marketService = new MarketService();
