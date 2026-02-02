import type { Logger } from "../../../utils/logger";
import type { MarketDataRepository } from "../repositories/market-data.repository";
import type { SymbolRepository } from "../repositories/symbol.repository";

export class OverviewService {
	constructor(
		private symbolRepo: SymbolRepository,
		private marketDataRepo: MarketDataRepository,
		private logger: Logger,
	) {}

	async getMarketOverview(tickers: string[]) {
		this.logger.debug(`Getting market overview for: ${tickers.join(", ")}`);

		if (!tickers.length) return [];

		try {
			const syms = await this.symbolRepo.findByTickers(tickers);
			if (!syms.length) return [];

			const symbolIds = syms.map((s) => s.id);

			// Get latest 2 candles for these symbols using repo
			// We need a specific method in repo or use generic one.
			// Let's assume repo has getLatestCandles that uses window function as defined before
			const rows = await this.marketDataRepo.getLatestCandles(symbolIds, "1d", 2);

			const candlesBySymbol = new Map<number, any[]>();
			for (const row of rows) {
				const sid = row.symbol_id as number;
				if (!candlesBySymbol.has(sid)) candlesBySymbol.set(sid, []);
				candlesBySymbol.get(sid)?.push(row);
			}

			const overview = [];
			for (const sym of syms) {
				const candles = candlesBySymbol.get(sym.id) || [];
				candles.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

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
