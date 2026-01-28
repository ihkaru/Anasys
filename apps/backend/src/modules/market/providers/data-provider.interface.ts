
export interface IDataProvider {
    fetchChart(ticker: string, options: any): Promise<any>;
    fetchQuoteSummary(ticker: string, modules: string[]): Promise<any>;
    getName(): string;
}

