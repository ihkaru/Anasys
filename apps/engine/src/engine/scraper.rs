use crate::engine::batcher::Batcher;
use crate::engine::broadcaster::Broadcaster;
use crate::types::TickData;
use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream, connect_async, tungstenite::protocol::Message,
};

use redis::AsyncCommands;
use std::collections::HashMap;
use tokio::sync::RwLock;

pub struct TradingViewScraper {
    broadcaster: Arc<Broadcaster>,
    batcher: Arc<Batcher>,
    redis_client: redis::Client,
    lot_sizes: Arc<RwLock<HashMap<String, f64>>>,
}

impl TradingViewScraper {
    pub fn new(
        broadcaster: Arc<Broadcaster>,
        batcher: Arc<Batcher>,
        redis_client: redis::Client,
    ) -> Self {
        Self {
            broadcaster,
            batcher,
            redis_client,
            lot_sizes: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Refresh lot sizes from Redis
    pub async fn refresh_lot_sizes(&self) -> Result<()> {
        let mut conn = self.redis_client.get_multiplexed_tokio_connection().await?;
        let sizes: HashMap<String, String> = conn.hgetall("harvest:lot-sizes").await?;

        let mut cache = self.lot_sizes.write().await;
        for (ticker, size_str) in sizes {
            if let Ok(size) = size_str.parse::<f64>() {
                cache.insert(ticker, size);
            }
        }
        info!("📦 Refreshed {} lot sizes from Redis", cache.len());
        Ok(())
    }

    pub async fn run(&self, symbols: Vec<String>) -> Result<()> {
        // Ensure we have lot sizes for current symbols
        if let Err(e) = self.refresh_lot_sizes().await {
            warn!("⚠️ Failed to refresh lot sizes: {}", e);
        }

        let url = "wss://data.tradingview.com/socket.io/websocket";

        // Scraper setup

        info!("🔗 Connecting to TradingView WebSocket...");
        let mut request = url.into_client_request()?;
        request.headers_mut().insert(
            "Origin",
            HeaderValue::from_static("https://www.tradingview.com"),
        );

        let (mut ws_stream, _) = connect_async(request).await?;
        info!("✅ Connected!");

        // Handshake
        self.send_message(
            &mut ws_stream,
            "set_auth_token",
            vec![Value::String("unauthorized_user_token".to_string())],
        )
        .await?;

        let session_id = format!("qs_{}", rand::random::<u32>());
        self.send_message(
            &mut ws_stream,
            "quote_create_session",
            vec![Value::String(session_id.clone())],
        )
        .await?;

        // Request all fields needed for tick + spread analysis
        self.send_message(
            &mut ws_stream,
            "quote_set_fields",
            vec![
                Value::String(session_id.clone()),
                Value::String("lp".to_string()), // last price
                Value::String("volume".to_string()),
                Value::String("bid".to_string()), // bid price for spread analysis
                Value::String("ask".to_string()), // ask price for spread analysis
            ],
        )
        .await?;

        // Add symbols in chunks of 30 (TradingView limit)
        for chunk in symbols.chunks(30) {
            let mut params = vec![Value::String(session_id.clone())];
            for symbol in chunk {
                params.push(Value::String(symbol.clone()));
            }
            self.send_message(&mut ws_stream, "quote_add_symbols", params)
                .await?;
            debug!("Added chunk of {} symbols", chunk.len());
        }

        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    self.handle_payload(text.to_string(), &mut ws_stream)
                        .await?;
                }
                Ok(Message::Close(_)) => {
                    warn!("WebSocket closed by server");
                    break;
                }
                Err(e) => {
                    error!("WebSocket error: {}", e);
                    return Err(e.into());
                }
                _ => {}
            }
        }

        Ok(())
    }

    async fn handle_payload(
        &self,
        payload: String,
        ws: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
    ) -> Result<()> {
        // TradingView format: ~m~LEN~m~JSON...
        let parts: Vec<&str> = payload.split("~m~").collect();

        for part in parts {
            if part.is_empty() {
                continue;
            }

            // Heartbeat: ~h~ID → echo back
            if part.starts_with("~h~") {
                let h_msg = format!("~m~{}~m~{}", part.len(), part);
                ws.send(Message::Text(h_msg.into())).await?;
                continue;
            }

            // Skip length-only segments
            if part.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<Value>(part)
                && let Some(m) = json.get("m").and_then(|m| m.as_str())
                && m == "qsd"
            {
                self.parse_quote_data(&json).await;
            }
        }
        Ok(())
    }

    async fn parse_quote_data(&self, json: &Value) {
        if let Some(p) = json.get("p").and_then(|p| p.as_array())
            && p.len() >= 2
        {
            let symbol_data = &p[1];
            if let (Some(symbol), Some(v)) = (
                symbol_data.get("n").and_then(|n| n.as_str()),
                symbol_data.get("v"),
            ) {
                let price = v.get("lp").and_then(|lp| lp.as_f64());
                let volume = v.get("volume").and_then(|vol| vol.as_f64());
                let bid = v.get("bid").and_then(|b| b.as_f64()).unwrap_or(0.0);
                let ask = v.get("ask").and_then(|a| a.as_f64()).unwrap_or(0.0);

                if let (Some(price), Some(volume)) = (price, volume) {
                    // Apply lot_size (ADR-0012)
                    let lot_size = {
                        let cache = self.lot_sizes.read().await;
                        *cache.get(symbol).unwrap_or(&1.0)
                    };
                    let final_volume = volume * lot_size;

                    let tick = TickData {
                        symbol: symbol.to_string(),
                        price,
                        volume: final_volume,
                        bid,
                        ask,
                        timestamp: chrono::Utc::now().timestamp(),
                    };

                    info!(
                        "📈 Tick {}: ${:.4} (bid={:.4} ask={:.4} vol={})",
                        tick.symbol, tick.price, tick.bid, tick.ask, tick.volume
                    );

                    // Broadcast ke Redis Pub/Sub (untuk WebSocket clients)
                    let _ = self.broadcaster.broadcast(&tick).await;

                    // Batch ke QuestDB tabel `ticks`
                    let _ = self.batcher.add_tick(tick).await;
                }
            }
        }
    }

    async fn send_message(
        &self,
        ws: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
        method: &str,
        params: Vec<Value>,
    ) -> Result<()> {
        let m = json!({ "m": method, "p": params }).to_string();
        let payload = format!("~m~{}~m~{}", m.len(), m);
        ws.send(Message::Text(payload.into())).await?;
        Ok(())
    }
}
