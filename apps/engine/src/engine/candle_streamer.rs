use crate::engine::batcher::Batcher;
use crate::engine::redis_stream::RedisStream;
use crate::types::CandleData;
use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::time::{Duration, sleep, timeout};
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream, connect_async, tungstenite::client::IntoClientRequest,
    tungstenite::http::HeaderValue, tungstenite::protocol::Message,
};

/// Maximum chart sessions per single WebSocket connection.
/// TradingView unofficially tolerates ~50 before throttling.
const MAX_SESSIONS_PER_CONN: usize = 50;

/// Intervals we stream in real-time. Add more as needed.
const STREAMING_INTERVALS: &[&str] = &["1m", "5m", "15m", "1h"];

/// State for one chart session (one symbol × interval pair).
#[derive(Debug, Clone)]
struct SessionState {
    ticker: String,
    interval: String,
    /// Unix timestamp (seconds) of the last bar we wrote to QuestDB/Redis.
    /// Used to detect when the "forming" candle closes (new bar opened).
    last_closed_ts: i64,
    /// The last forming (incomplete) candle seen in `du` messages.
    forming: Option<CandleData>,
}

/// CandleStreamer — TradingView Chart Session Multiplexer (ADR-0015).
///
/// Maintains N persistent WebSocket connections, each carrying ≤ MAX_SESSIONS_PER_CONN
/// chart sessions. Each session streams 1m (and configurable other intervals) OHLCV
/// candle updates via TradingView's `du` (data update) push messages.
///
/// On detecting a CLOSED candle (bar timestamp advances):
/// - Writes to QuestDB via Batcher (ILP)
/// - Publishes to Redis Streams `stream:candles:{interval}` (ADR-0015)
pub struct CandleStreamer {
    batcher: Arc<Batcher>,
    redis_stream: Arc<RedisStream>,
    lot_sizes: Arc<HashMap<String, i64>>,
}

impl CandleStreamer {
    pub async fn new(batcher: Arc<Batcher>, redis_url: &str) -> Result<Self> {
        let redis_stream = Arc::new(RedisStream::new(redis_url).await?);

        // Fetch lot sizes from Redis hash once at startup
        let client = redis::Client::open(redis_url)?;
        let mut conn = client.get_multiplexed_tokio_connection().await?;

        let lot_sizes_raw: HashMap<String, String> = redis::cmd("HGETALL")
            .arg("harvest:lot-sizes")
            .query_async(&mut conn)
            .await
            .unwrap_or_default();

        let mut lot_sizes = HashMap::new();
        for (ticker, size) in lot_sizes_raw {
            if let Ok(val) = size.parse::<i64>() {
                lot_sizes.insert(ticker, val);
            }
        }

        info!(
            "[CandleStreamer] Loaded {} lot size metadata entries from Redis",
            lot_sizes.len()
        );

        Ok(Self {
            batcher,
            redis_stream,
            lot_sizes: Arc::new(lot_sizes),
        })
    }

