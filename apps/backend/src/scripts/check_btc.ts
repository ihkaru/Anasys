import { and, desc, eq, lt } from 'drizzle-orm';
import { marketData, symbols } from '../../../../packages/db/src/schema';
import { db } from '../db';

async function checkBTC() {
    const symbol = await db.query.symbols.findFirst({ where: eq(symbols.ticker, 'BTC-USD') });
    if (!symbol) { console.log('BTC-USD not found'); return; }
    
    console.log('BTC-USD Symbol ID:', symbol.id);
    
    // Check for suspicious low values
    const suspicious = await db.select()
        .from(marketData)
        .where(and(
            eq(marketData.symbolId, symbol.id),
            lt(marketData.close, 10000)
        ))
        .orderBy(desc(marketData.timestamp))
        .limit(20);
    
    console.log('\nSuspicious records (close < 10000):');
    if (suspicious.length === 0) {
        console.log('  None found! Data looks clean.');
    } else {
        console.log(`  Found ${suspicious.length} suspicious records:`);
        suspicious.forEach(r => {
            console.log(`  ${r.timestamp.toISOString()} | O:${r.open} H:${r.high} L:${r.low} C:${r.close} | ${r.interval}`);
        });
    }
    
    // Get last 10 records
    const recent = await db.select()
        .from(marketData)
        .where(eq(marketData.symbolId, symbol.id))
        .orderBy(desc(marketData.timestamp))
        .limit(10);
    
    console.log('\nMost recent 10 records:');
    recent.forEach(r => {
        console.log(`  ${r.timestamp.toISOString()} | Close: ${r.close} | ${r.interval}`);
    });
}

checkBTC().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
