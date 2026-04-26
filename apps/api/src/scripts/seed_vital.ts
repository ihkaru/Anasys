import { db } from "../db";
import { symbols } from "@packages/db/src/schema";
import { eq } from "drizzle-orm";
import { Logger } from "../utils/logger";

const logger = new Logger("SeedVital");

const INDICES = [
  { ticker: '^GSPC', name: 'S&P 500', exchange: 'SNP', type: 'STOCK' },
  { ticker: '^DJI', name: 'Dow Jones Industrial Average', exchange: 'DJI', type: 'STOCK' },
  { ticker: '^IXIC', name: 'NASDAQ Composite', exchange: 'NAS', type: 'STOCK' },
  { ticker: '^FTSE', name: 'FTSE 100', exchange: 'LSE', type: 'STOCK' },
  { ticker: '^JKSE', name: 'Jakarta Composite Index', exchange: 'JKT', type: 'STOCK' },
  { ticker: 'GC=F', name: 'Gold Futures', exchange: 'CMX', type: 'STOCK' },
  { ticker: 'BTC-USD', name: 'Bitcoin USD', exchange: 'CCC', type: 'CRYPTO' }
];

async function seed() {
  logger.info('🌱 Seeding vital market indices...');
  for (const idx of INDICES) {
    const existing = await db.select().from(symbols).where(eq(symbols.ticker, idx.ticker)).limit(1);
    if (existing.length === 0) {
      await db.insert(symbols).values({ 
        ticker: idx.ticker,
        name: idx.name,
        exchange: idx.exchange,
        type: idx.type as any,
        provider: 'yahoo',
        isActive: true
      }).execute();
      logger.info(`✅ Added: ${idx.ticker}`);
    } else {
      logger.info(`⏭️  Skipping (exists): ${idx.ticker}`);
    }
  }
  process.exit(0);
}

seed().catch(err => {
  logger.error('Fatal:', err);
  process.exit(1);
});