    /// Entry point — called from main.rs.
    /// `symbols` is a Vec of canonical TradingView ticker strings (e.g. "NASDAQ:AAPL").
    pub async fn run(&self, symbols: Vec<String>) -> Result<()> {
        if symbols.is_empty() {
            info!("[CandleStreamer] No symbols to stream. Waiting...");
            loop {
                sleep(Duration::from_secs(60)).await;
            }
        }

        info!(
            "[CandleStreamer] Starting for {} symbols across {} intervals",
            symbols.len(),
            STREAMING_INTERVALS.len()
        );

        // Build (symbol, interval) pairs to stream
        let pairs: Vec<(String, String)> = symbols
            .iter()
            .flat_map(|s| {
                STREAMING_INTERVALS
                    .iter()
                    .map(move |i| (s.clone(), i.to_string()))
            })
            .collect();

        // Split into buckets of MAX_SESSIONS_PER_CONN
        let buckets: Vec<Vec<(String, String)>> = pairs
            .chunks(MAX_SESSIONS_PER_CONN)
            .map(|c| c.to_vec())
            .collect();

        info!(
            "[CandleStreamer] Spawning {} WS connections ({} sessions each max)",
            buckets.len(),
            MAX_SESSIONS_PER_CONN
        );

        let mut handles = vec![];
        for (idx, bucket) in buckets.into_iter().enumerate() {
            // ── Staggered Startup Delay (ADR-0021) ───────────────────────────
            // Wait 500ms between each bucket spawn to avoid simultaneous handshakes
            sleep(Duration::from_millis(500)).await;

            let batcher = Arc::clone(&self.batcher);
            let rs = Arc::clone(&self.redis_stream);
            let lot_sizes = Arc::clone(&self.lot_sizes);

            let handle = tokio::spawn(async move {
                let mut fail_count = 0;
                loop {
                    info!(
                        "[CandleStreamer] WS-{} connecting ({} sessions)...",
                        idx,
                        bucket.len()
                    );
                    let ls = Arc::clone(&lot_sizes);
                    match run_ws_connection(
                        idx,
                        bucket.clone(),
                        Arc::clone(&batcher),
                        Arc::clone(&rs),
                        ls,
                    )
                    .await
                    {
                        Ok(_) => {
                            warn!(
                                "[CandleStreamer] WS-{} disconnected cleanly — reconnecting",
                                idx
                            );
                            fail_count = 0; // Reset on clean disconnect
                        }
                        Err(e) => {
                            fail_count += 1;
                            error!(
                                "[CandleStreamer] WS-{} error: {} — attempt #{}",
                                idx, e, fail_count
                            );
                        }
                    }

                    // ── Exponential Backoff with Jitter (ADR-0021) ───────────
                    // 5s, 15s, 30s, max 60s. Plus +/- 2s jitter.
                    let backoff_secs = match fail_count {
                        0 => 5,
                        1 => 15,
                        2 => 30,
                        _ => 60,
                    };

                    let jitter = (rand::random::<f64>() * 4.0) - 2.0; // -2.0 to +2.0
                    let wait_dur = Duration::from_secs_f64(backoff_secs as f64 + jitter);

                    warn!(
                        "[CandleStreamer] WS-{} waiting {:.1}s before retry...",
                        idx,
                        wait_dur.as_secs_f64()
                    );
                    sleep(wait_dur).await;
                }
            });
            handles.push(handle);
        }

        // Wait for any connection to exit (they self-restart, so this only fires on panic)
        for h in handles {
            let _ = h.await;
        }
        Ok(())
    }
}

/// Runs one WebSocket connection carrying all sessions in `bucket`.
/// Returns Err on unrecoverable error, Ok on clean disconnect (both trigger reconnect in caller).
async fn run_ws_connection(
    conn_idx: usize,
    bucket: Vec<(String, String)>,
    batcher: Arc<Batcher>,
    redis_stream: Arc<RedisStream>,
    lot_sizes: Arc<HashMap<String, i64>>,
) -> Result<()> {
    let url = "wss://data.tradingview.com/socket.io/websocket";
    let mut request = url.into_client_request()?;
    request.headers_mut().insert(
        "Origin",
        HeaderValue::from_static("https://www.tradingview.com"),
    );
    request.headers_mut().insert(
        "User-Agent",
        HeaderValue::from_static(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ),
    );

    let (mut ws, _) = connect_async(request).await?;
    info!("[CandleStreamer] WS-{} connected", conn_idx);

    // Auth
    send_tv(
        &mut ws,
        "set_auth_token",
        vec![json!("unauthorized_user_token")],
    )
    .await?;
    sleep(Duration::from_millis(100)).await;

    // session_id → SessionState lookup
    let mut sessions: HashMap<String, SessionState> = HashMap::new();

    // Create one chart_create_session per (symbol, interval) pair
    for (symbol, interval) in &bucket {
        let session_id = format!("cs_{:08x}", rand::random::<u32>());

        send_tv(
            &mut ws,
            "chart_create_session",
            vec![json!(session_id), json!("")],
        )
        .await?;
        sleep(Duration::from_millis(50)).await;

        let symbol_json = json!({
            "symbol": symbol,
            "adjustment": "splits"
        })
        .to_string();

        send_tv(
            &mut ws,
            "resolve_symbol",
            vec![
                json!(session_id),
                json!("sds_sym_1"),
                json!(format!("={}", symbol_json)),
            ],
        )
        .await?;
        sleep(Duration::from_millis(50)).await;

        let tv_interval = to_tv_interval(interval);
        send_tv(
            &mut ws,
            "create_series",
            vec![
                json!(session_id),
                json!("sds_1"),
                json!("s1"),
                json!("sds_sym_1"),
                json!(tv_interval),
                json!(2), // We only need last 2 bars for close detection
            ],
        )
        .await?;
        sleep(Duration::from_millis(30)).await;

        sessions.insert(
            session_id,
            SessionState {
                ticker: symbol.clone(),
                interval: interval.clone(),
                last_closed_ts: 0,
                forming: None,
            },
        );
    }

    info!(
        "[CandleStreamer] WS-{} subscribed to {} chart sessions",
        conn_idx,
        sessions.len()
    );

    // Main receive loop
    loop {
        match timeout(Duration::from_secs(30), ws.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                handle_message(
                    text.to_string(),
                    &mut sessions,
                    &mut ws,
                    &batcher,
                    &redis_stream,
                    &lot_sizes,
                )
                .await?;
            }
            Ok(Some(Ok(Message::Close(_)))) => {
                warn!("[CandleStreamer] WS-{} received Close frame", conn_idx);
                break;
            }
            Ok(Some(Err(e))) => {
                return Err(e.into());
            }
            Ok(None) => {
                warn!("[CandleStreamer] WS-{} stream ended", conn_idx);
                break;
            }
            Err(_) => {
                // Timeout — send ping to keep alive
                ws.send(Message::Ping(vec![].into())).await?;
            }
            _ => {}
        }
    }

    Ok(())
}

