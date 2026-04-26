import type { IDataProvider } from "./data-provider.interface";
import { TradingViewPlaywrightProvider } from "./tradingview-playwright.provider";
import { TradingViewPythonProvider } from "./tradingview-python.provider";
import { YahooFinanceProvider } from "./yahoo-finance.provider";

export class DataProviderFactory {
	private providers: Map<string, IDataProvider> = new Map();

	constructor() {
		// Initialize providers
		const yahoo = new YahooFinanceProvider();
		const tvPython = new TradingViewPythonProvider();
		const tvPlaywright = new TradingViewPlaywrightProvider();

		this.providers.set("YAHOO", yahoo);
		this.providers.set("TRADINGVIEW", tvPython);
		this.providers.set("TRADINGVIEW_PW", tvPlaywright);
		// CCXT can be added later
	}

	public getProvider(source: string): IDataProvider {
		const provider = this.providers.get(source.toUpperCase());
		if (!provider) {
			throw new Error(`Provider for source '${source}' not found.`);
		}
		return provider;
	}
}
