mod backfiller;
mod engine;
mod types;

use engine::batcher::Batcher;
use engine::broadcaster::Broadcaster;
use engine::scraper::TradingViewScraper;
use log::{error, info, warn};
use std::collections::HashSet;
use std::env;
use std::sync::Arc;
use tokio::time::{self, Duration};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // 2. Inisialisasi Rustls Crypto Provider (MANDATORY: panggil tepat 1x untuk mencegah panic)
    let _ = rustls::crypto::ring::default_provider().install_default();

    info!("🚀 Starting Anasys Performance Engine...");

    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());

    // 1. Initialize Components
    info!("🔗 Connecting to Redis at {}...", redis_url);
    let broadcaster = Arc::new(Broadcaster::new(&redis_url).await?);

    let questdb_url =
        env::var("QUESTDB_URL").unwrap_or_else(|_| "http://127.0.0.1:9000".to_string());
    info!("📊 QuestDB API: {}", questdb_url);

    let batcher = Arc::new(Batcher::new(5, 1000)); // Flush every 5s or 1000 items

    // Start batcher background timer (flushes both ticks and candles)
    batcher.clone().start_timer().await?;

    // 2. Heartbeat task for Docker Healthcheck
    tokio::spawn(async move {
        loop {
            let now = chrono::Utc::now().to_rfc3339();
            if let Err(e) = std::fs::write("/tmp/heartbeat.txt", now) {
                error!("🚨 Failed to write heartbeat: {}", e);
            }
            time::sleep(Duration::from_secs(10)).await;
        }
    });

    // 3. Start Backfiller (background task)
    let backfiller = Arc::new(backfiller::Backfiller::new(batcher.clone()));
    let backfiller_batcher = batcher.clone();
    let backfiller_handle = tokio::spawn(async move {
        if let Err(e) = backfiller.run(backfiller_batcher).await {
            error!("🚨 Backfiller fatal error: {}", e);
        }
    });

    // 4. Dynamic symbol list via Redis Set
    //    Fallback ke env var ANASYS_SCRAPE_SYMBOLS untuk kompatibilitas backward
    let redis_client = redis::Client::open(redis_url.as_str())?;
    let mut redis_conn = redis_client.get_multiplexed_tokio_connection().await?;

    let initial_symbols = fetch_active_symbols(&mut redis_conn)
        .await
        .unwrap_or_else(|_| {
            warn!("⚠️  Redis symbol list empty, falling back to ANASYS_SCRAPE_SYMBOLS env var");
            env::var("ANASYS_SCRAPE_SYMBOLS")
                .unwrap_or_else(|_| "BINANCE:BTCUSDT,BINANCE:ETHUSDT,FX:EURUSD".to_string())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        });

    // 5. Sequential Warmup: Tunda scraper agar backfiller punya headstart (mencegah TLS collision)
    info!("🕒 Sequential Warmup: Delaying real-time scraper for 10s...");
    tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

    info!(
        "📡 Starting real-time scraper for {} symbols...",
        initial_symbols.len()
    );

    // 5. Scraper berjalan dalam loop dengan dynamic symbol refresh setiap 30 detik
    //    Jika symbol list berubah (user tambah watchlist), scraper restart dengan list baru.
    let scraper = Arc::new(TradingViewScraper::new(broadcaster, batcher));

    tokio::select! {
        res = run_scraper_with_refresh(scraper, redis_client) => {
            if let Err(e) = res {
                error!("🚨 Scraper crashed: {}", e);
            }
        }
        _ = backfiller_handle => {
            error!("🚨 Backfiller stopped unexpectedly");
        }
    }

    Ok(())
}

/// Jalankan scraper, restart otomatis jika symbol list berubah atau koneksi putus.
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
                "🔄 Symbol list changed ({} symbols). Restarting scraper...",
                current_symbols.len()
            );

            // Hentikan scraper yang lama jika ada
            if let Some(handle) = current_handle.take() {
                handle.abort();
            }

            last_symbols = current_set;
            let symbols = current_symbols.clone();
            let scraper_ref = Arc::clone(&scraper);

            // Jalankan scraper di background
            let handle = tokio::spawn(async move {
                if let Err(e) = scraper_ref.run(symbols).await {
                    error!("Scraper error: {}", e);
                }
            });
            current_handle = Some(handle);
        }

        // Tunggu 30 detik untuk pengecekan berikutnya
        time::sleep(Duration::from_secs(30)).await;
    }
}

/// Ambil symbol list dari Redis Set `harvest:realtime:symbols`.
async fn fetch_active_symbols(
    conn: &mut redis::aio::MultiplexedConnection,
) -> anyhow::Result<Vec<String>> {
    let members: Vec<String> = redis::cmd("SMEMBERS")
        .arg("harvest:realtime:symbols")
        .query_async(conn)
        .await?;
    Ok(members)
}
