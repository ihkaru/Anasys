import { eq } from "drizzle-orm";
import { analystRatings, symbolEarnings, symbolFinancials, symbols } from "../../../../../../packages/db/src/schema";
import { db } from "../../../db";
import { CacheService } from "../cache/cache.service";
import type { YahooFinanceProvider } from "../providers/yahoo-finance.provider";

export interface FinancialsData {
	// Price metrics
	trailingPE?: number;
	forwardPE?: number;
	priceToBook?: number;
	pegRatio?: number;

	// Dividends
	dividendYield?: number;
	exDividendDate?: string;

	// Risk
	beta?: number;

	// 52 Week Range
	fiftyTwoWeekHigh?: number;
	fiftyTwoWeekLow?: number;
	fiftyDayAverage?: number;
	twoHundredDayAverage?: number;

	// Volume
	averageVolume?: number;

	// Income Statement
	totalRevenue?: number;
	revenuePerShare?: number;
	grossProfit?: number;
	ebitda?: number;
	netIncomeToCommon?: number;

	// Margins
	grossMargins?: number;
	operatingMargins?: number;
	profitMargins?: number;

	// Returns
	returnOnEquity?: number;
	returnOnAssets?: number;

	// Debt
	debtToEquity?: number;
	currentRatio?: number;
	quickRatio?: number;
	freeCashflow?: number;

	// Analyst
	targetMeanPrice?: number;
	targetHighPrice?: number;
	targetLowPrice?: number;
	recommendationMean?: number;
	recommendationKey?: string;
	numberOfAnalystOpinions?: number;

	// Shares
	sharesOutstanding?: number;
	floatShares?: number;
	sharesShort?: number;
	shortRatio?: number;
	heldPercentInsiders?: number;
	heldPercentInstitutions?: number;

	// Value
	bookValue?: number;
	enterpriseValue?: number;
	trailingEps?: number;
	forwardEps?: number;

	updatedAt?: string;
}

export interface EarningsData {
	nextEarningsDate?: string;
	nextExDividendDate?: string;
	nextDividendDate?: string;
	earningsHistory?: EarningsQuarter[];
	revenueHistory?: RevenueQuarter[];
	earningsTrend?: EarningsTrendItem[];
	updatedAt?: string;
}

export interface EarningsQuarter {
	date: string;
	epsActual?: number;
	epsEstimate?: number;
	epsDifference?: number;
	surprisePercent?: number;
}

export interface RevenueQuarter {
	date: string;
	revenue?: number;
	earnings?: number;
}

export interface EarningsTrendItem {
	period: string;
	endDate?: string;
	growth?: number;
	earningsEstimate?: number;
	revenueEstimate?: number;
}

export interface AnalystData {
	strongBuy: number;
	buy: number;
	hold: number;
	sell: number;
	strongSell: number;
	total: number;
	ratingsTrend?: AnalystTrendItem[];
	updatedAt?: string;
}

export interface AnalystTrendItem {
	period: string;
	strongBuy: number;
	buy: number;
	hold: number;
	sell: number;
	strongSell: number;
}

const CACHE_TTL_FINANCIALS = 3600 * 1000; // 1 hour
const CACHE_TTL_EARNINGS = 3600 * 1000; // 1 hour
const CACHE_TTL_ANALYST = 3600 * 1000; // 1 hour
const STALE_THRESHOLD = 24 * 3600 * 1000; // 24 hours

export class FinancialsService {
	private provider: YahooFinanceProvider;
	private cache: CacheService;

	constructor(provider: YahooFinanceProvider) {
		this.provider = provider;
		this.cache = new CacheService();
	}

