mod engine;
mod backfiller;

use engine::scraper::TradingViewScraper;
use engine::broadcaster::Broadcaster;
use engine::batcher::Batcher;
use log::{info, error};
use std::env;
use std::sync::Arc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    
    info!("🚀 Starting Anasys Performance Engine...");

    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    
    // 1. Initialize Components
    let broadcaster = Arc::new(Broadcaster::new(&redis_url).await?);
    let batcher = Arc::new(Batcher::new(5, 1000)); // Flush every 5s or 1000 ticks
    
    // Start the batcher background timer
    batcher.clone().start_timer().await?;

    // 2. Define symbols (from env or fallback)
    let symbols_env = env::var("ANASYS_SCRAPE_SYMBOLS")
        .unwrap_or_else(|_| "BINANCE:BTCUSDT,BINANCE:ETHUSDT,FX:EURUSD".to_string());
    
    let symbols: Vec<String> = symbols_env
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    // 3. Start Backfiller (in background)
    let backfiller = Arc::new(backfiller::Backfiller::new(batcher.clone()));
    let backfiller_handle = tokio::spawn(async move {
        backfiller.run().await;
    });

    // 4. Start Scraper
    let scraper = TradingViewScraper::new(broadcaster, batcher);
    
    info!("📡 Monitoring {} symbols...", symbols.len());
    
    // Run scraper and backfiller (scraper is blocking, so we await both if needed)
    tokio::select! {
        res = scraper.run(symbols) => {
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
