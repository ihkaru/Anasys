
import sys
import json
import os

# Add local libs to path
sys.path.append(os.path.join(os.path.dirname(__file__), '../python-libs/tradingview-scraper'))

def respond(data, error=None):
    print(json.dumps({"data": data, "error": error}))
    sys.exit(0 if not error else 1)

try:
    # Attempt import
    try:
        from tradingview_scraper.symbols.market_movers import MarketMovers
        from tradingview_scraper.symbols.stream import RealTimeData
        from tradingview_scraper.symbols.symbol_markets import SymbolMarkets
    except ImportError as e:
        respond(None, f"Import Error: {str(e)}. (Missing/Broken dependencies?)")

    # Parse Args
    if len(sys.argv) < 3:
        respond(None, "Usage: bridge_tradingview.py <command> <json_args>")

    command = sys.argv[1]
    args = json.loads(sys.argv[2])

    if command == "movers":
        movers = MarketMovers()
        cat = args.get('category', 'gainers')
        cnt = args.get('count', 10)
        # Default market usa
        data = movers.scrape(market='stocks-usa', category=cat, limit=cnt)
        respond(data['data'])

    elif command == "search":
        # Search for exact ticker matches across all exchanges using Screener
        from tradingview_scraper.symbols.screener import Screener
        
        screener = Screener()
        query_symbol = args.get('query', '').upper()
        scanner = args.get('scanner', 'global')  # 'global' for all markets
        limit = args.get('limit', 30)
        
        # Filter by exact ticker name
        filters = [
            {'left': 'name', 'operation': 'equal', 'right': query_symbol}
        ]
        
        # Columns to fetch for each result
        columns = ['name', 'close', 'change', 'exchange', 'type', 'description', 'currency', 'market_cap_basic']
        
        result = screener.screen(
            market=scanner, 
            filters=filters,
            columns=columns, 
            limit=limit
        )
        
        # Return the data array
        respond(result.get('data', []))

    elif command == "quote":
        # Fetch snapshot quote using Screener
        from tradingview_scraper.symbols.screener import Screener
        
        screener = Screener()
        tickers = args.get('tickers', [])
        if not tickers:
            respond([])
            sys.exit(0)

        # Priority order of markets to search (US first, then global)
        # 'america' covers NYSE, NASDAQ, AMEX, etc.
        markets_to_try = ['america', 'crypto', 'global']
        
        results = []
        for ticker in tickers:
            filters = [{'left': 'name', 'operation': 'equal', 'right': ticker.upper()}]
            columns = [
                'name', 'close', 'change', 'change_abs', 'volume', 'market_cap_basic', 'exchange', 'currency',
                'premarket_close', 'premarket_change', 'premarket_change_abs',
                'postmarket_close', 'postmarket_change', 'postmarket_change_abs'
            ]
            
            found = False
            for market in markets_to_try:
                if found:
                    break
                try:
                    res = screener.screen(market=market, filters=filters, columns=columns, limit=5)
                    data = res.get('data', [])
                    if data:
                        # Prefer major US exchanges
                        us_exchanges = ['NASDAQ', 'NYSE', 'AMEX', 'CBOE', 'CME', 'BITSTAMP', 'COINBASE', 'BINANCE', 'FTX']
                        best_match = None
                        for item in data:
                            exchange = item.get('exchange', '')
                            if exchange in us_exchanges:
                                best_match = item
                                break
                        if best_match:
                            results.append(best_match)
                            found = True
                        elif data:
                            # If no US exchange match, take first result from this market
                            results.append(data[0])
                            found = True
                except:
                    pass
        
        respond(results)

    elif command == "chart":
        # Implement chart fetching using ExtendedStreamer (with pre/after market hours support)
        from custom_streamer import ExtendedStreamer
        
        # Get extended_hours parameter (default: True)
        extended_hours = args.get('extended_hours', True)
        
        # Initialize ExtendedStreamer for historical export with extended hours
        streamer = ExtendedStreamer(
            export_result=True, 
            export_type='json',
            extended_hours=extended_hours
        )
        
        raw_symbol = args.get('symbol', '')
        interval = args.get('interval', '1d')
        limit = args.get('limit', 200) # Number of candles
        
        # Parse Exchange & Symbol
        # Expected format "EXCHANGE:SYMBOL" or just "SYMBOL" (try to fallback)
        if ':' in raw_symbol:
            parts = raw_symbol.split(':')
            exchange = parts[0]
            curr_symbol = parts[1]
        else:
            # Fallback or try to search? 
            # For now, default to 'NASDAQ' if not specified, or try to infer?
            # Better to assume user provides "NASDAQ:MU". 
            # If backend sends "MU", we might default to 'AMERICA' or empty.
            # Warning: TV scraper needs exchange.
            exchange = "NASDAQ" # Default fallback for US stocks often works
            curr_symbol = raw_symbol
            
        # Map interval to TV format if needed (simple check)
        # TV Scraper uses: 1m, 5m, 1h, 1D, 1W, 1M
        tv_interval = interval
        if interval.endswith('d'): tv_interval = interval.upper() # 1d -> 1D
        if interval.endswith('w'): tv_interval = interval.upper()
        if interval.endswith('m') and not interval.endswith('mo'): tv_interval = interval # 15m -> 15m
        
        # Fetch data
        # Note: stream() returns a dict when export_result=True
        result = streamer.stream(
            exchange=exchange,
            symbol=curr_symbol,
            timeframe=tv_interval,
            numb_price_candles=limit
        )
        
        # Result format from scraper (based on docs):
        # {'data': [{'open': ..., 'high': ..., ...}]} ??
        # Or keys inside.
        # Actually docs say: "Export Historical OHLC candle... returns json".
        # Let's inspect result structure. It usually returns a list or dict with data.
        
        # Result structure handling
        # Case 1: {'data': {'ohlc': [...]}} (Seen in some versions/calls)
        # Case 2: {'ohlc': [...]} (Direct return)
        
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
             respond(candles)
                 
        else:
            # Fallback: pass through and hope backend handles it or debugs it
            respond(result)


    else:
        respond(None, f"Unknown command: {command}")

except Exception as e:
    respond(None, f"Runtime Error: {str(e)}")

