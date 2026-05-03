pub mod yahoo;
pub mod binance;
pub mod obscura;

use std::sync::Arc;
use tokio::time::{self, Duration};
use tokio::sync::Semaphore;
use log::{info, error, warn};
use crate::engine::batcher::Batcher;
use yahoo::YahooFetcher;
use binance::BinanceFetcher;
use obscura::ObscuraFetcher;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackfillTask {
    id: i32,
    ticker: String,
    interval: String,
    asset_type: String,
    tradingview_symbol: Option<String>,
    tradingview_exchange: Option<String>,
    target_start_date: String,
    last_backfilled_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressReport {
    id: i32,
    last_timestamp: String,
    is_completed: bool,
}

pub struct Backfiller {
    batcher:         Arc<Batcher>,
    yahoo_fetcher:   YahooFetcher,
    binance_fetcher: BinanceFetcher,
    obscura_fetcher: ObscuraFetcher,
    api_url:         String,
    yahoo_semaphore: Semaphore,
}

impl Backfiller {
    pub fn new(batcher: Arc<Batcher>) -> Self {
        let api_url = env::var("API_URL").unwrap_or_else(|_| "http://api:3000/api".to_string());
        Self {
            batcher,
            yahoo_fetcher:   YahooFetcher::new(),
            binance_fetcher: BinanceFetcher::new(),
            obscura_fetcher: ObscuraFetcher::new(),
            api_url,
            yahoo_semaphore: Semaphore::new(1),
        }
    }

    pub async fn run(self: Arc<Self>) {
        info!("🕒 Backfiller service started (Yahoo + Binance + Obscura routing)");
        let mut interval = time::interval(Duration::from_secs(5));

        loop {
            interval.tick().await;
            if let Err(e) = self.clone().process_tasks().await {
                error!("Backfiller error: {}", e);
            }
        }
    }

    async fn process_tasks(self: Arc<Self>) -> anyhow::Result<()> {
        let client = reqwest::Client::new();
        let tasks_url = format!("{}/market/internal/backfill/tasks", self.api_url);

        let resp = client.get(&tasks_url).send().await?;
        if !resp.status().is_success() {
            return Ok(());
        }

        let body: serde_json::Value = resp.json().await?;
        let tasks: Vec<BackfillTask> = serde_json::from_value(body["data"].clone())?;

        if tasks.is_empty() {
            return Ok(());
        }

        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(20)); // EXPERIMENTAL: Full Throttle v2 (20 workers)
        let mut handles = vec![];

        for task in tasks {
            let this = self.clone();
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            
            handles.push(tokio::spawn(async move {
                let _p = permit;
                // Stagger starts within workers
                let jitter = (chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0).abs() % 1000) as u64;
                time::sleep(Duration::from_millis(jitter)).await;

                if let Err(e) = this.process_single_task(task).await {
                    let err_msg = e.to_string();
                    if err_msg.contains("RATE_LIMIT") {
                        log::warn!("🛑 GLOBAL Rate limit hit. Cooling down for 30 seconds...");
                        time::sleep(Duration::from_secs(30)).await;
                    }
                    error!("Task failed: {}", err_msg);
                }
            }));
        }

        futures_util::future::join_all(handles).await;

        Ok(())
    }

    async fn process_single_task(&self, task: BackfillTask) -> anyhow::Result<()> {
        info!("🚀 Backfill task: {} ({}) [source routing...]", task.ticker, task.interval);

        let end_ts = match &task.last_backfilled_at {
            Some(ts) => chrono::DateTime::parse_from_rfc3339(ts)?.timestamp(),
            None     => chrono::Utc::now().timestamp(),
        };

        let now = chrono::Utc::now().timestamp();
        let start_date = chrono::DateTime::parse_from_rfc3339(&task.target_start_date)?;
        let mut start_ts = start_date.timestamp();

        // Yahoo limits: 15m/5m/1m have strict lookback limits
        if task.interval == "15m" || task.interval == "5m" || task.interval == "1m" {
            let sixty_days_ago = now - (60 * 24 * 60 * 60);
            if start_ts < sixty_days_ago {
                start_ts = sixty_days_ago;
            }
        }

        let chunk_size = match task.interval.as_str() {
            "1d" => 365 * 24 * 60 * 60, // 1 year
            "1h" => 30 * 24 * 60 * 60,  // 30 days
            _    => 7 * 24 * 60 * 60,   // 7 days for intraday
        };

        let current_end   = end_ts;
        let current_start = (current_end - chunk_size).max(start_ts);

        if current_end <= start_ts {
            log::info!("  → Task {} ({}) range reached limit or start date. Marking as completed.", task.ticker, task.interval);
            self.report_progress(task.id, &task.target_start_date, true).await?;
            return Ok(());
        }

        let result = if BinanceFetcher::is_binance_symbol(&task.ticker) {
            let clean = BinanceFetcher::extract_symbol(&task.ticker);
            info!("  → Source: Binance ({})", clean);
            self.binance_fetcher
                .fetch_candles(&clean, &task.interval, current_start, current_end)
                .await
        } else if ObscuraFetcher::is_tradingview_target(&task.ticker, &task.interval) {
            info!("  → Source: Obscura (TradingView Stealth)");
            
            let override_tv = if let (Some(s), Some(e)) = (&task.tradingview_symbol, &task.tradingview_exchange) {
                Some(format!("{}:{}", e, s))
            } else {
                None
            };

            let ws_res = self.obscura_fetcher
                .fetch_candles(&task.ticker, &task.interval, &task.asset_type, override_tv, current_start, current_end)
                .await;
            
            match ws_res {
                Ok(c) if !c.is_empty() => Ok(c),
                _ => {
                    warn!("  → Obscura failed/empty for {}. Falling back to Yahoo...", task.ticker);
                    let _permit = self.yahoo_semaphore.acquire().await.unwrap();
                    let res = self.yahoo_fetcher
                        .fetch_candles(&task.ticker, &task.interval, current_start, current_end)
                        .await;
                    
                    // Yahoo Cooling Period: Avoid 429 even with semaphore
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    res
                }
            }
        } else {
            info!("  → Source: Yahoo ({})", task.ticker);
            let _permit = self.yahoo_semaphore.acquire().await.unwrap();
            let res = self.yahoo_fetcher
                .fetch_candles(&task.ticker, &task.interval, current_start, current_end)
                .await;
            
            // Yahoo Cooling Period
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            res
        };

        match result {
            Ok(candles) => {
                let count = candles.len();
                let earliest_ts = candles.iter().map(|c| c.timestamp).min();

                for candle in candles {
                    self.batcher.add_candle(candle).await?;
                }

                // If we fetched 0 candles, we STILL mark the last_ts as current_start
                // so the pointer moves backwards and eventually reaches target_start.
                let is_done = current_start <= start_ts;

                let last_ts = match earliest_ts {
                    Some(ts) => chrono::DateTime::from_timestamp(ts, 0)
                        .unwrap_or_default().to_rfc3339(),
                    None     => chrono::DateTime::from_timestamp(current_start, 0)
                        .unwrap_or_default().to_rfc3339(),
                };

                info!("✅ Backfilled {} OHLCV candles for {}. Done={}", count, task.ticker, is_done);
                let _ = self.report_progress(task.id, &last_ts, is_done).await;
            }
            Err(e) => {
                let err_msg = e.to_string();
                error!("❌ Backfill failed for {}: {}", task.ticker, err_msg);
                
                if err_msg.contains("404") || err_msg.contains("No data found") || err_msg.contains("delisted") {
                    log::warn!("⚠️ Symbol {} seems delisted or has no data. Marking as completed.", task.ticker);
                    let _ = self.report_progress(task.id, &task.target_start_date, true).await;
                } else if err_msg.contains("429") || err_msg.contains("Rate Limit") {
                    log::warn!("🛑 Yahoo 429 detected for {}. Cooling down worker for 10 seconds...", task.ticker);
                    tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                } else {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                }
            }
        }

        Ok(())
    }

    async fn report_progress(&self, id: i32, last_timestamp: &str, is_completed: bool) -> anyhow::Result<()> {
        let client = reqwest::Client::new();
        let report_url = format!("{}/market/internal/backfill/report", self.api_url);
        let report = ProgressReport { id, last_timestamp: last_timestamp.to_string(), is_completed };
        client.post(&report_url).json(&report).send().await?;
        Ok(())
    }
}
