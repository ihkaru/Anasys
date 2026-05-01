export interface UnifiedCandle {
	timestamp: Date;
	open: number;
	high: number;
	low: number;
	close: number;
	adjClose?: number;
	volume: number;
}

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
	source: "YAHOO" | "TRADINGVIEW" | "CCXT"; // Explicit source
	exchange?: string; // Explicit exchange
}

export interface SearchResult {
	ticker: string;
	name: string;
	type: string;
	exchange: string;
	source: "YAHOO" | "TRADINGVIEW" | "CCXT";
	currency?: string;
	score?: number;
	fullSymbol?: string; // e.g. "NASDAQ:AAPL"
}

export interface TrendingResult {
	ticker: string;
	name?: string;
}

export interface IDataProvider {
	fetchChart(ticker: string, options: unknown): Promise<UnifiedCandle[]>;
	fetchQuoteSummary(ticker: string, modules: string[]): Promise<unknown>;
	fetchQuotes(tickers: string[]): Promise<QuoteResult[]>;
	search(query: string, limit?: number): Promise<SearchResult[]>;
	fetchTrending(region?: string, count?: number): Promise<TrendingResult[]>;
	fetchRecommendations(ticker: string): Promise<string[]>;
	fetchDailyGainers(count?: number): Promise<QuoteResult[]>;
	fetchDailyLosers(count?: number): Promise<QuoteResult[]>;
	getName(): string;
}
