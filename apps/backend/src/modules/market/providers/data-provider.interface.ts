
export interface UnifiedCandle {
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface IDataProvider {
    fetchChart(ticker: string, options: any): Promise<UnifiedCandle[]>;
    fetchQuoteSummary(ticker: string, modules: string[]): Promise<any>;
    getName(): string;
}

