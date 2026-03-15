import { db } from "./apps/backend/src/db";
import { SymbolRepository } from "./apps/backend/src/modules/market/repositories/symbol.repository";
import { MarketDataRepository } from "./apps/backend/src/modules/market/repositories/market-data.repository";
import { SymbolService } from "./apps/backend/src/modules/market/services/symbol.service";
import { SyncService } from "./apps/backend/src/modules/market/services/sync.service";
import { YahooFinanceProvider } from "./apps/backend/src/modules/market/providers/yahoo-finance.provider";
import { DataProviderFactory } from "./apps/backend/src/modules/market/providers/provider.factory";
import { Logger } from "./apps/backend/src/utils/logger";
import { CandleService } from "./apps/backend/src/modules/market/services/candle.service";

const logger = new Logger("TestSync");
const symbolRepo = new SymbolRepository(db);
const dataRepo = new MarketDataRepository(db);
const providerFactory = new DataProviderFactory();
const symbolService = new SymbolService(symbolRepo, new YahooFinanceProvider(), logger);
const syncService = new SyncService(symbolService, dataRepo, providerFactory, logger);
const candleService = new CandleService(symbolService, syncService, dataRepo, logger);

async function test() {
    console.log("Testing BBCA.JK 1d sync...");
    try {
        const result = await syncService.syncSymbolData("BBCA.JK", "STOCK", "1d");
        console.log("Sync Result:", result);

        const ohlcv = await candleService.getOHLCV("BBCA.JK", "1d", 10);
        console.log(`Returned ${ohlcv.length} candles from getOHLCV`);
        
    } catch (e) {
        console.error("Test failed", e);
    }
    process.exit(0);
}

test();
