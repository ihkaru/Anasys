
import { sql } from "drizzle-orm";
import { Logger } from "../../../utils/logger";
import { CacheService } from "../cache/cache.service";
import { MarketDataRepository } from "../repositories/market-data.repository";
import { SymbolRepository } from "../repositories/symbol.repository";

export class MoversService {
    constructor(
        private marketDataRepo: MarketDataRepository,
        private symbolRepo: SymbolRepository,
        private cacheService: CacheService,
        private logger: Logger,
        // Since we need to run complex joins that might not fit neatly into repo (or repo needs to expose db),
        // we'll inject db or assume repo handles it.
        // For simplicity in this refactor step, we'll assume we can pass DB instance to repo or use repo methods.
        // However, the query is complex JOINS. 
        // Ideally, we move the complex query to the Repository.
        private db: any 
    ) {}

    async getTopMovers(limit = 6) {
        const cached = await this.cacheService.get<any>('top-movers');
        if (cached) {
            this.logger.debug(`[getTopMovers] Serving from cache`);
            return cached;
        }

        const start = performance.now();
        this.logger.info(`[getTopMovers] Starting calculation (DB Optimized)...`);
        
        try {
            // Complex Logic moved here
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

            const allMovers: any[] = await this.db.execute(query);
            
            if (allMovers.length === 0) {
                 return { gainers: [], losers: [], trending: [] };
            }

            const candidatePool = [
                 ...allMovers.slice(0, 20),
                 ...[...allMovers].reverse().slice(0, 20)
            ];
            
            const uniqueCandidates = Array.from(new Set(candidatePool.map(m => m.id)))
                .map(id => candidatePool.find(m => m.id === id));
                
            const symbolIds = uniqueCandidates.map(m => m.id);
            const sparklinesMap = new Map<number, any[]>();
            
            if (symbolIds.length > 0) {
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
                 
                 const sparklineRows = await this.db.execute(sparklineQuery);
                 
                 for (const row of sparklineRows) {
                     const sid = row.symbol_id as number;
                     if (!sparklinesMap.has(sid)) sparklinesMap.set(sid, []);
                     sparklinesMap.get(sid)?.push({
                         close: Number(row.close),
                         time: new Date(row.timestamp as any)
                     });
                 }
            }

            const formatMover = (m: any) => {
                const rawSparkline = sparklinesMap.get(m.id) || [];
                rawSparkline.sort((a: any, b: any) => a.time.getTime() - b.time.getTime());
                const sparkline = rawSparkline.map((d: any) => d.close).filter((c: number) => c > 0);

                let price = Number(m.current_price);
                let changePercent = Number(m.change_percent);

                if (sparkline.length > 0) {
                    const lastPrice = sparkline[sparkline.length - 1]; 
                    const startPrice = sparkline[0]; 
                    
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

            const gainers = enrichedCandidates
                .filter(m => m.changePercent > 0)
                .sort((a, b) => b.changePercent - a.changePercent)
                .slice(0, limit);

            const losers = enrichedCandidates
                .filter(m => m.changePercent < 0)
                .sort((a, b) => a.changePercent - b.changePercent)
                .slice(0, limit);

            const trending = [...enrichedCandidates]
                .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
                .slice(0, limit);

            const result = { gainers, losers, trending };

            const duration = (performance.now() - start).toFixed(2);
            this.logger.info(`[getTopMovers] Completed in ${duration}ms. Cache set for 1h.`);
            
            await this.cacheService.set('top-movers', result, 60 * 60 * 1000);
            
            return result;

        } catch (e) {
            this.logger.error(`[getTopMovers] Critical failure`, e);
            throw e;
        }
    }
}
