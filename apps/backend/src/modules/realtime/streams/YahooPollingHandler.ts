import { Logger } from "../../../utils/logger";
import type { Broadcaster } from "../broadcasting/Broadcaster";
import type { QuoteUpdate } from "../realtime.types";

const logger = new Logger("YahooPollingHandler");

export class YahooPollingHandler {
	private pollingInterval: ReturnType<typeof setInterval> | null = null;
	private stocksToPoll = new Set<string>();
	private readonly POLL_INTERVAL_MS = 5000;

	constructor(private broadcaster: Broadcaster) {}

	addSymbol(symbol: string) {
		logger.info(`Adding Yahoo stock to poll: ${symbol}`);
		this.stocksToPoll.add(symbol);
		if (!this.pollingInterval) {
			this.startPolling();
		}
	}

	removeSymbol(symbol: string) {
		this.stocksToPoll.delete(symbol);
		// If empty, we could stop polling, but maybe keep it running if expected to re-add?
		// Let's stop if empty to save resources.
		if (this.stocksToPoll.size === 0 && this.pollingInterval) {
			clearInterval(this.pollingInterval);
			this.pollingInterval = null;
		}
	}

	private startPolling() {
		logger.info("Starting Yahoo stock polling service (every 5s)");

		this.pollingInterval = setInterval(async () => {
			if (this.stocksToPoll.size === 0) return;

			const tickers = Array.from(this.stocksToPoll);

			try {
				// Dynamic import to avoid circular dependency if any (though market.service is separate)
				const { marketService } = await import("../../market/market.service");
				const quotes = (await marketService.getQuotes(tickers, "1d", "YAHOO")) as any[];

				for (const quote of quotes) {
					const update: QuoteUpdate = {
						symbol: quote.ticker,
						price: quote.price,
						change: quote.change || 0,
						changePercent: quote.changePercent || 0,
						volume: quote.volume,
						timestamp: Date.now(),
					};
					this.broadcaster.broadcastQuote(quote.ticker, update);
				}
			} catch (e) {
				logger.error("Yahoo polling failed", e);
			}
		}, this.POLL_INTERVAL_MS);
	}

	shutdown() {
		if (this.pollingInterval) {
			clearInterval(this.pollingInterval);
		}
	}
}
