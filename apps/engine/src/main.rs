mod backfiller;
mod engine;
mod types;

use engine::batcher::Batcher;
use engine::broadcaster::Broadcaster;
use engine::candle_streamer::CandleStreamer;
use engine::scraper::TradingViewScraper;
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

    let scraper = Arc::new(TradingViewScraper::new(broadcaster, batcher.clone()));

    // ── Candle Streamer (chart session — OHLCV per bar) — ADR-0015 ───────────

    let candle_streamer = Arc::new(CandleStreamer::new(batcher.clone(), &redis_url).await?);
    let cs_symbols = initial_symbols.clone();
    let cs_handle = tokio::spawn(async move {
        loop {
            if let Err(e) = candle_streamer.run(cs_symbols.clone()).await {
                error!("🚨 CandleStreamer error: {} — restarting in 10s", e);
            }
            tokio::time::sleep(Duration::from_secs(10)).await;
        }
    });

    // ── Main: Run scraper + candle streamer + backfiller concurrently ─────────

    tokio::select! {
        res = run_scraper_with_refresh(scraper, redis_client) => {
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

/// Run tick scraper, auto-restart when symbol list changes (every 30s check).
async fn run_scraper_with_refresh(
    scraper: Arc<TradingViewScraper>,
    redis_client: redis::Client,
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

        time::sleep(Duration::from_secs(30)).await;
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
