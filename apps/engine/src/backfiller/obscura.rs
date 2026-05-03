use crate::types::CandleData;
use anyhow::{Result, anyhow};
use futures_util::{SinkExt, StreamExt};
use log::{debug, info, warn};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::{sleep, timeout};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

pub struct ObscuraFetcher {
    symbol_cache: RwLock<HashMap<String, String>>,
}

impl ObscuraFetcher {
    pub fn new() -> Self {
        Self {
            symbol_cache: RwLock::new(HashMap::new()),
        }
    }

    pub async fn search_symbol(&self, ticker: &str, expected_type: &str) -> Result<String> {
        let cache_key = format!("{}:{}", expected_type, ticker);
        {
            let cache = self.symbol_cache.read().await;
            if let Some(canonical) = cache.get(&cache_key) {
                return Ok(canonical.clone());
            }
        }

        let url = format!(
            "https://symbol-search.tradingview.com/symbol_search/v3/?text={}",
            ticker
        );
        let client = reqwest::Client::new();

        let resp = client.get(&url)
            .header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .header("Origin", "https://www.tradingview.com")
            .header("Referer", "https://www.tradingview.com/")
            .send().await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Search API failed: {}", resp.status()));
        }

        let body: Value = resp.json().await?;
        let symbols = body["symbols"]
            .as_array()
            .ok_or_else(|| anyhow!("No symbols in search response"))?;

        if symbols.is_empty() {
            return Err(anyhow!(
                "Symbol not found in TradingView search: {}",
                ticker
            ));
        }

        // Search for a matching type first (e.g. stock, forex, crypto)
        let normalized_type = expected_type.to_lowercase();
        let best_match = symbols
            .iter()
            .find(|s| {
                let tv_type = s["type"].as_str().unwrap_or("").to_lowercase();
                tv_type.contains(&normalized_type) || normalized_type.contains(&tv_type)
            })
            .unwrap_or(&symbols[0]);

        let symbol_name = best_match["symbol"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing symbol field"))?;
        let exchange = best_match["exchange"]
            .as_str()
            .or_else(|| best_match["source_id"].as_str())
            .unwrap_or("");

        let final_symbol = if exchange.is_empty() {
            symbol_name.to_string()
        } else {
            format!("{}:{}", exchange, symbol_name)
        };

        // Simpan ke memori (cache)
        let mut cache = self.symbol_cache.write().await;
        cache.insert(cache_key, final_symbol.clone());

        Ok(final_symbol)
    }

