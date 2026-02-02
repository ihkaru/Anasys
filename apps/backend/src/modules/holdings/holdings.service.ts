import { holdings, marketData, symbols } from "@packages/db/src/schema";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { Logger } from "../../utils/logger";

const logger = new Logger('HoldingsService');

export interface CreateHoldingInput {
    userId: number;
    ticker: string;
    shares: number;
    avgCost: number;
    source?: string;
}

export interface UpdateHoldingInput {
    shares?: number;
    avgCost?: number;
}

export interface HoldingWithDetails {
    id: number;
    ticker: string;
    name: string | null;
    type: string;
    shares: number;
    avgCost: number;
    currentPrice: number;
    currentValue: number;
    pnl: number;
    pnlPercent: number;
    website: string | null;
    iconUrl: string | null;
    source: string;
    sparkline?: number[];
}

export class HoldingsService {

    // Get all holdings for a user with current prices
    async getUserHoldings(userId: number): Promise<HoldingWithDetails[]> {
        logger.debug(`Getting holdings for user ${userId}`);
        
        // Get holdings with symbol details
        const result = await db.select({
            id: holdings.id,
            shares: holdings.shares,
            avgCost: holdings.avgCost,
            symbolId: holdings.symbolId,
            ticker: symbols.ticker,
            name: symbols.name,
            type: symbols.type,
            website: symbols.website,
            iconUrl: symbols.iconUrl,
            source: holdings.source,
        })
            .from(holdings)
            .innerJoin(symbols, eq(holdings.symbolId, symbols.id))
            .where(eq(holdings.userId, userId))
            .orderBy(desc(holdings.createdAt));
        
        // Enrich with current prices
        const enriched: HoldingWithDetails[] = [];
        
        for (const holding of result) {
            // Get latest price and history for sparkline
            const history = await db.select({
                close: marketData.close
            })
                .from(marketData)
                .where(
                    and(
                        eq(marketData.symbolId, holding.symbolId),
                        eq(marketData.source, holding.source)
                    )
                )
                .orderBy(desc(marketData.timestamp))
                .limit(14); // 14 days of history
            
            const currentPrice = history[0]?.close || holding.avgCost;
            const currentValue = holding.shares * currentPrice;
            const costBasis = holding.shares * holding.avgCost;
            const pnl = currentValue - costBasis;
            const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
            
            // Sparkline data (reverse to be chronological)
            const sparkline = history.map(h => h.close).reverse();

            enriched.push({
                id: holding.id,
                ticker: holding.ticker,
                name: holding.name,
                type: holding.type,
                shares: holding.shares,
                avgCost: holding.avgCost,
                currentPrice,
                currentValue,
                pnl,
                pnlPercent,
                website: holding.website,
                iconUrl: holding.iconUrl,
                source: holding.source,
                sparkline,
            });
        }
        
        return enriched;
    }

    // Create new holding
    async createHolding(input: CreateHoldingInput): Promise<{ success: boolean; id?: number; error?: string }> {
        logger.info(`Creating holding: ${input.ticker} for user ${input.userId}`);
        
        // Find symbol
        const [symbol] = await db.select()
            .from(symbols)
            .where(eq(symbols.ticker, input.ticker.toUpperCase()))
            .limit(1);
        
        if (!symbol) {
            return { success: false, error: "Symbol not found" };
        }
        
        const source = input.source || 'YAHOO';
        
        // Check if user already has this holding with same source
        const [existing] = await db.select()
            .from(holdings)
            .where(and(
                eq(holdings.userId, input.userId),
                eq(holdings.symbolId, symbol.id),
                eq(holdings.source, source)
            ))
            .limit(1);
        
        if (existing) {
            // Update existing (average in the new position)
            const totalShares = existing.shares + input.shares;
            const totalCost = (existing.shares * existing.avgCost) + (input.shares * input.avgCost);
            const newAvgCost = totalCost / totalShares;
            
            await db.update(holdings)
                .set({
                    shares: totalShares,
                    avgCost: newAvgCost,
                    updatedAt: new Date(),
                })
                .where(eq(holdings.id, existing.id))
                .execute();
            
            logger.info(`Updated holding: ${input.ticker}, new shares: ${totalShares}, new avg: ${newAvgCost}`);
            return { success: true, id: existing.id };
        }
        
        // Insert new holding
        const [created] = await db.insert(holdings)
            .values({
                userId: input.userId,
                symbolId: symbol.id,
                shares: input.shares,
                avgCost: input.avgCost,
                source: source,
            })
            .returning();
        
        return { success: true, id: created.id };
    }

    // Update holding
    async updateHolding(holdingId: number, userId: number, updates: UpdateHoldingInput) {
        logger.info(`Updating holding ${holdingId}`);
        
        // Verify ownership
        const [existing] = await db.select()
            .from(holdings)
            .where(and(
                eq(holdings.id, holdingId),
                eq(holdings.userId, userId)
            ))
            .limit(1);
        
        if (!existing) {
            throw new Error("Holding not found");
        }
        
        const [updated] = await db.update(holdings)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .where(eq(holdings.id, holdingId))
            .returning();
        
        return updated;
    }

    // Delete holding
    async deleteHolding(holdingId: number, userId: number) {
        logger.info(`Deleting holding ${holdingId}`);
        
        const [existing] = await db.select()
            .from(holdings)
            .where(and(
                eq(holdings.id, holdingId),
                eq(holdings.userId, userId)
            ))
            .limit(1);
        
        if (!existing) {
            throw new Error("Holding not found");
        }
        
        await db.delete(holdings)
            .where(eq(holdings.id, holdingId))
            .execute();
        
        return { success: true };
    }

    // Get portfolio summary
    async getPortfolioSummary(userId: number) {
        const holdingsList = await this.getUserHoldings(userId);
        
        const totalValue = holdingsList.reduce((sum, h) => sum + h.currentValue, 0);
        const totalCost = holdingsList.reduce((sum, h) => sum + (h.shares * h.avgCost), 0);
        const totalPnl = totalValue - totalCost;
        const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
        
        // Calculate allocation
        const allocation = holdingsList.map(h => ({
            ticker: h.ticker,
            name: h.name,
            value: h.currentValue,
            percent: totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0,
        })).sort((a, b) => b.percent - a.percent);
        
        return {
            totalValue,
            totalCost,
            totalPnl,
            totalPnlPercent,
            holdingsCount: holdingsList.length,
            allocation,
        };
    }
}

export const holdingsService = new HoldingsService();
