import type { IDataProvider } from "./data-provider.interface";
import { TradingViewRustProvider } from "./tradingview-rust.provider";
import { CcxtProvider } from "./ccxt.provider";
import { YahooFinanceProvider } from "./yahoo-finance.provider";

export class DataProviderFactory {
	private providers: Map<string, IDataProvider> = new Map();

	constructor() {
		// Initialize providers
		const yahoo = new YahooFinanceProvider();
		const tvRust = new TradingViewRustProvider();
		const ccxt = new CcxtProvider();

		this.providers.set("YAHOO", yahoo);
		this.providers.set("TRADINGVIEW", tvRust);
		this.providers.set("TRADINGVIEW_RUST", tvRust);
		this.providers.set("TRADINGVIEW_PW", tvRust);
		this.providers.set("TRADINGVIEW_SOCKET", tvRust);
		this.providers.set("CCXT", ccxt);
	}

	public getProvider(source: string): IDataProvider {
		const provider = this.providers.get(source.toUpperCase());
		if (!provider) {
			throw new Error(`Provider for source '${source}' not found.`);
		}
		return provider;
	}
}
