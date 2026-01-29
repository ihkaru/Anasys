
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { analystRatings, symbolEarnings, symbolFinancials, symbols } from '../../../packages/db/src/schema'; // Corrected path
import { db } from '../src/db';
import { YahooFinanceProvider } from '../src/modules/market/providers/yahoo-finance.provider';
import { FinancialsService } from '../src/modules/market/services/financials.service';

// Mock Provider to control returned data
class MockYahooProvider extends YahooFinanceProvider {
    async fetchQuoteSummary(ticker: string, modules: string[]) {
        console.log(`[MockProvider] Fetching data for ${ticker}`);
        
        // Return dummy data for our test ticker
        return {
            summaryDetail: {
                trailingPE: { raw: 25.5 },
                dividendYield: { raw: 0.05 }
            },
            financialData: {
                totalRevenue: { raw: 1000000000 }, // 1B
                profitMargins: { raw: 0.20 },
                targetMeanPrice: { raw: 150.00 }
            },
            defaultKeyStatistics: {
                sharesOutstanding: { raw: 5000000 }
            },
            earnings: {
                financialsChart: {
                    quarterly: [
                        { date: '4Q2024', revenue: { raw: 250000000 }, earnings: { raw: 50000000 } }
                    ]
                }
            },
            recommendationTrend: {
                trend: [
                    { period: '0m', strongBuy: 10, buy: 5, hold: 2, sell: 0, strongSell: 0 }
                ]
            },
            calendarEvents: {
                earnings: { earningsDate: [new Date('2026-04-15').toISOString()] }
            }
        };
    }
}

describe('Financials Service Persistence', () => {
    const TEST_TICKER = `TEST-FIN-${Date.now()}`;
    let mockProvider: MockYahooProvider;
    let service: FinancialsService;

    beforeAll(async () => {
        // Setup Service with Mock Provider
        mockProvider = new MockYahooProvider();
        service = new FinancialsService(mockProvider); // Inject mock
        
        // Insert Test Symbol into DB (Requirement for FK)
        console.log(`[Test] Creating symbol ${TEST_TICKER}...`);
        await db.insert(symbols).values({
            ticker: TEST_TICKER,
            name: 'Test Financials Corp',
            type: 'STOCK',
            exchange: 'NYSE',
            updatedAt: new Date()
        });
    });

    afterAll(async () => {
        // Cleanup
        console.log('[Test] Cleaning up...');
        await db.delete(symbolFinancials).where(eq(symbolFinancials.symbolId, 
            db.select({ id: symbols.id }).from(symbols).where(eq(symbols.ticker, TEST_TICKER))
        ));
        await db.delete(symbolEarnings).where(eq(symbolEarnings.symbolId, 
            db.select({ id: symbols.id }).from(symbols).where(eq(symbols.ticker, TEST_TICKER))
        ));
        await db.delete(analystRatings).where(eq(analystRatings.symbolId, 
            db.select({ id: symbols.id }).from(symbols).where(eq(symbols.ticker, TEST_TICKER))
        ));
        await db.delete(symbols).where(eq(symbols.ticker, TEST_TICKER));
    });

    it('should fetch from provider and PERSIST to database for new ticker', async () => {
        // 1. Call Service (this should trigger fetchAndStore)
        console.log('[Test] Calling getFinancials...');
        const financials = await service.getFinancials(TEST_TICKER);
        
        // 2. Verify Service Return
        expect(financials).toBeDefined();
        expect(financials?.totalRevenue).toBe(1000000000);
        expect(financials?.trailingPE).toBe(25.5);

        // 3. VERIFY DATABASE PERSISTENCE DIRECTLY
        console.log('[Test] Verifying Database Records...');
        
        const symbol = await db.query.symbols.findFirst({
            where: eq(symbols.ticker, TEST_TICKER)
        });
        expect(symbol).toBeDefined();

        const dbFinancials = await db.query.symbolFinancials.findFirst({
            where: eq(symbolFinancials.symbolId, symbol!.id)
        });

        // Assertions on DB Data
        expect(dbFinancials).toBeDefined();
        expect(Number(dbFinancials?.totalRevenue)).toBe(1000000000); // BigInt/Number handling
        expect(dbFinancials?.trailingPE).toBe(25.5);
        
        console.log('[Test] Financials verified in DB ✅');
    });

    it('should persist Earnings data correctly', async () => {
        const earnings = await service.getEarnings(TEST_TICKER);
        
        expect(earnings).toBeDefined();
        
        const symbol = await db.query.symbols.findFirst({
            where: eq(symbols.ticker, TEST_TICKER)
        });

        const dbEarnings = await db.query.symbolEarnings.findFirst({
            where: eq(symbolEarnings.symbolId, symbol!.id)
        });

        expect(dbEarnings).toBeDefined();
        // Check if JSON persisted
        const history = JSON.parse(dbEarnings?.revenueHistory as string);
        expect(history.length).toBeGreaterThan(0);
        expect(history[0].revenue).toBe(250000000);
        
        console.log('[Test] Earnings verified in DB ✅');
    });
});