	/**
	 * Get financial metrics for a symbol
	 */
	async getFinancials(ticker: string): Promise<FinancialsData | null> {
		const cacheKey = `financials:${ticker}`;

		// Check memory cache
		const cached = this.cache.get<FinancialsData>(cacheKey);
		if (cached) return cached;

		// Check database
		const symbol = await db.query.symbols.findFirst({
			where: eq(symbols.ticker, ticker),
		});

		if (!symbol) return null;

		const dbData = await db.query.symbolFinancials.findFirst({
			where: eq(symbolFinancials.symbolId, symbol.id),
		});

		// Check if data is fresh enough
		const isStale = !dbData || Date.now() - new Date(dbData.updatedAt).getTime() > STALE_THRESHOLD;

		if (isStale) {
			// Fetch fresh data from Yahoo
			try {
				const freshData = await this.fetchAndStoreFinancials(symbol.id, ticker);
				this.cache.set(cacheKey, freshData, CACHE_TTL_FINANCIALS);
				return freshData;
			} catch (e) {
				console.error(`Failed to fetch financials for ${ticker}:`, e);
				// Return stale data if available
				if (dbData) {
					const mapped = this.mapDbFinancials(dbData);
					this.cache.set(cacheKey, mapped, CACHE_TTL_FINANCIALS);
					return mapped;
				}
				return null;
			}
		}

		const mapped = this.mapDbFinancials(dbData);
		this.cache.set(cacheKey, mapped, CACHE_TTL_FINANCIALS);
		return mapped;
	}

	/**
	 * Get earnings data for a symbol
	 */
	async getEarnings(ticker: string): Promise<EarningsData | null> {
		const cacheKey = `earnings:${ticker}`;

		const cached = this.cache.get<EarningsData>(cacheKey);
		if (cached) return cached;

		const symbol = await db.query.symbols.findFirst({
			where: eq(symbols.ticker, ticker),
		});

		if (!symbol) return null;

		const dbData = await db.query.symbolEarnings.findFirst({
			where: eq(symbolEarnings.symbolId, symbol.id),
		});

		const isStale = !dbData || Date.now() - new Date(dbData.updatedAt).getTime() > STALE_THRESHOLD;

		if (isStale) {
			try {
				const freshData = await this.fetchAndStoreEarnings(symbol.id, ticker);
				this.cache.set(cacheKey, freshData, CACHE_TTL_EARNINGS);
				return freshData;
			} catch (e) {
				console.error(`Failed to fetch earnings for ${ticker}:`, e);
				if (dbData) {
					const mapped = this.mapDbEarnings(dbData);
					this.cache.set(cacheKey, mapped, CACHE_TTL_EARNINGS);
					return mapped;
				}
				return null;
			}
		}

		const mapped = this.mapDbEarnings(dbData);
		this.cache.set(cacheKey, mapped, CACHE_TTL_EARNINGS);
		return mapped;
	}

	/**
	 * Get analyst ratings for a symbol
	 */
	async getAnalystRatings(ticker: string): Promise<AnalystData | null> {
		const cacheKey = `analyst:${ticker}`;

		const cached = this.cache.get<AnalystData>(cacheKey);
		if (cached) return cached;

		const symbol = await db.query.symbols.findFirst({
			where: eq(symbols.ticker, ticker),
		});

		if (!symbol) return null;

		const dbData = await db.query.analystRatings.findFirst({
			where: eq(analystRatings.symbolId, symbol.id),
		});

		const isStale = !dbData || Date.now() - new Date(dbData.updatedAt).getTime() > STALE_THRESHOLD;

		if (isStale) {
			try {
				const freshData = await this.fetchAndStoreAnalystRatings(symbol.id, ticker);
				this.cache.set(cacheKey, freshData, CACHE_TTL_ANALYST);
				return freshData;
			} catch (e) {
				console.error(`Failed to fetch analyst ratings for ${ticker}:`, e);
				if (dbData) {
					const mapped = this.mapDbAnalyst(dbData);
					this.cache.set(cacheKey, mapped, CACHE_TTL_ANALYST);
					return mapped;
				}
				return null;
			}
		}

		const mapped = this.mapDbAnalyst(dbData);
		this.cache.set(cacheKey, mapped, CACHE_TTL_ANALYST);
		return mapped;
	}

	// ==================
	// Private Methods
	// ==================

