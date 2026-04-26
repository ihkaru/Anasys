import { db } from "../db";
import { symbols } from "@packages/db/src/schema";
import { Logger } from "../utils/logger";
import { marketService } from "../modules/market/market.service";
import { playwrightManager } from "../utils/playwright-manager";

const logger = new Logger("TVMultiHarvester");

async function main() {
  logger.info("🚀 Starting TradingView Multi-Timeframe Harvester...");
  
  // 1. Get all symbols from DB
  const allSymbols = await db.select().from(symbols);
  logger.info(`📋 Target symbols: ${allSymbols.length}`);

  const intervals = ["1m", "5m", "15m", "1h"];
  
  let syncedCount = 0;
  const startTime = Date.now();

  while (true) {
    for (const symbol of allSymbols) {
      syncedCount++;
      for (const interval of intervals) {
        try {
          // Use the smart source selection via marketService
          await marketService.syncSymbolData(
            symbol.ticker, 
            symbol.type as "STOCK" | "CRYPTO", 
            interval,
            undefined,
            "TRADINGVIEW_PW"
          );
          
          await new Promise(r => setTimeout(r, 1000)); // Rate limit
        } catch (err: any) {
          logger.error(`❌ Failed ${symbol.ticker} (${interval}): ${err.message}`);
          if (err.message.includes("timeout") || err.message.includes("closed")) {
            logger.warn("🔄 Restarting Playwright Browser...");
            await playwrightManager.cleanup();
            await new Promise(r => setTimeout(r, 5000));
          }
        }
      }

      if (syncedCount % 50 === 0) {
        const elapsed = (Date.now() - startTime) / 1000 / 60; // minutes
        const progress = (syncedCount / allSymbols.length) * 100;
        logger.info(`📊 Progress: ${progress.toFixed(2)}% (${syncedCount}/${allSymbols.length}) | Elapsed: ${elapsed.toFixed(1)}m`);
      }
    }
    
    logger.info("✅ Full sweep completed. Resting for 30 minutes...");
    await new Promise(r => setTimeout(r, 30 * 60 * 1000));
  }
}

main().catch(err => {
  logger.error("💀 Fatal Harvester Error:", err);
  process.exit(1);
});
