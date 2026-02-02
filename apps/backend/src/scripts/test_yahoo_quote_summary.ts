
import yahooFinance from 'yahoo-finance2';

async function test() {
  const client = new (yahooFinance as any)();
  try {
    const result = await client.quoteSummary('BBCA.JK', { modules: ['quoteType', 'price'] });
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
  }
}

test();