/// Parse TradingView framed messages and route to appropriate handlers.
async fn handle_message(
    payload: String,
    sessions: &mut HashMap<String, SessionState>,
    ws: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
    batcher: &Arc<Batcher>,
    redis_stream: &Arc<RedisStream>,
    lot_sizes: &HashMap<String, i64>,
) -> Result<()> {
    let parts: Vec<&str> = payload.split("~m~").collect();
    for part in parts {
        if part.is_empty() || part.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }

        // Heartbeat echo
        if part.starts_with("~h~") {
            let echo = format!("~m~{}~m~{}", part.len(), part);
            ws.send(Message::Text(echo.into())).await?;
            continue;
        }

        if let Ok(json) = serde_json::from_str::<Value>(part) {
            let m = match json["m"].as_str() {
                Some(m) => m,
                None => continue,
            };

            match m {
                "du" => {
                    // Data update — may contain new closed candle
                    if let Some(session_id) = json["p"][0].as_str() {
                        if let Some(session) = sessions.get_mut(session_id) {
                            process_du(&json, session, batcher, redis_stream, lot_sizes).await;
                        }
                    }
                }
                "timescale_update" => {
                    // Initial bulk — just seed the last_closed_ts so we don't
                    // re-emit historical candles that backfiller already wrote
                    if let Some(session_id) = json["p"][0].as_str() {
                        if let Some(session) = sessions.get_mut(session_id) {
                            seed_last_ts(&json, session);
                        }
                    }
                }
                "critical_error" | "symbol_error" | "series_error" => {
                    error!("[CandleStreamer] TV error for session: {} — {}", m, json);
                }
                _ => {}
            }
        }
    }
    Ok(())
}

/// Seed `last_closed_ts` from the initial `timescale_update` batch.
/// This prevents re-emitting all historical candles on connect.
fn seed_last_ts(json: &Value, session: &mut SessionState) {
    let bars = match json["p"][1]["sds_1"]["s"].as_array() {
        Some(b) => b,
        None => return,
    };

    let max_ts = bars
        .iter()
        .filter_map(|b| b["v"][0].as_f64())
        .map(|ts| ts as i64)
        .max()
        .unwrap_or(0);

    if max_ts > session.last_closed_ts {
        session.last_closed_ts = max_ts;
        debug!(
            "[CandleStreamer] Seeded {}/{} last_ts={}",
            session.ticker, session.interval, max_ts
        );
    }
}

