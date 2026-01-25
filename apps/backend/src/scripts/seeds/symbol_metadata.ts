/**
 * Seed Symbol Metadata
 * Updates symbols table with metadata from CSV file.
 * 
 * Usage: bun run src/scripts/seeds/symbol_metadata.ts
 */

import { symbols } from "@packages/db/src/schema";
import { parse } from "csv-parse/sync";
import { eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";
import { db } from "../../db";
import { Logger } from "../../utils/logger";

const logger = new Logger('SymbolMetadataSeed');

interface SymbolMetadataRow {
  ticker: string;
  name: string;
  type: 'STOCK' | 'CRYPTO';
  sector: string;
  industry: string;
  country: string;
  website: string;
  description: string;
}

async function main() {
  logger.info('Starting symbol metadata seed...');
  
  const csvPath = join(__dirname, 'data', 'symbol_metadata.csv');
  const csvContent = readFileSync(csvPath, 'utf-8');
  
  const records: SymbolMetadataRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  
  logger.info(`Parsed ${records.length} symbols from CSV`);
  
  let updated = 0;
  let inserted = 0;
  let skipped = 0;
  
  for (const row of records) {
    try {
      // Check if symbol exists
      const [existing] = await db.select()
        .from(symbols)
        .where(eq(symbols.ticker, row.ticker))
        .limit(1);
      
      const updateData = {
        name: row.name || null,
        description: row.description || null,
        sector: row.sector || null,
        industry: row.industry || null,
        country: row.country || null,
        website: row.website || null,
        metadataUpdatedAt: new Date(),
      };
      
      if (existing) {
        // Update existing symbol
        await db.update(symbols)
          .set(updateData)
          .where(eq(symbols.id, existing.id))
          .execute();
        updated++;
        logger.debug(`Updated: ${row.ticker}`);
      } else {
        // Insert new symbol
        await db.insert(symbols)
          .values({
            ticker: row.ticker,
            type: row.type,
            provider: 'yahoo',
            isActive: true,
            ...updateData,
          })
          .execute();
        inserted++;
        logger.debug(`Inserted: ${row.ticker}`);
      }
    } catch (error) {
      logger.error(`Failed to process ${row.ticker}:`, error);
      skipped++;
    }
  }
  
  logger.info('='.repeat(50));
  logger.info(`Metadata seed complete:`);
  logger.info(`  Updated: ${updated}`);
  logger.info(`  Inserted: ${inserted}`);
  logger.info(`  Skipped: ${skipped}`);
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
