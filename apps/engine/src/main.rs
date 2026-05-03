mod backfiller;
mod engine;
mod types;

use engine::batcher::Batcher;
use engine::broadcaster::Broadcaster;
use engine::candle_streamer::CandleStreamer;
use engine::scraper::TradingViewScraper;
use futures_util::StreamExt;
use log::{error, info, warn};
use std::collections::HashSet;
use std::env;
use std::sync::Arc;
use tokio::time::{self, Duration};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // Initialise Rustls crypto provider (must be called exactly once)
    let _ = rustls::crypto::ring::default_provider().install_default();

    info!("🚀 Starting Anasys Performance Engine...");

    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let questdb_url =
        env::var("QUESTDB_URL").unwrap_or_else(|_| "http://127.0.0.1:9000".to_string());

    info!("🔗 Redis: {}", redis_url);
    info!("📊 QuestDB: {}", questdb_url);

    // ── Shared Components ────────────────────────────────────────────────────

    let broadcaster = Arc::new(Broadcaster::new(&redis_url).await?);
    let batcher = Arc::new(Batcher::new(5, 1000)); // flush every 5s or 1000 items
    batcher.clone().start_timer().await?;

    // ── Heartbeat (Docker health-check) ──────────────────────────────────────

    tokio::spawn(async move {
        loop {
            let now = chrono::Utc::now().to_rfc3339();
            if let Err(e) = std::fs::write("/tmp/heartbeat.txt", now) {
                error!("🚨 Heartbeat write failed: {}", e);
            }
            time::sleep(Duration::from_secs(10)).await;
        }
    });

    // ── Backfiller (historical gap-fill — runs continuously) ─────────────────

    let backfiller = Arc::new(backfiller::Backfiller::new(batcher.clone()));
    let backfiller_batcher = batcher.clone();
    let backfiller_handle = tokio::spawn(async move {
        if let Err(e) = backfiller.run(backfiller_batcher).await {
            error!("🚨 Backfiller fatal: {}", e);
        }
    });

    // ── Symbol List (from Redis, fallback to env) ─────────────────────────────

    let redis_client = redis::Client::open(redis_url.as_str())?;
    let mut redis_conn = redis_client.get_multiplexed_tokio_connection().await?;
    let initial_symbols = fetch_active_symbols(&mut redis_conn)
        .await
        .unwrap_or_else(|_| {
            warn!("⚠️  Redis symbol list empty, falling back to env ANASYS_SCRAPE_SYMBOLS");
            env::var("ANASYS_SCRAPE_SYMBOLS")
                .unwrap_or_else(|_| "BINANCE:BTCUSDT,BINANCE:ETHUSDT,FX:EURUSD".to_string())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        });

    // ── Sequential Warmup: let backfiller get a head-start ───────────────────
    info!("🕒 Warmup: 10s delay before real-time scrapers start...");
    tokio::time::sleep(Duration::from_secs(10)).await;

    info!(
        "📡 Starting real-time scrapers for {} symbols",
        initial_symbols.len()
    );

    // ── Tick Scraper (quote session — lp/bid/ask) ─────────────────────────────

    let scraper = Arc::new(TradingViewScraper::new(
        Arc::clone(&broadcaster),
        Arc::clone(&batcher),
        redis_client.clone(),
    ));

    // ── Instant Refresh Trigger (ADR-0012/G2) ────────────────────────────────
    let refresh_trigger = Arc::new(tokio::sync::Notify::new());

    // ── Candle Streamer (chart session — OHLCV per bar) — ADR-0015 ───────────
    let candle_streamer = Arc::new(CandleStreamer::new(batcher.clone(), &redis_url).await?);
    let cs_trigger = refresh_trigger.clone();
    let cs_redis_client = redis_client.clone();
    let cs_streamer_ref = candle_streamer.clone();
    let cs_handle = tokio::spawn(async move {
        if let Err(e) =
            run_candle_streamer_with_refresh(cs_streamer_ref, cs_redis_client, cs_trigger).await
        {
            error!("🚨 CandleStreamer fatal: {}", e);
        }
    });

    // Redis Pub/Sub Listener for INGEST-PENDING signals
    let pubsub_client = redis_client.clone();
    let pubsub_trigger = refresh_trigger.clone();
    tokio::spawn(async move {
        match pubsub_client.get_async_connection().await {
            Ok(conn) => {
                let mut pubsub = conn.into_pubsub();
                if let Err(e) = pubsub.subscribe("harvest:ingest-pending").await {
                    error!("🚨 Redis PubSub subscribe failed: {}", e);
                    return;
                }
                info!("🔔 Listening for instant INGEST-PENDING signals...");

                let mut stream = pubsub.on_message();
                while let Some(msg) = stream.next().await {
                    let ticker: String = msg.get_payload().unwrap_or_default();
                    if !ticker.is_empty() {
                        info!(
                            "⚡ Instant signal received for: {}. Triggering refresh.",
                            ticker
                        );
                        pubsub_trigger.notify_one();
                    }
                }
            }
            Err(e) => error!("🚨 Redis PubSub connection failed: {}", e),
        }
    });

    // ── Main: Run scraper + candle streamer + backfiller concurrently ─────────

    tokio::select! {
        res = run_scraper_with_refresh(scraper, redis_client, refresh_trigger) => {
            if let Err(e) = res {
                error!("🚨 Tick scraper crashed: {}", e);
            }
        }
        _ = cs_handle => {
            error!("🚨 CandleStreamer stopped unexpectedly");
        }
        _ = backfiller_handle => {
            error!("🚨 Backfiller stopped unexpectedly");
        }
    }

    Ok(())
}

