import yahooFinance from "yahoo-finance2";
import type {
	IDataProvider,
	QuoteResult,
	SearchResult,
	TrendingResult,
	UnifiedCandle,
} from "./data-provider.interface";

export class YahooFinanceProvider implements IDataProvider {
	private client: any;

	constructor() {
		this.client = new (yahooFinance as any)();
	}

	private async withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
		return Promise.race([
			promise,
			new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
		]);
	}

	async fetchChart(ticker: string, options: any): Promise<UnifiedCandle[]> {
		// Sanitize options: remove fields not supported by yahoo-finance2 chart API
		// Explicitly whitelist valid Yahoo options (ADR-0023)
		const yahooOptions: any = {};
		const validKeys = ["period1", "period2", "interval", "includePrePost", "events"];
		for (const key of validKeys) {
			if (options[key] !== undefined) {
				yahooOptions[key] = options[key];
			}
		}

		try {
			const result = (await this.withTimeout(this.client.chart(ticker, yahooOptions))) as any;
			if (!result || !result.quotes) return [];

			return result.quotes
				.filter((q: any) => {
					// Skip candles with null/undefined OHLC — don't default to 0
					if (q.open == null || q.high == null || q.low == null || q.close == null) {
						return false;
					}
					return true;
				})
				.map((q: any) => ({
					timestamp: new Date(q.date),
					open: q.open,
					high: q.high,
					low: q.low,
					close: q.close,
					adjClose: q.adjclose,
					volume: q.volume || 0,
				}));
		} catch (e) {
			console.warn(`Chart fetch failed for ${ticker}:`, (e as Error).message);
			return [];
		}
	}

	async fetchQuoteSummary(ticker: string, modules: string[]): Promise<any> {
		return await this.client.quoteSummary(ticker, { modules });
	}

	async fetchQuotes(tickers: string[]): Promise<QuoteResult[]> {
		const promises = tickers.map(async (ticker) => {
			try {
				const quote: any = await this.withTimeout(this.client.quote(ticker), 5000); // 5s for single quote
				if (quote) {
					return {
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
						source: "YAHOO",
						exchange: quote.exchange,
					} as QuoteResult;
				}
			} catch (e) {
				console.warn(`Quote fetch failed for ${ticker}:`, (e as Error).message);
			}
			return null;
		});

		const results = await Promise.all(promises);
		return results.filter((r): r is QuoteResult => r !== null);
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
					source: "YAHOO",
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
				source: "YAHOO",
				exchange: quote.exchange,
			}));
	}

	getName(): string {
		return "yahoo-finance";
	}
}
