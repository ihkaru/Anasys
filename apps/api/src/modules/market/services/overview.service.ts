import type { Logger } from "../../../utils/logger";
import { questDbService } from "./QuestDBService";
import type { SymbolRepository } from "../repositories/symbol.repository";

export class OverviewService {
	constructor(
		private symbolRepo: SymbolRepository,
		private logger: Logger,
	) {}

	async getMarketOverview(tickers: string[]) {
		this.logger.debug(`Getting market overview for: ${tickers.join(", ")}`);

		if (!tickers.length) return [];

		try {
			const syms = await this.symbolRepo.findByTickers(tickers);
			if (!syms.length) return [];

			const symbolIds = syms.map((s) => s.id);

			// We will query QuestDB in parallel for these symbols
			const candlesBySymbol = new Map<number, any[]>();
			
			await Promise.all(
				syms.map(async (sym) => {
					// We only need the latest 2 candles per ticker
					const candles = await questDbService.getCandles(sym.ticker, "1d", sym.provider || "YAHOO", 2);
					// getCandles returns ASC, so we reverse it to DESC (latest first) for overview calculation
					candlesBySymbol.set(sym.id, candles.reverse());
				})
			);

			const overview = [];
			for (const sym of syms) {
				const candles = candlesBySymbol.get(sym.id) || [];

				if (candles.length > 0) {
					const latest = candles[0];
					const previous = candles[1] || latest;
					const currentPrice = Number(latest.close);
					const prevPrice = Number(previous.close);

					const changePercent = prevPrice ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

					overview.push({
						ticker: sym.ticker,
						name: sym.name || sym.ticker,
						price: currentPrice,
						changePercent: parseFloat(changePercent.toFixed(2)),
						updatedAt: new Date(latest.timestamp),
					});
				}
			}
			return overview;
		} catch (e) {
			this.logger.error(`Failed to get market overview`, e);
			return [];
		}
	}
}
