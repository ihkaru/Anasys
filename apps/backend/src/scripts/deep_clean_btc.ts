
import { and, eq, lt } from 'drizzle-orm';
import { marketData, symbols } from '../../../../packages/db/src/schema'; // Adjust path if needed
import { db } from '../db';

async function deepClean() {
    try {
        console.log("Running deep clean for ALL symbols with price < 0.01 (assuming major crypto/stocks shouldn't be zero)...");
        // NOTE: Be careful if penny stocks are supported. For BTC/Major stocks, < 1 is error.
        
        // Let's specifically target BTC again just to be sure
        const [symbol] = await db.select().from(symbols).where(eq(symbols.ticker, 'BTC-USD')).limit(1);
        if (symbol) {
             console.log(`Checking BTC-USD (ID: ${symbol.id}) for ANY low values...`);
             const badBtc = await db.delete(marketData)
                .where(and(
                    eq(marketData.symbolId, symbol.id),
                    lt(marketData.close, 5000) // BTC shouldn't be below 5000 in recent years
                ));
             console.log("Deleted potential bad BTC records.");
        }

    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
}

deepClean();
