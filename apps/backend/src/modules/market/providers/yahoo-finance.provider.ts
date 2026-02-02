import yahooFinance from "yahoo-finance2";
import type { IDataProvider, UnifiedCandle } from "./data-provider.interface";

export interface QuoteResult {
	ticker: string;
	name: string;
	price: number;
	previousClose: number;
	change: number;
	changePercent: number;
	volume: number;
	marketCap?: number;
	high52Week?: number;
	low52Week?: number;
	updatedAt: Date;
	currency?: string;
	marketState?: "PRE" | "PREPRE" | "REGULAR" | "POST" | "POSTPOST" | "CLOSED";
	preMarketPrice?: number;
	preMarketChange?: number;
	preMarketChangePercent?: number;
	postMarketPrice?: number;
	postMarketChange?: number;
	postMarketChangePercent?: number;
}

export interface SearchResult {
	ticker: string;
	name: string;
	type: string;
	exchange: string;
	score?: number;
}

export interface TrendingResult {
	ticker: string;
	name?: string;
}

export class YahooFinanceProvider implements IDataProvider {
	private client: any;

	constructor() {
		this.client = new (yahooFinance as any)();
	}

	async fetchChart(ticker: string, options: any): Promise<UnifiedCandle[]> {
		// Sanitize options: remove 'exchange' as it causes InvalidOptionsError in yahoo-finance2
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { exchange, ...yahooOptions } = options;

		try {
			const result = await this.client.chart(ticker, yahooOptions);
			if (!result || !result.quotes) return [];

			return result.quotes
				.map((q: any) => ({
					timestamp: new Date(q.date),
					open: q.open ?? 0,
					high: q.high ?? 0,
					low: q.low ?? 0,
					close: q.close ?? 0,
					volume: q.volume || 0,
				}))
				.filter((c: UnifiedCandle) => c.open !== null && c.close !== null);
		} catch (e) {
			console.warn(`Chart fetch failed for ${ticker}:`, (e as Error).message);
			return [];
		}
	}

	async fetchQuoteSummary(ticker: string, modules: string[]): Promise<any> {
		return await this.client.quoteSummary(ticker, { modules });
	}

	async fetchQuotes(tickers: string[]): Promise<QuoteResult[]> {
		const results: QuoteResult[] = [];

		for (const ticker of tickers) {
			try {
				const quote: any = await this.client.quote(ticker);
				if (quote) {
					results.push({
						ticker: quote.symbol,
						name: quote.shortName || quote.longName || ticker,
						price: quote.regularMarketPrice || 0,
						previousClose: quote.regularMarketPreviousClose || 0,
						change: quote.regularMarketChange || 0,
						changePercent: quote.regularMarketChangePercent || 0,
						volume: quote.regularMarketVolume || 0,
						marketCap: quote.marketCap,
						high52Week: quote.fiftyTwoWeekHigh,
						low52Week: quote.fiftyTwoWeekLow,
						updatedAt: new Date(),
						currency: quote.currency,
						marketState: quote.marketState,
						preMarketPrice: quote.preMarketPrice,
						preMarketChange: quote.preMarketChange,
						preMarketChangePercent: quote.preMarketChangePercent,
						postMarketPrice: quote.postMarketPrice,
						postMarketChange: quote.postMarketChange,
						postMarketChangePercent: quote.postMarketChangePercent,
					});
				}
			} catch (e) {
				console.warn(`Quote fetch failed for ${ticker}:`, (e as Error).message);
			}
		}

		return results;
	}

	async search(query: string, limit = 10): Promise<SearchResult[]> {
		try {
			const result: any = await this.client.search(query, {
				newsCount: 0,
				quotesCount: limit,
			});

			return (result.quotes || [])
				.filter((q: any) => q?.symbol)
				.map((q: any) => ({
					ticker: q.symbol,
					name: q.shortname || q.longname || q.symbol,
					type: q.quoteType || "EQUITY",
					exchange: q.exchange || "",
					score: q.score,
				}));
		} catch (e) {
			console.error("Search failed:", (e as Error).message);
			return [];
		}
	}

	async fetchTrending(region = "US", count = 10): Promise<TrendingResult[]> {
		try {
			const result: any = await this.client.trendingSymbols(region, { count });

			return (result.quotes || []).map((q: any) => ({
				ticker: q.symbol,
				name: q.shortName || q.longName,
			}));
		} catch (e) {
			console.error("Trending fetch failed:", (e as Error).message);
			return [];
		}
	}

	async fetchRecommendations(ticker: string): Promise<string[]> {
		try {
			const result: any = await this.client.recommendationsBySymbol(ticker);
			return (result.recommendedSymbols || []).map((r: any) => r.symbol);
		} catch (e) {
			console.error(`Recommendations fetch failed for ${ticker}:`, (e as Error).message);
			return [];
		}
	}

	async fetchDailyGainers(count = 10): Promise<QuoteResult[]> {
		try {
			const result: any = await this.client.screener({ scrIds: "day_gainers", count, region: "US", lang: "en-US" });
			return this.mapQuotes(result.quotes || []);
		} catch (e) {
			console.error("Daily Gainers fetch failed:", (e as Error).message);
			return [];
		}
	}

	async fetchDailyLosers(count = 10): Promise<QuoteResult[]> {
		try {
			const result: any = await this.client.screener({ scrIds: "day_losers", count, region: "US", lang: "en-US" });
			return this.mapQuotes(result.quotes || []);
		} catch (e) {
			console.error("Daily Losers fetch failed:", (e as Error).message);
			return [];
		}
	}

	private mapQuotes(quotes: any[]): QuoteResult[] {
		return quotes
			.filter((q: any) => q?.symbol)
			.map((quote: any) => ({
				ticker: quote.symbol,
				name: quote.shortName || quote.longName || quote.symbol,
				price: quote.regularMarketPrice || 0,
				previousClose: quote.regularMarketPreviousClose || 0,
				change: quote.regularMarketChange || 0,
				changePercent: quote.regularMarketChangePercent || 0,
				volume: quote.regularMarketVolume || 0,
				marketCap: quote.marketCap,
				high52Week: quote.fiftyTwoWeekHigh,
				low52Week: quote.fiftyTwoWeekLow,
				updatedAt: new Date(),
				currency: quote.currency,
				marketState: quote.marketState,
				preMarketPrice: quote.preMarketPrice,
				preMarketChange: quote.preMarketChange,
				preMarketChangePercent: quote.preMarketChangePercent,
				postMarketPrice: quote.postMarketPrice,
				postMarketChange: quote.postMarketChange,
				postMarketChangePercent: quote.postMarketChangePercent,
			}));
	}

	getName(): string {
		return "yahoo-finance";
	}
}