	private async fetchAndStoreFinancials(symbolId: number, ticker: string): Promise<FinancialsData> {
		const startTime = Date.now();
		console.log(`[Financials] Fetching ${ticker} from Yahoo...`);

		try {
			const summary = await this.provider.fetchQuoteSummary(ticker, [
				"summaryDetail",
				"financialData",
				"defaultKeyStatistics",
			]);

			console.log(`[Financials] ${ticker} Yahoo responded in ${Date.now() - startTime}ms`);

			const sd = summary?.summaryDetail || {};
			const fd = summary?.financialData || {};
			const ks = summary?.defaultKeyStatistics || {};

			const data: any = {
				symbolId,

				// summaryDetail
				trailingPE: this.extractValue(sd.trailingPE),
				forwardPE: this.extractValue(sd.forwardPE),
				priceToBook: this.extractValue(sd.priceToBook),
				dividendYield: this.extractValue(sd.dividendYield),
				exDividendDate: sd.exDividendDate ? new Date(sd.exDividendDate) : null,
				beta: this.extractValue(sd.beta),
				fiftyTwoWeekHigh: this.extractValue(sd.fiftyTwoWeekHigh),
				fiftyTwoWeekLow: this.extractValue(sd.fiftyTwoWeekLow),
				fiftyDayAverage: this.extractValue(sd.fiftyDayAverage),
				twoHundredDayAverage: this.extractValue(sd.twoHundredDayAverage),
				averageVolume: this.extractValue(sd.averageVolume),

				// financialData
				totalRevenue: this.extractValue(fd.totalRevenue),
				revenuePerShare: this.extractValue(fd.revenuePerShare),
				grossProfit: this.extractValue(fd.grossProfits),
				ebitda: this.extractValue(fd.ebitda),
				netIncomeToCommon: this.extractValue(fd.netIncomeToCommon),
				grossMargins: this.extractValue(fd.grossMargins),
				operatingMargins: this.extractValue(fd.operatingMargins),
				profitMargins: this.extractValue(fd.profitMargins),
				returnOnEquity: this.extractValue(fd.returnOnEquity),
				returnOnAssets: this.extractValue(fd.returnOnAssets),
				debtToEquity: this.extractValue(fd.debtToEquity),
				currentRatio: this.extractValue(fd.currentRatio),
				quickRatio: this.extractValue(fd.quickRatio),
				freeCashflow: this.extractValue(fd.freeCashflow),
				targetMeanPrice: this.extractValue(fd.targetMeanPrice),
				targetHighPrice: this.extractValue(fd.targetHighPrice),
				targetLowPrice: this.extractValue(fd.targetLowPrice),
				recommendationMean: this.extractValue(fd.recommendationMean),
				recommendationKey: fd.recommendationKey,
				numberOfAnalystOpinions: this.extractValue(fd.numberOfAnalystOpinions),

				// defaultKeyStatistics
				sharesOutstanding: this.extractValue(ks.sharesOutstanding),
				floatShares: this.extractValue(ks.floatShares),
				sharesShort: this.extractValue(ks.sharesShort),
				shortRatio: this.extractValue(ks.shortRatio),
				heldPercentInsiders: this.extractValue(ks.heldPercentInsiders),
				heldPercentInstitutions: this.extractValue(ks.heldPercentInstitutions),
				bookValue: this.extractValue(ks.bookValue),
				enterpriseValue: this.extractValue(ks.enterpriseValue),
				trailingEps: this.extractValue(ks.trailingEps),
				forwardEps: this.extractValue(ks.forwardEps),
				pegRatio: this.extractValue(ks.pegRatio),

				updatedAt: new Date(),
			};

			// Upsert to database
			await db
				.insert(symbolFinancials)
				.values(data)
				.onConflictDoUpdate({
					target: symbolFinancials.symbolId,
					set: { ...data, symbolId: undefined },
				});

			return this.mapDbFinancials(data);
		} catch (_e) {
			console.warn(`[Financials] Missing data for ${ticker}, skipping store.`);
			// Return empty structure
			return {
				updatedAt: new Date().toISOString(),
			};
		}
	}

