from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import sys
import os
import json

# Add local libs to path
sys.path.append(os.path.join(os.path.dirname(__file__), '../python-libs/tradingview-scraper'))

from tradingview_scraper.symbols.screener import Screener
from custom_streamer import ExtendedStreamer

app = FastAPI(title="Anasys TV Bridge")

# Singletons
screener = Screener()
# ExtendedStreamer is usually symbol-specific for streaming, 
# but for chart export we can reuse it if we don't start the websocket thread?
# Actually, the original script initializes it per call.
# Let's keep a pool or just initialize for chart.
# For search, Screener is already a singleton.

class SearchQuery(BaseModel):
    query: str
    scanner: str = "global"
    limit: int = 30

class ChartQuery(BaseModel):
    symbol: str
    interval: str = "1d"
    limit: int = 200
    extended_hours: bool = True

@app.get("/ping")
async def ping():
    return {"status": "ok"}

@app.post("/search")
async def search(q: SearchQuery):
    query_symbol = q.query.upper()
    columns = ['name', 'close', 'change', 'exchange', 'type', 'description', 'currency', 'market_cap_basic']
    
    filters = [{'left': 'name', 'operation': 'match', 'right': query_symbol}]
    
    try:
        result = screener.screen(
            market=q.scanner, 
            filters=filters,
            columns=columns, 
            limit=q.limit
        )
        data = result.get('data', [])
        
        # Fallback to description
        if not data and len(query_symbol) >= 3:
            filters_desc = [{'left': 'description', 'operation': 'match', 'right': query_symbol}]
            result_desc = screener.screen(market=q.scanner, filters=filters_desc, columns=columns, limit=q.limit)
            data = result_desc.get('data', [])
            
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chart")
async def chart(q: ChartQuery):
    # Mapping interval to TV format
    tv_interval = q.interval
    if q.interval == '1wk': tv_interval = '1w'
    if q.interval == '1mo': tv_interval = '1M'
    
    # Resolve exchange if not provided (same logic as bridge_tradingview.py)
    raw_symbol = q.symbol
    exchange = None
    curr_symbol = raw_symbol
    
    if ':' in raw_symbol:
        parts = raw_symbol.split(':')
        exchange = parts[0]
        curr_symbol = parts[1]
    else:
        # Resolve via Screener
        filters = [{'left': 'name', 'operation': 'equal', 'right': raw_symbol.upper()}]
        columns = ['name', 'exchange']
        for m in ['america', 'crypto', 'global']:
            try:
                res = screener.screen(market=m, filters=filters, columns=columns, limit=5)
                data = res.get('data', [])
                if data and data[0].get('exchange'):
                    exchange = data[0].get('exchange')
                    break
            except: pass
            
    if not exchange:
        raise HTTPException(status_code=400, detail=f"Could not resolve exchange for {raw_symbol}")

    # Use ExtendedStreamer for chart export
    # We create a new one to avoid websocket state conflicts, but it's fast
    streamer = ExtendedStreamer(
        export_result=True, 
        export_type='json',
        extended_hours=q.extended_hours
    )
    
    try:
        result = streamer.stream(
            exchange=exchange,
            symbol=curr_symbol,
            timeframe=tv_interval,
            numb_price_candles=q.limit
        )
        
        raw_data = None
        if isinstance(result, dict):
            if 'data' in result and isinstance(result['data'], dict) and 'ohlc' in result['data']:
                raw_data = result['data']['ohlc']
            elif 'ohlc' in result:
                raw_data = result['ohlc']
            elif 'data' in result and isinstance(result['data'], list):
                raw_data = result['data']
        
        if raw_data and isinstance(raw_data, list):
            candles = []
            for c in raw_data:
                candles.append({
                    'time': c.get('time') or c.get('timestamp'),
                    'open': c.get('open'),
                    'high': c.get('high'),
                    'low': c.get('low'),
                    'close': c.get('close'),
                    'volume': c.get('volume')
                })
            return candles
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.environ.get("TV_BRIDGE_PORT", 8081))
    uvicorn.run(app, host="127.0.0.1", port=port)
