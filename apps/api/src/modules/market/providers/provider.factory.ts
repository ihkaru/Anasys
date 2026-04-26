import type { IDataProvider } from "./data-provider.interface";
import { TradingViewPythonProvider } from "./tradingview-python.provider"; // Make sure to export this class in its file
import { YahooFinanceProvider } from "./yahoo-finance.provider";

export class DataProviderFactory {
	private providers: Map<string, IDataProvider> = new Map();

	constructor() {
		// Initialize providers
		const yahoo = new YahooFinanceProvider();
		const tv = new TradingViewPythonProvider();

		this.providers.set("YAHOO", yahoo);
		this.providers.set("TRADINGVIEW", tv);
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