	private async fetchAndStoreEarnings(symbolId: number, ticker: string): Promise<EarningsData> {
		try {
			const summary = await this.provider.fetchQuoteSummary(ticker, [
				"earnings",
				"earningsHistory",
				"earningsTrend",
				"calendarEvents",
			]);

			const earnings = summary?.earnings || {};
			const history = summary?.earningsHistory?.history || [];
			const trend = summary?.earningsTrend?.trend || [];
			const calendar = summary?.calendarEvents || {};

			// Parse earnings history
			const earningsHistory: EarningsQuarter[] = history.map((h: any) => ({
				date: h.quarter ? `${h.quarter}` : new Date(h.period).toISOString(),
				epsActual: this.extractValue(h.epsActual),
				epsEstimate: this.extractValue(h.epsEstimate),
				epsDifference: this.extractValue(h.epsDifference),
				surprisePercent: this.extractValue(h.surprisePercent),
			}));

			// Parse quarterly earnings from earnings module
			const financialChart = earnings?.financialsChart?.quarterly || [];
			const revenueHistory: RevenueQuarter[] = financialChart.map((q: any) => ({
				date: q.date,
				revenue: this.extractValue(q.revenue),
				earnings: this.extractValue(q.earnings),
			}));

			// Parse earnings trend
			const earningsTrend: EarningsTrendItem[] = trend.map((t: any) => ({
				period: t.period,
				endDate: t.endDate,
				growth: this.extractValue(t.growth),
				earningsEstimate: this.extractValue(t.earningsEstimate?.avg),
				revenueEstimate: this.extractValue(t.revenueEstimate?.avg),
			}));

			const data: any = {
				symbolId,
				nextEarningsDate: calendar.earnings?.earningsDate?.[0] ? new Date(calendar.earnings.earningsDate[0]) : null,
				nextExDividendDate: calendar.exDividendDate ? new Date(calendar.exDividendDate) : null,
				nextDividendDate: calendar.dividendDate ? new Date(calendar.dividendDate) : null,
				earningsHistory: JSON.stringify(earningsHistory),
				revenueHistory: JSON.stringify(revenueHistory),
				earningsTrend: JSON.stringify(earningsTrend),
				updatedAt: new Date(),
			};

			await db
				.insert(symbolEarnings)
				.values(data)
				.onConflictDoUpdate({
					target: symbolEarnings.symbolId,
					set: { ...data, symbolId: undefined },
				});

			return {
				nextEarningsDate: data.nextEarningsDate?.toISOString(),
				nextExDividendDate: data.nextExDividendDate?.toISOString(),
				nextDividendDate: data.nextDividendDate?.toISOString(),
				earningsHistory,
				revenueHistory,
				earningsTrend,
				updatedAt: data.updatedAt.toISOString(),
			};
		} catch (_e) {
			console.warn(`[Earnings] Missing data for ${ticker}`);
			return {
				earningsHistory: [],
				revenueHistory: [],
				earningsTrend: [],
				updatedAt: new Date().toISOString(),
			};
		}
	}

	private async fetchAndStoreAnalystRatings(symbolId: number, ticker: string): Promise<AnalystData> {
		try {
			const summary = await this.provider.fetchQuoteSummary(ticker, ["recommendationTrend"]);

			const trend = summary?.recommendationTrend?.trend || [];

			// Current month is usually index 0
			const current = trend[0] || {};

			const ratingsTrend: AnalystTrendItem[] = trend.map((t: any) => ({
				period: t.period || "0m",
				strongBuy: t.strongBuy || 0,
				buy: t.buy || 0,
				hold: t.hold || 0,
				sell: t.sell || 0,
				strongSell: t.strongSell || 0,
			}));

			const data: any = {
				symbolId,
				strongBuy: current.strongBuy || 0,
				buy: current.buy || 0,
				hold: current.hold || 0,
				sell: current.sell || 0,
				strongSell: current.strongSell || 0,
				ratingsTrend: JSON.stringify(ratingsTrend),
				updatedAt: new Date(),
			};

			await db
				.insert(analystRatings)
				.values(data)
				.onConflictDoUpdate({
					target: analystRatings.symbolId,
					set: { ...data, symbolId: undefined },
				});

			return {
				strongBuy: data.strongBuy,
				buy: data.buy,
				hold: data.hold,
				sell: data.sell,
				strongSell: data.strongSell,
				total: data.strongBuy + data.buy + data.hold + data.sell + data.strongSell,
				ratingsTrend,
				updatedAt: data.updatedAt.toISOString(),
			};
		} catch (_e) {
			console.warn(`[Analyst] Missing data for ${ticker}`);
			return {
				strongBuy: 0,
				buy: 0,
				hold: 0,
				sell: 0,
				strongSell: 0,
				total: 0,
				ratingsTrend: [],
				updatedAt: new Date().toISOString(),
			};
		}
	}

