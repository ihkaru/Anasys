import { Logger } from "../../../utils/logger";
import type { BinanceStreamHandler } from "../streams/BinanceStreamHandler";
import type { TradingViewStreamHandler } from "../streams/TradingViewStreamHandler";
import type { YahooPollingHandler } from "../streams/YahooPollingHandler";
import { isCryptoSymbol } from "../utils/symbolUtils";

const logger = new Logger("UpstreamRouter");

export class UpstreamRouter {
	constructor(
		private binanceHandler: BinanceStreamHandler,
		private yahooHandler: YahooPollingHandler,
		private tradingViewHandler: TradingViewStreamHandler,
	) {}

	ensureUpstreamConnection(symbol: string, channel: string, interval: string, source: string) {
		const isCrypto = isCryptoSymbol(symbol);
		// logger.debug(`ensureUpstreamConnection: ${symbol} -> isCrypto=${isCrypto}, source=${source}`);

		if (isCrypto) {
			this.binanceHandler.ensureConnection(symbol, channel, interval);
		} else {
			if (source === "TRADINGVIEW") {
				this.tradingViewHandler.addSymbol(symbol);
			} else {
				this.yahooHandler.addSymbol(symbol);
			}
		}
	}

	handleUnsubscribe(symbol: string) {
		if (isCryptoSymbol(symbol)) {
			// Binance unsub logic if implemented (currently kept open)
		} else {
			this.yahooHandler.removeSymbol(symbol);
			this.tradingViewHandler.removeSymbol(symbol);
		}
	}

	shutdown() {
		this.binanceHandler.shutdown();
		this.yahooHandler.shutdown();
		this.tradingViewHandler.shutdown();
	}
}