/// Run tick scraper, auto-restart when symbol list changes (every 30s check or instant trigger).
async fn run_scraper_with_refresh(
    scraper: Arc<TradingViewScraper>,
    redis_client: redis::Client,
    refresh_trigger: Arc<tokio::sync::Notify>,
) -> anyhow::Result<()> {
    let mut current_handle: Option<tokio::task::JoinHandle<()>> = None;
    let mut last_symbols: HashSet<String> = HashSet::new();

    loop {
        let mut redis_conn = redis_client.get_multiplexed_tokio_connection().await?;
        let current_symbols = fetch_active_symbols(&mut redis_conn)
            .await
            .unwrap_or_else(|_| {
                env::var("ANASYS_SCRAPE_SYMBOLS")
                    .unwrap_or_default()
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            });

        let current_set: HashSet<String> = current_symbols.iter().cloned().collect();

        if current_set != last_symbols {
            info!(
                "🔄 Symbol list changed ({} symbols). Restarting tick scraper...",
                current_symbols.len()
            );

            if let Some(handle) = current_handle.take() {
                handle.abort();
            }

            last_symbols = current_set;
            let symbols = current_symbols.clone();
            let scraper_ref = Arc::clone(&scraper);
            let handle = tokio::spawn(async move {
                if let Err(e) = scraper_ref.run(symbols).await {
                    error!("Tick scraper error: {}", e);
                }
            });
            current_handle = Some(handle);
        }

        // Wait for 30s OR instant trigger
        tokio::select! {
            _ = time::sleep(Duration::from_secs(30)) => {},
            _ = refresh_trigger.notified() => {
                info!("⚡ Instant refresh triggered via Pub/Sub");
            }
        }
    }
}

/// Run candle streamer, auto-restart when symbol list changes.
async fn run_candle_streamer_with_refresh(
    streamer: Arc<CandleStreamer>,
    redis_client: redis::Client,
    refresh_trigger: Arc<tokio::sync::Notify>,
) -> anyhow::Result<()> {
    let mut current_handle: Option<tokio::task::JoinHandle<()>> = None;
    let mut last_symbols: HashSet<String> = HashSet::new();

    loop {
        let mut redis_conn = redis_client.get_multiplexed_tokio_connection().await?;
        let current_symbols = fetch_active_symbols(&mut redis_conn)
            .await
            .unwrap_or_default();

        let current_set: HashSet<String> = current_symbols.iter().cloned().collect();

        if current_set != last_symbols && !current_symbols.is_empty() {
            info!(
                "🔄 Symbol list changed for CandleStreamer ({} symbols). Restarting...",
                current_symbols.len()
            );

            if let Some(handle) = current_handle.take() {
                handle.abort();
            }

            last_symbols = current_set;
            let symbols = current_symbols.clone();
            let streamer_ref = Arc::clone(&streamer);
            let handle = tokio::spawn(async move {
                if let Err(e) = streamer_ref.run(symbols).await {
                    error!("CandleStreamer error: {}", e);
                }
            });
            current_handle = Some(handle);
        }

        tokio::select! {
            _ = time::sleep(Duration::from_secs(60)) => {}, // CandleStreamer check less frequent than ticks
            _ = refresh_trigger.notified() => {
                info!("⚡ CandleStreamer instant refresh triggered");
            }
        }
    }
}

/// Fetch symbol list from Redis Set `harvest:realtime:symbols`.
async fn fetch_active_symbols(
    conn: &mut redis::aio::MultiplexedConnection,
) -> anyhow::Result<Vec<String>> {
    let members: Vec<String> = redis::cmd("SMEMBERS")
        .arg("harvest:realtime:symbols")
        .query_async(conn)
        .await?;
    Ok(members)
}