	private extractValue(val: any): number | null {
		if (val === undefined || val === null) return null;
		if (typeof val === "object" && "raw" in val) return val.raw;
		if (typeof val === "number") return val;
		return null;
	}

	private mapDbFinancials(data: any): FinancialsData {
		return {
			trailingPE: data.trailingPE,
			forwardPE: data.forwardPE,
			priceToBook: data.priceToBook,
			pegRatio: data.pegRatio,
			dividendYield: data.dividendYield,
			exDividendDate: data.exDividendDate?.toISOString?.() || data.exDividendDate,
			beta: data.beta,
			fiftyTwoWeekHigh: data.fiftyTwoWeekHigh,
			fiftyTwoWeekLow: data.fiftyTwoWeekLow,
			fiftyDayAverage: data.fiftyDayAverage,
			twoHundredDayAverage: data.twoHundredDayAverage,
			averageVolume: data.averageVolume,
			totalRevenue: data.totalRevenue,
			revenuePerShare: data.revenuePerShare,
			grossProfit: data.grossProfit,
			ebitda: data.ebitda,
			netIncomeToCommon: data.netIncomeToCommon,
			grossMargins: data.grossMargins,
			operatingMargins: data.operatingMargins,
			profitMargins: data.profitMargins,
			returnOnEquity: data.returnOnEquity,
			returnOnAssets: data.returnOnAssets,
			debtToEquity: data.debtToEquity,
			currentRatio: data.currentRatio,
			quickRatio: data.quickRatio,
			freeCashflow: data.freeCashflow,
			targetMeanPrice: data.targetMeanPrice,
			targetHighPrice: data.targetHighPrice,
			targetLowPrice: data.targetLowPrice,
			recommendationMean: data.recommendationMean,
			recommendationKey: data.recommendationKey,
			numberOfAnalystOpinions: data.numberOfAnalystOpinions,
			sharesOutstanding: data.sharesOutstanding,
			floatShares: data.floatShares,
			sharesShort: data.sharesShort,
			shortRatio: data.shortRatio,
			heldPercentInsiders: data.heldPercentInsiders,
			heldPercentInstitutions: data.heldPercentInstitutions,
			bookValue: data.bookValue,
			enterpriseValue: data.enterpriseValue,
			trailingEps: data.trailingEps,
			forwardEps: data.forwardEps,
			updatedAt: data.updatedAt?.toISOString?.() || data.updatedAt,
		};
	}

	private mapDbEarnings(data: any): EarningsData {
		return {
			nextEarningsDate: data.nextEarningsDate?.toISOString?.() || data.nextEarningsDate,
			nextExDividendDate: data.nextExDividendDate?.toISOString?.() || data.nextExDividendDate,
			nextDividendDate: data.nextDividendDate?.toISOString?.() || data.nextDividendDate,
			earningsHistory: data.earningsHistory ? JSON.parse(data.earningsHistory) : [],
			revenueHistory: data.revenueHistory ? JSON.parse(data.revenueHistory) : [],
			earningsTrend: data.earningsTrend ? JSON.parse(data.earningsTrend) : [],
			updatedAt: data.updatedAt?.toISOString?.() || data.updatedAt,
		};
	}

	private mapDbAnalyst(data: any): AnalystData {
		return {
			strongBuy: data.strongBuy || 0,
			buy: data.buy || 0,
			hold: data.hold || 0,
			sell: data.sell || 0,
			strongSell: data.strongSell || 0,
			total: (data.strongBuy || 0) + (data.buy || 0) + (data.hold || 0) + (data.sell || 0) + (data.strongSell || 0),
			ratingsTrend: data.ratingsTrend ? JSON.parse(data.ratingsTrend) : [],
			updatedAt: data.updatedAt?.toISOString?.() || data.updatedAt,
		};
	}
}
