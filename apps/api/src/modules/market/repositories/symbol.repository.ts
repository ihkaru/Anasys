import { symbols } from "@packages/db/src/schema";
import { eq, inArray } from "drizzle-orm";

export class SymbolRepository {
	constructor(private db: any) {}

	async findByTicker(ticker: string): Promise<any | null> {
		const [symbol] = await this.db.select().from(symbols).where(eq(symbols.ticker, ticker)).limit(1);
		return symbol || null;
	}

	async findByIds(ids: number[]): Promise<any[]> {
		return await this.db.select().from(symbols).where(inArray(symbols.id, ids));
	}

	async findByTickers(tickers: string[]): Promise<any[]> {
		return await this.db.select().from(symbols).where(inArray(symbols.ticker, tickers));
	}

	async findAll(): Promise<any[]> {
		return await this.db.select().from(symbols);
	}

	async create(data: { ticker: string; type: string; provider: string; name: string }): Promise<any> {
		const [newSym] = await this.db
			.insert(symbols)
			.values({
				...data,
				isActive: true,
			})
			.returning();
		return newSym;
	}

	async update(id: number, data: any): Promise<void> {
		await this.db.update(symbols).set(data).where(eq(symbols.id, id)).execute();
	}

	async updateByTicker(ticker: string, data: any): Promise<void> {
		await this.db.update(symbols).set(data).where(eq(symbols.ticker, ticker)).execute();
	}
    
	async search(query: string, limit = 10): Promise<any[]> {
		const { ilike, or } = await import("drizzle-orm");
		return await this.db
			.select()
			.from(symbols)
			.where(or(ilike(symbols.ticker, `%${query}%`), ilike(symbols.name, `%${query}%`)))
			.limit(limit);
	}
}
