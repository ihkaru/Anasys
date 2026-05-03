import * as ccxt from "ccxt";
import type {
	IDataProvider,
	QuoteResult,
	SearchResult,
	TrendingResult,
	UnifiedCandle,
} from "./data-provider.interface";

export class CcxtProvider implements IDataProvider {
	private binance: any;

	constructor() {
		this.binance = new ccxt.binance({
			enableRateLimit: true,
		});
	}

	async fetchChart(symbol: string, options: any): Promise<UnifiedCandle[]> {
		const startTime = options.startTime;
		// Convert symbol from BINANCE:BTCUSDT to BTC/USDT or BTC-USD to BTC/USD
		const ccxtSymbol = this.normalizeSymbol(symbol);
		const ccxtInterval = this.normalizeInterval(options.interval || "1d");

		try {
			const ohlcv = await this.binance.fetchOHLCV(ccxtSymbol, ccxtInterval, startTime, 1000);

			return ohlcv.map((candle: any) => ({
				timestamp: new Date(candle[0]),
				open: candle[1],
				high: candle[2],
				low: candle[3],
				close: candle[4],
				volume: candle[5],
			}));
		} catch (error) {
			console.error(`CCXT fetchChart failed for ${symbol}:`, error);
			return [];
		}
	}

	async fetchQuoteSummary(_ticker: string, _modules: string[]): Promise<unknown> {
		return null;
	}

	async fetchQuotes(tickers: string[]): Promise<QuoteResult[]> {
		const results: QuoteResult[] = [];
		for (const ticker of tickers) {
			const ccxtSymbol = this.normalizeSymbol(ticker);
			try {
				const tickerData = await this.binance.fetchTicker(ccxtSymbol);
				results.push({
					ticker: ticker,
					name: ticker,
					price: tickerData.last || 0,
					previousClose: tickerData.previousClose || tickerData.last || 0,
					change: tickerData.change || 0,
					changePercent: tickerData.percentage || 0,
					volume: tickerData.baseVolume || 0,
					updatedAt: new Date(tickerData.timestamp || Date.now()),
					source: "CCXT",
				});
			} catch (error) {
				console.error(`CCXT fetchQuote failed for ${ticker}:`, error);
			}
		}
		return results;
	}

	async search(_query: string, _limit?: number): Promise<SearchResult[]> {
		return [];
	}

	async fetchTrending(_region?: string, _count?: number): Promise<TrendingResult[]> {
		return [];
	}

	async fetchRecommendations(_ticker: string): Promise<string[]> {
		return [];
	}

	async fetchDailyGainers(_count?: number): Promise<QuoteResult[]> {
		return [];
	}

	async fetchDailyLosers(_count?: number): Promise<QuoteResult[]> {
		return [];
	}

	getName(): string {
		return "CCXT";
	}

	private normalizeSymbol(symbol: string): string {
		// BINANCE:BTCUSDT -> BTC/USDT
		if (symbol.includes(":")) {
			const parts = symbol.split(":");
			const ticker = parts[1];
			// Handle common pairs
			if (ticker.endsWith("USDT")) return ticker.replace("USDT", "/USDT");
			if (ticker.endsWith("USD")) return ticker.replace("USD", "/USD");
			if (ticker.endsWith("BTC")) return ticker.replace("BTC", "/BTC");
		}
		return symbol.replace("-", "/");
	}

	private normalizeInterval(interval: string): string {
		const map: Record<string, string> = {
			"1m": "1m",
			"5m": "5m",
			"15m": "15m",
			"1h": "1h",
			"1d": "1d",
			"1w": "1w",
		};
		return map[interval] || "1d";
	}
}
