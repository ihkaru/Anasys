import ccxt from "ccxt";
import type { IDataProvider, UnifiedCandle, UnifiedQuote } from "./data-provider.interface";

export class CcxtProvider implements IDataProvider {
	private binance: ccxt.binance;

	constructor() {
		this.binance = new ccxt.binance({
			enableRateLimit: true,
		});
	}

	async fetchChart(symbol: string, interval: string, startTime?: number, endTime?: number): Promise<UnifiedCandle[]> {
		// Convert symbol from BINANCE:BTCUSDT to BTC/USDT or BTC-USD to BTC/USD
		const ccxtSymbol = this.normalizeSymbol(symbol);
		const ccxtInterval = this.normalizeInterval(interval);

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

	async fetchQuote(symbol: string): Promise<UnifiedQuote | null> {
		const ccxtSymbol = this.normalizeSymbol(symbol);
		try {
			const ticker = await this.binance.fetchTicker(ccxtSymbol);
			return {
				symbol: symbol,
				price: ticker.last || 0,
				change: ticker.change || 0,
				changePercent: ticker.percentage || 0,
				volume: ticker.baseVolume || 0,
				timestamp: new Date(ticker.timestamp || Date.now()),
			};
		} catch (error) {
			console.error(`CCXT fetchQuote failed for ${symbol}:`, error);
			return null;
		}
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
