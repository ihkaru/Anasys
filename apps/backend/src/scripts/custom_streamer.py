"""
Custom Streamer with Extended Hours support.
Patched version of tradingview_scraper.symbols.stream.Streamer
"""

import re
import sys
import json
import logging
import signal
from time import sleep
from typing import Optional, List, Tuple

from websocket import WebSocketConnectionClosedException

from tradingview_scraper.symbols.stream import StreamHandler
from tradingview_scraper.symbols.stream.utils import (
    validate_symbols,
    fetch_indicator_metadata
)
from tradingview_scraper.symbols.utils import save_json_file, save_csv_file
from tradingview_scraper.symbols.exceptions import DataNotFoundError

# Configure logging
logging.basicConfig(level=logging.DEBUG,
                    format='%(asctime)s - %(levelname)s - %(message)s')


class ExtendedStreamer:
    """
    A patched Streamer class that supports extended trading hours (pre-market & after-hours).
    """

    def __init__(
        self,
        export_result=False,
        export_type='json',
        websocket_jwt_token: str = "unauthorized_user_token",
        extended_hours: bool = True  # NEW: Enable extended hours by default
    ):
        """
        Initializes the ExtendedStreamer class.

        Args:
            export_result (bool): Flag to determine if the result should be exported.
            export_type (str): Type of export ('json' or 'csv').
            websocket_jwt_token (str): WebSocket JWT token for authentication.
            extended_hours (bool): Enable extended trading hours (pre-market & after-hours).
        """
        self.export_result = export_result
        self.export_type = export_type
        self.extended_hours = extended_hours
        self.study_id_to_name_map = {}
        ws_url = "wss://data.tradingview.com/socket.io/websocket?from=chart%2FVEPYsueI%2F&type=chart"
        self.stream_obj = StreamHandler(websocket_url=ws_url, jwt_token=websocket_jwt_token)

    def _add_symbol_to_sessions(
        self,
        quote_session: str,
        chart_session: str,
        exchange_symbol: str,
        timeframe: str = "1m",
        numb_candles: int = 10
    ):
        """
        Adds a symbol to the WebSocket session with extended hours support.
        """
        timeframe_map = {
            '1m': '1',
            '5m': '5',
            '15m': '15',
            '30m': '30',
            '1h': '60',
            '2h': '120',
            '4h': '240',
            '1d': '1D',
            '1w': '1W',
            '1M': '1M'
        }
        
        # Build resolve_symbol payload with optional extended session
        symbol_payload = {
            "adjustment": "splits",
            "symbol": exchange_symbol
        }
        
        # Add session: extended for pre-market and after-hours data
        if self.extended_hours:
            symbol_payload["session"] = "extended"
            logging.info(f"Extended hours enabled for {exchange_symbol}")
        
        resolve_symbol = json.dumps(symbol_payload)
        
        self.stream_obj.send_message("quote_add_symbols", [quote_session, f"={resolve_symbol}"])
        self.stream_obj.send_message("resolve_symbol", [chart_session,
                                                        "sds_sym_1", f"={resolve_symbol}"])
        self.stream_obj.send_message("create_series", [chart_session,
                                                       "sds_1", "s1", "sds_sym_1", timeframe_map.get(timeframe, "1"),
                                                       numb_candles, ""])
        self.stream_obj.send_message("quote_fast_symbols", [quote_session, exchange_symbol])

    def _serialize_ohlc(self, raw_data):
        """Serializes OHLC data from the raw packet."""
        ohlc_data = raw_data.get('p', [{}, {}, {}])[1].get('sds_1', {}).get('s', [])

        json_data = []
        for entry in ohlc_data:
            json_entry = {
                'index': entry['i'],
                'time': entry['v'][0],  # Changed to 'time' for consistency
                'open': entry['v'][1],
                'high': entry['v'][2],
                'low': entry['v'][3],
                'close': entry['v'][4]
            }
            if len(entry['v']) > 5:
                json_entry["volume"] = entry['v'][5]
            json_data.append(json_entry)
        return json_data

    def _extract_ohlc_from_stream(self, pkt: dict):
        """Extracts OHLC data from the data stream."""
        json_data = []
        if pkt.get('m') == "timescale_update":
            json_data = self._serialize_ohlc(pkt)
        return json_data

    def stream(
        self,
        exchange: str,
        symbol: str,
        timeframe: str = '1m',
        numb_price_candles: int = 10,
        indicators: Optional[List[Tuple[str, str]]] = None
    ):
        """
        Starts streaming data for a given exchange and symbol.

        Args:
            exchange (str): The exchange to fetch data from.
            symbol (str): The symbol to fetch data for.
            timeframe (str): The timeframe for the data. Default is '1m'.
            numb_price_candles (int): The number of price candles to retrieve.
            indicators (list, optional): List of indicator tuples.

        Returns:
            dict: A dictionary containing OHLC and indicator data.
        """
        exchange_symbol = f"{exchange}:{symbol}"
        validate_symbols(exchange_symbol)

        self._add_symbol_to_sessions(
            self.stream_obj.quote_session,
            self.stream_obj.chart_session,
            exchange_symbol,
            timeframe,
            numb_price_candles
        )

        if self.export_result is True:
            ohlc_json_data = []

            logging.info(f"Starting data collection for {numb_price_candles} candles (extended_hours={self.extended_hours})")

            for i, pkt in enumerate(self.get_data()):
                received_data = self._extract_ohlc_from_stream(pkt)
                if received_data:
                    ohlc_json_data = received_data
                    logging.debug(f"OHLC data updated: {len(ohlc_json_data)} candles")

                if len(ohlc_json_data) >= numb_price_candles:
                    break

                if i > 15:
                    logging.warning(f"Timeout reached after {i} packets. Collected: OHLC={len(ohlc_json_data)}")
                    if not ohlc_json_data:
                        raise DataNotFoundError("No 'OHLC' packet found within the timeout period.")
                    break

            logging.info(f"Data collection complete: {len(ohlc_json_data)} OHLC candles")
            return {"ohlc": ohlc_json_data, "indicator": {}}

        return self.get_data()

    def get_data(self):
        """Continuously receives data from the TradingView server."""
        try:
            while True:
                try:
                    sleep(1)
                    result = self.stream_obj.ws.recv()
                    if re.match(r"~m~\d+~m~~h~\d+$", result):
                        self.stream_obj.ws.recv()
                        logging.debug("Received heartbeat: %s", result)
                        self.stream_obj.ws.send(result)
                    else:
                        split_result = [x for x in re.split(r'~m~\d+~m~', result) if x]
                        for item in split_result:
                            if item:
                                yield json.loads(item)

                except WebSocketConnectionClosedException:
                    logging.error("WebSocket connection closed.")
                    break
                except Exception as e:
                    logging.error("An error occurred: %s", str(e))
                    break
        finally:
            self.stream_obj.ws.close()
