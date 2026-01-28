
import { Logger } from "../../../utils/logger";
import { IDataProvider } from "../providers/data-provider.interface";
import { SymbolRepository } from "../repositories/symbol.repository";

export class SymbolService {
    constructor(
        private symbolRepo: SymbolRepository,
        private dataProvider: IDataProvider,
        private logger: Logger
    ) {}

    async ensureSymbol(ticker: string, type: 'STOCK' | 'CRYPTO') {
        this.logger.debug(`Ensuring symbol exists: ${ticker} (${type})`);
        
        const existing = await this.symbolRepo.findByTicker(ticker);
        if (existing) return existing;

        const newSym = await this.symbolRepo.create({
            ticker,
            type,
            provider: 'yahoo',
            name: ticker
        });
        
        this.logger.info(`New symbol created: ${ticker}`);
        return newSym;
    }

    async getSymbols() {
        return await this.symbolRepo.findAll();
    }
    
    async getSymbolByTicker(ticker: string) {
        return await this.symbolRepo.findByTicker(ticker);
    }
    
    async enrichSymbol(ticker: string): Promise<any> {
        this.logger.info(`Enriching symbol metadata: ${ticker}`);
        
        try {
            const result = await this.dataProvider.fetchQuoteSummary(ticker, ['assetProfile', 'quoteType']);
            const profile = result.assetProfile;
            const quoteType = result.quoteType;
            
            const updates: Record<string, any> = {
                metadataUpdatedAt: new Date(),
            };
            
            if (quoteType?.longName) updates.name = quoteType.longName;
            else if (quoteType?.shortName) updates.name = quoteType.shortName;
            
            if (profile) {
                if (profile.longBusinessSummary) updates.description = profile.longBusinessSummary;
                if (profile.sector) updates.sector = profile.sector;
                if (profile.industry) updates.industry = profile.industry;
                if (profile.website) updates.website = profile.website;
                if (profile.country) updates.country = profile.country;
            }
            
            await this.symbolRepo.updateByTicker(ticker, updates);
            
            this.logger.info(`Enriched ${ticker}: ${updates.name || 'N/A'}`);
            return await this.symbolRepo.findByTicker(ticker);
            
        } catch (error: any) {
            this.logger.warn(`Could not enrich ${ticker}: ${error?.message}`);
            await this.symbolRepo.updateByTicker(ticker, { metadataUpdatedAt: new Date() });
            return await this.symbolRepo.findByTicker(ticker);
        }
    }
}
