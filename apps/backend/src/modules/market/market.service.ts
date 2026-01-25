
import { marketData, symbols } from "@packages/db/src/schema";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import yahooFinance from "yahoo-finance2";
import { db } from "../../db";

const client = new (yahooFinance as any)();

import { Logger } from "../../utils/logger";

const logger = new Logger('MarketService');

export class MarketService {
    
    // Cache for top movers (1 hour)
    private moversCache: {
        data: any;
        expiresAt: number;
    } | null = null;

    // Ensure symbol exists in DB
    async ensureSymbol(ticker: string, type: 'STOCK' | 'CRYPTO') {
        logger.debug(`Ensuring symbol exists: ${ticker} (${type})`);
        // Normalize ticker if needed
        const [existing] = await db.select().from(symbols).where(eq(symbols.ticker, ticker)).limit(1);
        if (existing) return existing;
        
        const [newSym] = await db.insert(symbols).values({
            ticker,
            type,
            provider: 'yahoo', // Default to yahoo for MVP
            name: ticker,
            isActive: true
        }).returning();
        
        logger.info(`New symbol created: ${ticker}`);
        return newSym;
    }

    // LIST SYMBOLS
    async getSymbols() {
        return await db.select().from(symbols);
    }

    // MARKET OVERVIEW - Get latest price/change for key tickers

    async getMarketOverview(tickers: string[]) {
        logger.debug(`Getting market overview for: ${tickers.join(', ')}`);
        
        if (!tickers.length) return [];

        try {
            // 1. Get all symbols in one go
            const syms = await db.select().from(symbols).where(inArray(symbols.ticker, tickers));
            
            if (!syms.length) return [];
            
            const symbolMap = new Map(syms.map(s => [s.id, s]));
            const symbolIds = syms.map(s => s.id);
            
            // 2. Get latest 2 candles for these symbols using Window Function
            const query = sql`
                SELECT symbol_id, close, timestamp
                FROM (
                    SELECT 
                        symbol_id, 
                        close, 
                        timestamp,
                        ROW_NUMBER() OVER (PARTITION BY symbol_id ORDER BY timestamp DESC) as rn
                    FROM market_data
                    WHERE symbol_id IN ${symbolIds} AND interval = '1d'
                ) sub
                WHERE rn <= 2
            `;
            
            const rows = await db.execute(query);
            
            // Group candles by symbol
            const candlesBySymbol = new Map<number, any[]>();
            for (const row of rows) {
                const sid = row.symbol_id as number;
                if (!candlesBySymbol.has(sid)) candlesBySymbol.set(sid, []);
                candlesBySymbol.get(sid)?.push(row);
            }
            
            // 3. Construct result
            const overview = [];
            for (const sym of syms) {
                 const candles = candlesBySymbol.get(sym.id) || [];
                 // Sort desc (should already be sorted from query but safety first)
                 candles.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                 
                 if (candles.length > 0) {
                     const latest = candles[0];
                     const previous = candles[1] || latest;
                     const currentPrice = Number(latest.close);
                     const prevPrice = Number(previous.close);
                     
                     const changePercent = prevPrice 
                        ? ((currentPrice - prevPrice) / prevPrice) * 100
                        : 0;
                        
                     overview.push({
                        ticker: sym.ticker,
                        name: sym.name || sym.ticker,
                        price: currentPrice,
                        changePercent: parseFloat(changePercent.toFixed(2)),
                        updatedAt: new Date(latest.timestamp),
                     });
                 }
            }
            
            return overview;

        } catch (e) {
             logger.error(`Failed to get market overview`, e);
             return [];
        }
    }