/// Process a `du` (data update) message and emit closed candles.
///
/// TradingView sends `du` whenever the forming bar is updated.
/// When the bar TIMESTAMP ADVANCES (new minute opens), the PREVIOUS bar is now CLOSED.
///
/// We detect this by comparing bar timestamps to `last_closed_ts`.
async fn process_du(
    json: &Value,
    session: &mut SessionState,
    batcher: &Arc<Batcher>,
    redis_stream: &Arc<RedisStream>,
    lot_sizes: &HashMap<String, i64>,
) {
    let bars = match json["p"][0]["sds_1"]["s"].as_array() {
        Some(b) => b,
        None => return,
    };

    // Parse all bars in this update
    let parsed: Vec<CandleData> = bars
        .iter()
        .filter_map(|b| {
            let v = b["v"].as_array()?;
            Some(CandleData {
                symbol: session.ticker.clone(),
                interval: session.interval.clone(),
                timestamp: floor_timestamp(v.first()?.as_f64()? as i64, &session.interval),
                open: v.get(1)?.as_f64()?,
                high: v.get(2)?.as_f64()?,
                low: v.get(3)?.as_f64()?,
                close: v.get(4)?.as_f64()?,
                adj_close: v.get(4)?.as_f64()?,
                volume: v.get(5)?.as_f64().unwrap_or(0.0),
                source: "TRADINGVIEW".to_string(),
            })
        })
        .collect();

    if parsed.is_empty() {
        return;
    }

    // Sort by timestamp ascending
    let mut sorted = parsed;
    sorted.sort_by_key(|c| c.timestamp);

    // The LAST bar is the forming (incomplete) candle.
    // All bars BEFORE the last AND with timestamp > last_closed_ts are newly CLOSED.
    let forming_ts = sorted.last().map(|c| c.timestamp).unwrap_or(0);

    for candle in &sorted {
        if candle.timestamp > session.last_closed_ts && candle.timestamp < forming_ts {
            // This bar is CLOSED — emit it
            let lot_size = *lot_sizes.get(&candle.symbol).unwrap_or(&1);
            emit_closed_candle(candle, batcher, redis_stream, lot_size).await;
            session.last_closed_ts = candle.timestamp;
        }
    }

    // Update forming candle reference (for debugging / future use)
    session.forming = sorted.into_iter().last();
}

/// Write a confirmed-closed candle to QuestDB and Redis Streams.
async fn emit_closed_candle(
    candle: &CandleData,
    batcher: &Arc<Batcher>,
    redis_stream: &Arc<RedisStream>,
    lot_size: i64,
) {
    let normalized_volume = candle.volume * (lot_size as f64);

    info!(
        "🕯️  CLOSED {}/{} ts={} O={} H={} L={} C={} V={} (norm={})",
        candle.symbol,
        candle.interval,
        candle.timestamp,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
        normalized_volume
    );

    // Create a copy with normalized volume for persistence
    let mut normalized_candle = candle.clone();
    normalized_candle.volume = normalized_volume;

    // 1. Persist to QuestDB via Batcher (ILP)
    if let Err(e) = batcher.add_candle(normalized_candle).await {
        error!("Batcher.add_candle failed for {}: {}", candle.symbol, e);
    }

    // 2. Publish to Redis Stream for alert engine
    if let Err(e) = redis_stream
        .publish_candle(
            &candle.symbol,
            &candle.interval,
            candle.open,
            candle.high,
            candle.low,
            candle.close,
            normalized_volume,
            candle.timestamp,
        )
        .await
    {
        error!(
            "RedisStream.publish_candle failed for {}: {}",
            candle.symbol, e
        );
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn to_tv_interval(interval: &str) -> &str {
    match interval {
        "1m" => "1",
        "3m" => "3",
        "5m" => "5",
        "15m" => "15",
        "30m" => "30",
        "1h" => "60",
        "2h" => "120",
        "4h" => "240",
        "1d" => "D",
        "1wk" => "W",
        _ => interval,
    }
}

fn floor_timestamp(ts: i64, interval: &str) -> i64 {
    match interval {
        "1m" => ts - (ts % 60),
        "5m" => ts - (ts % 300),
        "15m" => ts - (ts % 900),
        "30m" => ts - (ts % 1800),
        "1h" => ts - (ts % 3600),
        "1d" => ts - (ts % 86400),
        _ => ts,
    }
}

async fn send_tv(
    ws: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
    method: &str,
    params: Vec<Value>,
) -> Result<()> {
    let m = json!({ "m": method, "p": params }).to_string();
    let payload = format!("~m~{}~m~{}", m.len(), m);
    ws.send(Message::Text(payload.into())).await?;
    Ok(())
}
