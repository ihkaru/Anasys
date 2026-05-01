mod engine;
mod backfiller;
mod types;

use engine::scraper::TradingViewScraper;
use engine::broadcaster::Broadcaster;
use engine::batcher::Batcher;
use log::{info, warn, error};
use std::env;
use std::sync::Arc;
use std::collections::HashSet;
use tokio::time::{self, Duration};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    
    info!("🚀 Starting Anasys Performance Engine...");

    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    
    // 1. Initialize Components
    let broadcaster = Arc::new(Broadcaster::new(&redis_url).await?);
    let batcher     = Arc::new(Batcher::new(5, 1000)); // Flush every 5s or 1000 items
    
    // Start batcher background timer (flushes both ticks and candles)
    batcher.clone().start_timer().await?;

    // 2. Start Backfiller (background task)
    let backfiller = Arc::new(backfiller::Backfiller::new(batcher.clone()));
    let backfiller_handle = tokio::spawn(async move {
        backfiller.run().await;
    });

    // 3. Dynamic symbol list via Redis Set
    //    Fallback ke env var ANASYS_SCRAPE_SYMBOLS untuk kompatibilitas backward
    let redis_client = redis::Client::open(redis_url.as_str())?;
    let mut redis_conn = redis_client.get_multiplexed_tokio_connection().await?;

    let initial_symbols = fetch_active_symbols(&mut redis_conn).await
        .unwrap_or_else(|_| {
            warn!("⚠️  Redis symbol list empty, falling back to ANASYS_SCRAPE_SYMBOLS env var");
            env::var("ANASYS_SCRAPE_SYMBOLS")
                .unwrap_or_else(|_| "BINANCE:BTCUSDT,BINANCE:ETHUSDT,FX:EURUSD".to_string())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        });

    info!("📡 Starting real-time scraper for {} symbols...", initial_symbols.len());

    // 4. Scraper berjalan dalam loop dengan dynamic symbol refresh setiap 30 detik
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
        let current_symbols = fetch_active_symbols(&mut redis_conn).await
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
            info!("🔄 Symbol list changed ({} symbols). Restarting scraper...", current_symbols.len());
            
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