    // SYNC DATA (Yahoo Finance)
    async syncSymbolData(ticker: string, type: 'STOCK' | 'CRYPTO', interval: string = '1h', endDate?: Date) {
        try {
            logger.info(`Sync started for ${ticker} (${interval})` + (endDate ? ` until ${endDate.toISOString()}` : ''));
            const symbol = await this.ensureSymbol(ticker, type);
            
            let queryOptions: any = {
                interval: interval,
            };

            if (endDate) {
                // BACKFILL MODE: Fetch data BEFORE endDate
                // Determines how far back to go per chunk
                const start = new Date(endDate);
                if (interval === '1h') start.setDate(start.getDate() - 30); // 30 days chunk
                else if (interval === '1d') start.setFullYear(start.getFullYear() - 1); // 1 year chunk
                else if (interval === '1wk') start.setFullYear(start.getFullYear() - 5); // 5 years chunk for weekly
                else if (interval === '1mo') start.setFullYear(start.getFullYear() - 10); // 10 years for monthly
                else start.setDate(start.getDate() - 60); // 60 days for others (15m, 30m)

                queryOptions.period1 = start;
                queryOptions.period2 = endDate;
            } else {
                // FORWARD FILL MODE: Fetch data AFTER last validation
                // Get last timestamp for this interval
                const [lastEntry] = await db.select({ date: marketData.timestamp })
                    .from(marketData)
                    .where(and(
                        eq(marketData.symbolId, symbol.id),
                        eq(marketData.interval, interval)
                    ))
                    .orderBy(desc(marketData.timestamp))
                    .limit(1);

                if (lastEntry) {
                    queryOptions.period1 = lastEntry.date;
                    // Add 1 second to avoid duplicate of last candle (optional, but handled by db)
                } else {
                    // Default history if empty
                    const start = new Date();
                    if (interval === '1d') start.setFullYear(start.getFullYear() - 1);
                    else if (interval === '1h') start.setMonth(start.getMonth() - 2); // ~60 days
                    else start.setDate(start.getDate() - 7);
                    queryOptions.period1 = start;
                }
                
                // Simple check to avoid future queries if period1 is mostly now
                if (new Date(queryOptions.period1) > new Date()) {
                     return { count: 0, status: 'uptodate' };
                }
            }

            logger.debug(`Fetching ${ticker} (${interval}) range: ${queryOptions.period1} -> ${queryOptions.period2 || 'now'}`);
            
            // Yahoo-finance2 handles '1d', '1h' etc.
            const chartOptions: any = {
                period1: queryOptions.period1,
                interval: queryOptions.interval as any
            };
            if (queryOptions.period2) {
                chartOptions.period2 = queryOptions.period2;
            }

            const result = await client.chart(ticker, chartOptions);

            if (!result || !result.quotes || result.quotes.length === 0) {
                logger.warn(`No data found for ${ticker}`);
                return { count: 0, status: 'empty' };
            }

            // Map to DB Schema
            const values = result.quotes.map((candle: any) => ({
                symbolId: symbol.id,
                timestamp: new Date(candle.date),
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume,
                interval: interval
            })).filter((c: any) => 
                c.open !== null && c.close !== null && 
                c.open > 0 && c.close > 0 && 
                c.high > 0 && c.low > 0
            );

            if (values.length === 0) return { count: 0, status: 'empty' };

            await db.insert(marketData)
                .values(values)
                .onConflictDoNothing()
                .execute();

            logger.info(`Saved ${values.length} candles for ${ticker} (${interval})`);
            
            // Update lastSyncedAt
            await db.update(symbols)
                .set({ lastSyncedAt: new Date() })
                .where(eq(symbols.id, symbol.id))
                .execute();

            return { count: values.length, status: 'success' };

        } catch (error: any) {
            // Handle Yahoo Finance rate limiting
            if (error?.code === 429 || error?.name === 'HTTPError' && error?.response?.status === 429) {
                logger.warn(`Rate limited by Yahoo Finance for ${ticker}. Try again in a few minutes.`);
                throw new Error('Yahoo Finance rate limit exceeded. Please wait a few minutes before retrying.');
            }
            
            logger.error(`Failed to sync ${ticker}`, error);
            throw error;
        }
    }