    pub async fn fetch_candles(
        &self,
        ticker: &str,
        interval: &str,
        asset_type: &str,
        override_canonical: Option<String>,
        start: i64,
        _end: i64,
    ) -> Result<(Vec<CandleData>, Option<Value>)> {
        info!("📥 Institutional Fetch (WS): {} ({})", ticker, interval);

        // 1. RESOLVE CANONICAL SYMBOL
        let canonical_symbol = match override_canonical {
            Some(c) => c,
            None => match self.search_symbol(ticker, asset_type).await {
                Ok(s) => {
                    info!("  → Resolved {} to canonical: {}", ticker, s);
                    s
                }
                Err(e) => {
                    warn!("  → Search failed for {}: {}. Using raw ticker.", ticker, e);
                    ticker.to_string()
                }
            },
        };

        // 2. CONNECT WEBSOCKET
        let url = "wss://data.tradingview.com/socket.io/websocket";
        let mut request = url.into_client_request()?;
        request.headers_mut().insert(
            "Origin",
            HeaderValue::from_static("https://www.tradingview.com"),
        );
        request.headers_mut().insert("User-Agent", HeaderValue::from_static("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"));

        let (mut ws, _) = connect_async(request).await?;
        debug!("  → WS Connected for {}", canonical_symbol);

        let ts = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
        let chart_session = format!("cs_{}", (ts.abs() % 100_000_000));

        self.send(
            &mut ws,
            "set_auth_token",
            vec![json!("unauthorized_user_token")],
        )
        .await?;
        sleep(Duration::from_millis(50)).await;

        self.send(
            &mut ws,
            "chart_create_session",
            vec![json!(chart_session), json!("")],
        )
        .await?;
        sleep(Duration::from_millis(50)).await;

        let symbol_json = json!({ "symbol": canonical_symbol, "adjustment": "splits" }).to_string();
        self.send(
            &mut ws,
            "resolve_symbol",
            vec![
                json!(chart_session),
                json!("sds_sym_1"),
                json!(format!("={}", symbol_json)),
            ],
        )
        .await?;
        sleep(Duration::from_millis(50)).await;

        let tv_interval = match interval {
            "1m" => "1",
            "5m" => "5",
            "15m" => "15",
            "30m" => "30",
            "1h" => "60",
            "1d" => "D",
            _ => interval,
        };

        self.send(
            &mut ws,
            "create_series",
            vec![
                json!(chart_session),
                json!("sds_1"),
                json!("s1"),
                json!("sds_sym_1"),
                json!(tv_interval),
                json!(10000),
            ],
        )
        .await?;

        debug!(
            "  → Subscriptions sent for {}. Awaiting data...",
            canonical_symbol
        );

        let mut candles = Vec::new();
        let mut symbol_metadata: Option<Value> = None;
        let mut timeout_retry = 0;
        let mut loaded_all = false;

        loop {
            match timeout(Duration::from_secs(10), ws.next()).await {
                Ok(Some(msg)) => {
                    let text = match msg? {
                        Message::Text(t) => t,
                        _ => continue,
                    };

                    if text.starts_with("~h~") {
                        let _ = ws
                            .send(Message::Text(
                                format!("~m~{}~m~{}", text.len(), text).into(),
                            ))
                            .await;
                        continue;
                    }

                    if let Some(json) = self.parse_payload(&text)
                        && let Some(m) = json["m"].as_str() {
                            if m == "timescale_update" || m == "du" {
                                let p = &json["p"];
                                let series_data = if m == "timescale_update" {
                                    p[1]["sds_1"]["s"].as_array()
                                } else {
                                    p[0]["sds_1"]["s"].as_array()
                                };

                                if let Some(plots) = series_data {
                                    for plot in plots {
                                        if let Some(row) = plot["v"].as_array() {
                                            candles.push(CandleData {
                                                symbol: ticker.to_string(),
                                                interval: interval.to_string(),
                                                timestamp: row.first()
                                                    .and_then(|v| v.as_f64())
                                                    .unwrap_or(0.0)
                                                    as i64,
                                                open: row
                                                    .get(1)
                                                    .and_then(|v| v.as_f64())
                                                    .unwrap_or(0.0),
                                                high: row
                                                    .get(2)
                                                    .and_then(|v| v.as_f64())
                                                    .unwrap_or(0.0),
                                                low: row
                                                    .get(3)
                                                    .and_then(|v| v.as_f64())
                                                    .unwrap_or(0.0),
                                                close: row
                                                    .get(4)
                                                    .and_then(|v| v.as_f64())
                                                    .unwrap_or(0.0),
                                                volume: row
                                                    .get(5)
                                                    .and_then(|v| v.as_f64())
                                                    .unwrap_or(0.0),
                                                source: "TRADINGVIEW".to_string(),
                                            });
                                        }
                                    }

                                    let oldest_ts = candles
                                        .iter()
                                        .map(|c| c.timestamp)
                                        .min()
                                        .unwrap_or(i64::MAX);
                                    if oldest_ts > start && !loaded_all && candles.len() < 500_000 {
                                        debug!(
                                            "  → {} needs more data (oldest: {} > target: {}). Requesting 10k more...",
                                            ticker, oldest_ts, start
                                        );
                                        self.send(
                                            &mut ws,
                                            "request_more_data",
                                            vec![
                                                json!(chart_session),
                                                json!("sds_1"),
                                                json!(10000),
                                            ],
                                        )
                                        .await?;
                                    } else {
                                        loaded_all = true;
                                        break;
                                    }
                                }
                            } else if m == "symbol_resolved" {
                                let p = &json["p"];
                                let details = &p[2];
                                symbol_metadata = Some(json!({
                                    "name": details["description"].as_str(),
                                    "exchange": details["exchange"].as_str(),
                                    "type": details["type"].as_str(),
                                    "currency": details["currency_code"].as_str(),
                                    "tradingview_symbol": details["symbol"].as_str(),
                                    "tradingview_exchange": details["exchange"].as_str(),
                                }));
                                debug!(
                                    "  → Metadata resolved for {}: {:?}",
                                    ticker, symbol_metadata
                                );
                            } else if m == "critical_error" || m == "error" || m == "symbol_error" {
                                warn!("  → Obscura WS error for {}: {}", ticker, m);
                                break;
                            }
                        }
                }
                Ok(None) => break,
                Err(_) => {
                    timeout_retry += 1;
                    if timeout_retry > 1 {
                        break;
                    }
                }
            }
        }

        let raw_count = candles.len();
        candles.retain(|c| c.timestamp >= start);
        candles.sort_by_key(|c| c.timestamp);

        if !candles.is_empty() {
            info!(
                "✅ Obscura (WS): {}/{} candles (start: {}) untuk {} ({})",
                candles.len(),
                raw_count,
                candles.first().map(|c| c.timestamp).unwrap_or(0),
                ticker,
                interval
            );
        }

        Ok((candles, symbol_metadata))
    }

    async fn send(
        &self,
        ws: &mut tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        method: &str,
        params: Vec<Value>,
    ) -> Result<()> {
        let m = json!({ "m": method, "p": params }).to_string();
        let payload = format!("~m~{}~m~{}", m.len(), m);
        ws.send(Message::Text(payload.into())).await?;
        Ok(())
    }

    fn parse_payload(&self, text: &str) -> Option<Value> {
        let parts: Vec<&str> = text.split("~m~").collect();
        for part in parts {
            if part.is_empty()
                || part.chars().all(|c| c.is_ascii_digit())
                || part.starts_with("~h~")
            {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<Value>(part) {
                return Some(json);
            }
        }
        None
    }

    pub fn is_tradingview_target(ticker: &str, interval: &str) -> bool {
        let intraday = ["1m", "5m", "15m", "30m", "1h"].contains(&interval);
        let is_crypto = ticker.starts_with("BINANCE:") || ticker.contains("USDT");
        intraday && !is_crypto
    }
}
