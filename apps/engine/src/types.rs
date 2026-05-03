use serde::{Deserialize, Serialize};

/// Real-time tick dari TradingView WebSocket.
/// Disimpan ke QuestDB tabel `ticks`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TickData {
    pub symbol: String,
    pub price: f64,
    pub volume: f64,
    pub bid: f64,
    pub ask: f64,
    pub timestamp: i64,
}

/// OHLCV candle hasil backfill atau agregasi.
/// Disimpan ke QuestDB tabel `candles`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CandleData {
    pub symbol: String,
    pub interval: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub source: String,
    pub timestamp: i64,
}

/// Harvesting task dari API.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackfillTask {
    pub id: i32,
    pub ticker: String,
    pub interval: String,
    pub target_start_date: String,
    pub asset_type: String,
    pub tradingview_symbol: Option<String>,
    pub tradingview_exchange: Option<String>,
}
