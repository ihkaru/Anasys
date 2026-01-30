import { symbols } from '@packages/db/src/schema';
import { count, isNotNull } from 'drizzle-orm';
import { db } from '../db';

async function main() {
    const [result] = await db.select({ count: count() }).from(symbols).where(isNotNull(symbols.iconUrl));
    console.log('Symbols with iconUrl:', result.count);
    
    const samples = await db.select().from(symbols).where(isNotNull(symbols.iconUrl)).limit(5);
    for (const s of samples) {
        console.log(s.ticker, '->', s.iconUrl);
    }
}

main();