    // GET OHLCV with Auto-Sync
    async getOHLCV(ticker: string, interval = '1d', limit = 100, before?: string) {
        logger.debug(`[getOHLCV] Request: ${ticker} (${interval}) before=${before || 'now'}`);
        
        // 1. Find Symbol
        const symbol = await this.getSymbolByTicker(ticker);
        if (!symbol) throw new Error(`Symbol ${ticker} not found`);

        // Build where clause
        const whereClause = [
            eq(marketData.symbolId, symbol.id),
            eq(marketData.interval, interval)
        ];
        
        if (before) {
            whereClause.push(lt(marketData.timestamp, new Date(before)));
        }

        // 2. Try DB Fetch
        let candles = await db.select()
            .from(marketData)
            .where(and(...whereClause))
            .orderBy(desc(marketData.timestamp))
            .limit(limit);

        // 3. If Empty, Trigger Live Sync
        // Case A: Initial Load (No before) -> Sync latest
        // Case B: Infinite Scroll (Has before) -> Sync older chunk
        if (candles.length === 0) {
            logger.info(`[getOHLCV] Data missing/insufficient for ${ticker}, syncing...`);
            try {
                if (before) {
                    // Backfill
                    await this.syncSymbolData(ticker, symbol.type, interval, new Date(before));
                } else {
                    // Initial Fill
                    await this.syncSymbolData(ticker, symbol.type, interval);
                }
                
                // Re-fetch after sync
                candles = await db.select()
                    .from(marketData)
                    .where(and(...whereClause))
                    .orderBy(desc(marketData.timestamp))
                    .limit(limit);
            } catch (e) {
                logger.error(`[getOHLCV] Auto-sync failed for ${ticker}`, e);
            }
        }

        // 4. Return formatted data
        return candles.reverse().map(c => ({
            timestamp: c.timestamp,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume)
        }));
    }
    // GET SINGLE SYMBOL BY TICKER
    async getSymbolByTicker(ticker: string) {
        const [symbol] = await db.select().from(symbols).where(eq(symbols.ticker, ticker)).limit(1);
        return symbol || null;
    }

    /**
     * Optimized Chart Data using TimescaleDB time_bucket()
     * Automatically downsamples data to requested resolution
     */
    async getDownsampledCandles(ticker: string, resolution: string = '1 day', limit = 1000) {
        const [symbol] = await db.select().from(symbols).where(eq(symbols.ticker, ticker)).limit(1);
        if (!symbol) throw new Error("Symbol not found");
        
        // Use raw SQL for time_bucket optimization
        // This is much faster than fetching all rows and filtering in JS
        const query = sql`
            SELECT 
                time_bucket(${resolution}::interval, timestamp) AS bucket,
                first(open, timestamp) as open,
                max(high) as high,
                min(low) as low,
                last(close, timestamp) as close,
                sum(volume) as volume
            FROM market_data
            WHERE symbol_id = ${symbol.id}
            GROUP BY bucket
            ORDER BY bucket DESC
            LIMIT ${limit}
        `;
        
        const result = await db.execute(query);
        
        // Reverse to match charting lib expectations (oldest first)
        return result.reverse().map((row: any) => ({
            timestamp: new Date(row.bucket),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: Number(row.volume) // Sum might return bigint
        }));
    }

    // ON-DEMAND ENRICHMENT (fetch metadata from Yahoo Finance)
    async enrichSymbol(ticker: string): Promise<any> {
        logger.info(`Enriching symbol metadata: ${ticker}`);
        
        try {
            // Use the instantiated client
            const result: any = await client.quoteSummary(ticker, {
                modules: ['assetProfile', 'quoteType']
            });
            
            const profile = result.assetProfile;
            const quoteType = result.quoteType;
            
            // Build update object
            const updates: Record<string, any> = {
                metadataUpdatedAt: new Date(),
            };
            
            // Name from quoteType
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
            
            // Return updated symbol
            const [updated] = await db.select().from(symbols).where(eq(symbols.ticker, ticker)).limit(1);
            
            logger.info(`Enriched ${ticker}: ${updates.name || 'N/A'}`);
            return updated;
            
        } catch (error: any) {
            logger.warn(`Could not enrich ${ticker}: ${error?.message}`);
            
            // Mark as attempted
            await db.update(symbols)
                .set({ metadataUpdatedAt: new Date() })
                .where(eq(symbols.ticker, ticker))
                .execute();
            
            // Return existing symbol without enrichment
            const [existing] = await db.select().from(symbols).where(eq(symbols.ticker, ticker)).limit(1);
            return existing;
        }
    }
    // Get top movers (gainers and losers)
    // Get top movers (gainers and losers) - OPTIMIZED & CACHED
    async getTopMovers(limit = 6) {
        // 1. Check Cache
        // 1. Check Cache
        if (this.moversCache && Date.now() < this.moversCache.expiresAt) {
            logger.debug(`[getTopMovers] Serving from cache (expires in ${((this.moversCache.expiresAt - Date.now()) / 60000).toFixed(1)}m)`);
            return this.moversCache.data;
        }

        const start = performance.now();
        logger.info(`[getTopMovers] Starting calculation (DB Optimized)...`);
        
        try {
            // 2. Efficient SQL Query for Ranking
            // Get latest 2 '1d' candles for each symbol to calculate change
            const query = sql`
                WITH ranked_candles AS (
                    SELECT 
                        m.symbol_id,
                        m.close,
                        m.timestamp,
                        ROW_NUMBER() OVER (PARTITION BY m.symbol_id ORDER BY m.timestamp DESC) as rn
                    FROM market_data m
                    WHERE m.interval = '1d'
                ),
                changes AS (
                    SELECT 
                        curr.symbol_id,
                        curr.close as current_price,
                        prev.close as prev_price,
                        ((curr.close - prev.close) / prev.close) * 100 as change_percent
                    FROM ranked_candles curr
                    JOIN ranked_candles prev ON curr.symbol_id = prev.symbol_id AND prev.rn = 2
                    WHERE curr.rn = 1
                )
                SELECT 
                    c.change_percent, 
                    c.current_price,
                    s.id,
                    s.ticker, 
                    s.name, 
                    s.type,
                    s.provider
                FROM changes c
                JOIN symbols s ON c.symbol_id = s.id
                ORDER BY c.change_percent DESC;
            `;

            const allMovers: any[] = await db.execute(query);
            
            if (allMovers.length === 0) {
                 logger.warn("[getTopMovers] No data found via optimized query.");
                 return { gainers: [], losers: [], trending: [] };
            }

            // 4. Fetch Sparklines ONLY for the displayed items
            // OPTIMIZATION: We fetch sparklines for potentially MORE items than needed if we want to re-sort correctly.
            // But to avoid fetching sparklines for 1000 items, let's keep the initial slice but maybe widen it?
            // Actually, if a stock flips from -2% to +3%, it SHOULD be in gainers. 
            // If we only process the top 6 daily gainers, we might miss the "Real" hourly gainers.
            // However, fetching sparklines for ALL symbols is too heavy.
            // Compromise: We slice Top 30 Gainers/Losers/Trending initially to get a candidate pool.
            
            const candidatePool = [
                 ...allMovers.slice(0, 20), // Top 20 Daily Gainers
                 ...[...allMovers].reverse().slice(0, 20) // Top 20 Daily Losers
            ];
            // Remove duplicates
            const uniqueCandidates = Array.from(new Set(candidatePool.map(m => m.id)))
                .map(id => candidatePool.find(m => m.id === id));
                
            const symbolIds = uniqueCandidates.map(m => m.id);
            const sparklinesMap = new Map<number, any[]>();
            
            if (symbolIds.length > 0) {
                 // Fetch last 24 candles for these specific symbols with TIMESTAMP
                 const sparklineQuery = sql`
                    SELECT symbol_id, close, timestamp
                    FROM (
                        SELECT 
                            symbol_id, 
                            close,
                            timestamp,
                            ROW_NUMBER() OVER (PARTITION BY symbol_id ORDER BY timestamp DESC) as rn
                        FROM market_data
                        WHERE symbol_id IN ${symbolIds} AND interval = '1h'
                    ) sub
                    WHERE rn <= 24
                 `;
                 
                 const sparklineRows = await db.execute(sparklineQuery);
                 
                 // Group by symbol with timestamps
                 for (const row of sparklineRows) {
                     const sid = row.symbol_id as number;
                     if (!sparklinesMap.has(sid)) sparklinesMap.set(sid, []);
                     sparklinesMap.get(sid)?.push({
                         close: Number(row.close),
                         time: new Date(row.timestamp as any)
                     });
                 }
            }

            // 5. Enrich and Format Candidates
            const formatMover = (m: any) => {
                const rawSparkline = sparklinesMap.get(m.id) || [];
                
                // DATA INTEGRITY: Sort by time ASC (Oldest -> Newest) and clean data
                rawSparkline.sort((a: any, b: any) => a.time.getTime() - b.time.getTime());
                const sparkline = rawSparkline.map((d: any) => d.close).filter((c: number) => c > 0);

                let price = Number(m.current_price);
                let changePercent = Number(m.change_percent);

                // DATA INTEGRITY: Override with 1h sparkline data if available
                if (sparkline.length > 0) {
                    const lastPrice = sparkline[sparkline.length - 1]; // Newest
                    const startPrice = sparkline[0]; // Oldest (~24h ago)
                    
                    price = lastPrice;
                    
                    if (startPrice !== 0) {
                        changePercent = ((lastPrice - startPrice) / startPrice) * 100;
                    }
                    

                }

                return {
                    id: m.id,
                    ticker: m.ticker,
                    name: m.name,
                    type: m.type,
                    price: price,
                    changePercent: changePercent,
                    sparkline: sparkline
                };
            };

            const enrichedCandidates = uniqueCandidates.map(formatMover);

            // 6. Re-Sort and Slice Categories based on UPDATED (Hourly) Data
            const gainers = enrichedCandidates
                .filter(m => m.changePercent > 0)
                .sort((a, b) => b.changePercent - a.changePercent)
                .slice(0, limit);

            const losers = enrichedCandidates
                .filter(m => m.changePercent < 0)
                .sort((a, b) => a.changePercent - b.changePercent) // Most negative first
                .slice(0, limit);

            const trending = [...enrichedCandidates]
                .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
                .slice(0, limit);

            const result = {
                gainers,
                losers,
                trending
            };

            const duration = (performance.now() - start).toFixed(2);
            logger.info(`[getTopMovers] Completed in ${duration}ms (DB Optimized). Cache set for 1h.`);

            // 7. Set Cache (1 hour)
            this.moversCache = {
                data: result,
                expiresAt: Date.now() + 60 * 60 * 1000
            };
            
            return result;

        } catch (e) {
            logger.error(`[getTopMovers] Critical failure`, e);
            throw e;
        }
    }
}

export const marketService = new MarketService();
