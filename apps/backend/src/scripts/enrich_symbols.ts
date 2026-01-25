/**
 * Enrich Symbols Script
 * Fetches company metadata from Yahoo Finance (quoteSummary) and updates the database.
 * 
 * Usage: bun run src/scripts/enrich_symbols.ts [--batch=50] [--delay=1000]
 */

import { symbols } from "@packages/db/src/schema";
import { eq, isNull, or } from "drizzle-orm";
import yahooFinance from "yahoo-finance2";
import { db } from "../db";
import { Logger } from "../utils/logger";

const logger = new Logger('EnrichSymbols');

interface EnrichmentResult {
  ticker: string;
  success: boolean;
  error?: string;
}

async function enrichSymbol(ticker: string): Promise<EnrichmentResult> {
  try {
    logger.debug(`Fetching metadata for ${ticker}...`);
    
    const result = await yahooFinance.quoteSummary(ticker, {
      modules: ['assetProfile', 'quoteType']
    });
    
    const profile = result.assetProfile;
    const quoteType = result.quoteType;
    
    // Extract relevant fields
    const updates: Record<string, any> = {
      metadataUpdatedAt: new Date(),
    };
    
    // Name from quoteType (more reliable)
    if (quoteType?.longName) {
      updates.name = quoteType.longName;
    } else if (quoteType?.shortName) {
      updates.name = quoteType.shortName;
    }
    
    // Profile data
    if (profile) {
      if (profile.longBusinessSummary) {
        updates.description = profile.longBusinessSummary;
      }
      if (profile.sector) {
        updates.sector = profile.sector;
      }
      if (profile.industry) {
        updates.industry = profile.industry;
      }
      if (profile.website) {
        updates.website = profile.website;
      }
      if (profile.country) {
        updates.country = profile.country;
      }
    }
    
    // Update DB
    await db.update(symbols)
      .set(updates)
      .where(eq(symbols.ticker, ticker))
      .execute();
    
    logger.info(`✓ Enriched ${ticker}: ${updates.name || 'N/A'} | ${updates.sector || 'N/A'}`);
    return { ticker, success: true };
    
  } catch (error: any) {
    // Handle rate limiting
    if (error?.message?.includes('Too Many Requests') || error?.response?.status === 429) {
      logger.warn(`Rate limited on ${ticker}. Will retry later.`);
      return { ticker, success: false, error: 'rate_limited' };
    }
    
    // Some tickers won't have profile data (e.g., some ETFs, crypto)
    logger.warn(`Could not enrich ${ticker}: ${error?.message || 'Unknown error'}`);
    
    // Mark as attempted even if failed
    await db.update(symbols)
      .set({ metadataUpdatedAt: new Date() })
      .where(eq(symbols.ticker, ticker))
      .execute();
    
    return { ticker, success: false, error: error?.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let batchSize = 50;
  let delayMs = 1500; // 1.5 second delay between requests to avoid rate limiting
  
  for (const arg of args) {
    if (arg.startsWith('--batch=')) {
      batchSize = parseInt(arg.split('=')[1], 10);
    }
    if (arg.startsWith('--delay=')) {
      delayMs = parseInt(arg.split('=')[1], 10);
    }
  }
  
  logger.info(`Starting symbol enrichment (batch=${batchSize}, delay=${delayMs}ms)`);
  
  // Get symbols that haven't been enriched yet
  const pendingSymbols = await db.select()
    .from(symbols)
    .where(
      or(
        isNull(symbols.metadataUpdatedAt),
        isNull(symbols.name)
      )
    )
    .limit(batchSize);
  
  logger.info(`Found ${pendingSymbols.length} symbols to enrich`);
  
  if (pendingSymbols.length === 0) {
    logger.info('All symbols are already enriched!');
    return;
  }
  
  let successCount = 0;
  let failCount = 0;
  let rateLimited = false;
  
  for (const symbol of pendingSymbols) {
    if (rateLimited) {
      logger.warn('Stopping due to rate limiting. Run again later.');
      break;
    }
    
    const result = await enrichSymbol(symbol.ticker);
    
    if (result.success) {
      successCount++;
    } else {
      failCount++;
      if (result.error === 'rate_limited') {
        rateLimited = true;
      }
    }
    
    // Delay between requests
    if (!rateLimited) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  logger.info('='.repeat(50));
  logger.info(`Enrichment complete: ${successCount} success, ${failCount} failed`);
  logger.info(`Remaining: ${pendingSymbols.length - successCount - (rateLimited ? 1 : 0)} to process`);
}

main()
  .then(() => {
    logger.info('Done.');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('Fatal error', err);
    process.exit(1);
  });
