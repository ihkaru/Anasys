
import yahooFinance from 'yahoo-finance2';

async function test() {
  const client = new (yahooFinance as any)();
  try {
    const result = await client.search('BBCA.JK', { quotesCount: 1 });
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
  }
}

test();
