
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { MarketService } from "../../src/modules/market/market.service";

// MOCK 1: yahoo-finance2
const mockHistorical = mock(() => Promise.resolve([
    { date: new Date(), open: 100, high: 105, low: 95, close: 102, volume: 1000 }
]));

mock.module("yahoo-finance2", () => {
    return {
        default: class YahooFinanceMock {
            historical = mockHistorical;
        }
    };
});

// MOCK 2: Database (Partial Mock for Drizzle Chaining)
// We need to return specific structures for ensuring symbol and checking last entry
const mockDb = {
    select: mock(() => mockDb),
    from: mock(() => mockDb),
    where: mock(() => mockDb),
    orderBy: mock(() => mockDb),
    limit: mock(() => []), // Default return empty array
    insert: mock(() => mockDb),
    values: mock(() => mockDb),
    returning: mock(() => [{ id: 1, ticker: 'TEST' }]),
    onConflictDoNothing: mock(() => mockDb),
    execute: mock(() => Promise.resolve())
};

mock.module("../../src/db", () => ({
    db: mockDb
}));

describe("MarketService Logic", () => {
    let service: MarketService;

    beforeEach(() => {
        // Reset mocks
        mockHistorical.mockClear();
        // Re-import to ensure mocks are applied
        const { MarketService } = require("../../src/modules/market/market.service");
        service = new MarketService();
    });

    it("should call Yahoo Finance when no local data exists", async () => {
        // Setup DB mock to return:
        // 1. Symbol lookup: [] (not found) -> will trigger insert
        // 2. Insert result: [{id: 1}]
        // 3. Last entry lookup: [] (undefined) -> means fetch full history
        
        // We simulate chained calls. Since our simple mock returns `mockDb` for everything, 
        // we just need to ensure the final `.limit(1)` returns what we want.
        // But since we use the SAME mock object for all calls, we have to be careful.
        // For simplicity in this limited environment, we'll verify the CALLS were made.
        
        await service.syncSymbolData("TEST", "STOCK");
        
        expect(mockHistorical).toHaveBeenCalled();
        expect(mockHistorical).toHaveBeenCalledTimes(1);
    });

    it("should NOT call Yahoo Finance if data is up to date", async () => {
        // Simulate last entry is TODAY (or future)
        const today = new Date();
        
        // This is tricky with the simple chained mock. 
        // We'll rely on the logic that if `lastEntry` exists close to today, 
        // the service calculates `nextDay` > `today` and returns.
        
        // We override the limit impl for this test to return a recent date
        const originalLimit = mockDb.limit;
        mockDb.limit = mock(() => {
            // First call is usually symbol lookup, second is market data
            // But with our simple mock it's hard to distinguish. 
            // Let's just return a symbol AND a recent date to simulate "exists and fresh"
            // Wait, logic is: 
            // 1. ensureSymbol -> select...limit(1)
            // 2. select...limit(1) (last timestamp)
            
            // If we always return [ { id:1, ticker:'TEST', date: new Date() } ]
            // The first call (symbol) might choke on 'date' property but usually ignores extra props.
            // The second call (lastEntry) uses 'date'.
            return [{ id: 1, ticker: 'TEST', date: new Date() }];
        });

        await service.syncSymbolData("TEST_FRESH", "STOCK");

        expect(mockHistorical).not.toHaveBeenCalled();
        
        // Restore
        mockDb.limit = originalLimit;
    });
});
