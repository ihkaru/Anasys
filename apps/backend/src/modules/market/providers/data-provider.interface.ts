export interface UnifiedCandle {
	timestamp: Date;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface IDataProvider {
	fetchChart(ticker: string, options: unknown): Promise<UnifiedCandle[]>;
	fetchQuoteSummary(ticker: string, modules: string[]): Promise<unknown>;
	getName(): string;
}
