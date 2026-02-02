
import { marketService } from "../modules/market/market.service";

async function testEnrich() {
    const ticker = 'BUMI.JK';
    console.log(`Enriching symbol: ${ticker}`);
    
    try {
        const result = await marketService.enrichSymbol(ticker);
        console.log('Enrich Result:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('Error enriching:', e);
    }
    process.exit(0);
}

testEnrich();
