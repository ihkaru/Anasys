use crate::backfiller::binance::BinanceFetcher;
use crate::backfiller::obscura::ObscuraFetcher;
use crate::backfiller::yahoo::YahooFetcher;
use crate::engine::batcher::Batcher;
use crate::types::BackfillTask;
use anyhow::Result;
use log::{debug, error, info, warn};
use std::env;
use std::sync::Arc;
use tokio::sync::Semaphore;

pub mod binance;
pub mod obscura;
pub mod yahoo;

pub struct Backfiller {
    yahoo_fetcher: YahooFetcher,
    binance_fetcher: BinanceFetcher,
    obscura_fetcher: ObscuraFetcher,
    api_url: String,
    yahoo_semaphore: Semaphore,
    obscura_semaphore: Semaphore,
}

impl Backfiller {
    pub fn new(_batcher: Arc<Batcher>) -> Self {
        let api_url = env::var("API_URL").unwrap_or_else(|_| "http://api:3000/api".to_string());
        Self {
            yahoo_fetcher: YahooFetcher::new(),
            binance_fetcher: BinanceFetcher::new(),
            obscura_fetcher: ObscuraFetcher::new(),
            api_url,
            yahoo_semaphore: Semaphore::new(5),
            obscura_semaphore: Semaphore::new(20),
        }
    }

    pub async fn run(self: Arc<Self>, batcher: Arc<Batcher>) -> Result<()> {
        info!("🕒 Backfiller service started (Yahoo + Binance + Obscura routing)");

        loop {
            let tasks = match self.fetch_tasks().await {
                Ok(t) => t,
                Err(e) => {
                    error!("Failed to fetch tasks: {}", e);
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    continue;
                }
            };

            if tasks.is_empty() {
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                continue;
            }

            info!("📂 Processing batch of {} tasks...", tasks.len());

            let mut handles = vec![];
            for task in tasks {
                let this = Arc::clone(&self);
                let b = Arc::clone(&batcher);
                handles.push(tokio::spawn(async move {
                    if let Err(e) = this.process_single_task(task, b).await {
                        error!("Task error: {}", e);
                    }
                }));
            }

            for h in handles {
                let _ = h.await;
            }
        }
    }

    async fn fetch_tasks(&self) -> Result<Vec<BackfillTask>> {
        let client = reqwest::Client::new();
        // Correct path for backfill tasks
        let url = format!("{}/market/internal/backfill/tasks?limit=20", self.api_url);
        let resp = client.get(&url).send().await?;
        let json_val: serde_json::Value = resp.json().await?;

        // Extract from { success: true, data: [...] }
        if let Some(data) = json_val.get("data") {
            let tasks: Vec<BackfillTask> = serde_json::from_value(data.clone())?;
            return Ok(tasks);
        }

        Ok(vec![])
    }

    async fn process_single_task(&self, task: BackfillTask, batcher: Arc<Batcher>) -> Result<()> {
        let now = chrono::Utc::now().timestamp();
        let start_date = chrono::DateTime::parse_from_rfc3339(&task.target_start_date)?;
        let start_ts = start_date.timestamp();

        // Removed hardcoded safe limits to allow deep 2018 backfilling
        // Logic will now follow the target_start_date from database strictly.

        let chunk_size = match task.interval.as_str() {
            "1m" => 7 * 24 * 60 * 60,
            "5m" => 30 * 24 * 60 * 60,
            "15m" => 90 * 24 * 60 * 60,
            "30m" => 180 * 24 * 60 * 60,
            _ => 365 * 24 * 60 * 60,
        };
        let current_end = now;
        let current_start = (current_end - chunk_size).max(start_ts);

        if current_end <= start_ts {
            info!(
                "  → Task {} ({}) finished. Reporting done.",
                task.ticker, task.interval
            );
            self.report_progress(task.id, &task.target_start_date, true, None)
                .await?;
            return Ok(());
        }

        let disable_obscura = std::env::var("DISABLE_OBSCURA").unwrap_or_default() == "true";
        let is_tradingview = ObscuraFetcher::is_tradingview_target(&task.ticker, &task.interval);
        let use_obscura = !disable_obscura && is_tradingview;

        let result = if BinanceFetcher::is_binance_symbol(&task.ticker) {
            let clean = BinanceFetcher::extract_symbol(&task.ticker);
            info!("  → Source: Binance ({})", clean);
            self.binance_fetcher
                .fetch_candles(&clean, &task.interval, current_start, current_end)
                .await
        } else if use_obscura {
            info!("  → Source: Obscura (TradingView) for {}", task.ticker);
            let override_tv = if let (Some(s), Some(e)) =
                (&task.tradingview_symbol, &task.tradingview_exchange)
            {
                Some(format!("{}:{}", e, s))
            } else {
                None
            };

            let ws_res = {
                let _permit = self.obscura_semaphore.acquire().await.unwrap();
                self.obscura_fetcher
                    .fetch_candles(
                        &task.ticker,
                        &task.interval,
                        &task.asset_type,
                        override_tv,
                        current_start,
                        current_end,
                    )
                    .await
            };

            match ws_res {
                Ok((c, meta)) if !c.is_empty() => {
                    // Send with metadata
                    if !c.is_empty() {
                        let count = c.len();
                        for candle in c {
                            batcher.add_candle(candle).await?;
                        }
                        batcher.flush_candles().await?;
                        info!(
                            "✅ Saved {} candles for {} ({}). Reporting progress with metadata...",
                            count, task.ticker, task.interval
                        );
                        self.report_progress(task.id, &task.target_start_date, false, meta)
                            .await?;
                        return Ok(()); // Done for this cycle
                    }
                    Ok(vec![]) // Should not happen due to guard
                }
                _ => {
                    warn!(
                        "  → Obscura failed/empty for {}. Falling back to Yahoo...",
                        task.ticker
                    );
                    let _permit = self.yahoo_semaphore.acquire().await.unwrap();
                    self.yahoo_fetcher
                        .fetch_candles(&task.ticker, &task.interval, current_start, current_end)
                        .await
                }
            }
        } else {
            info!("  → Source: Yahoo for {}", task.ticker);
            let _permit = self.yahoo_semaphore.acquire().await.unwrap();
            self.yahoo_fetcher
                .fetch_candles(&task.ticker, &task.interval, current_start, current_end)
                .await
        };

        match result {
            Ok(candles) => {
                if !candles.is_empty() {
                    let count = candles.len();
                    for c in candles {
                        batcher.add_candle(c).await?;
                    }
                    batcher.flush_candles().await?;
                    info!(
                        "✅ Saved {} candles for {} ({}). Reporting progress...",
                        count, task.ticker, task.interval
                    );
                    self.report_progress(task.id, &task.target_start_date, false, None)
                        .await?;
                } else {
                    warn!("  → No data found for {} ({})", task.ticker, task.interval);
                    self.report_progress(task.id, &task.target_start_date, true, None)
                        .await?;
                }
            }
            Err(e) => {
                error!(
                    "  → Fetch failed for {} ({}): {}",
                    task.ticker, task.interval, e
                );
            }
        }

        Ok(())
    }

    async fn report_progress(
        &self,
        task_id: i32,
        last_date: &str,
        done: bool,
        metadata: Option<serde_json::Value>,
    ) -> Result<()> {
        let client = reqwest::Client::new();
        let url = format!("{}/market/internal/backfill/report", self.api_url);

        debug!(
            "📤 Sending progress to {}: task_id={}, done={}, has_metadata={}",
            url,
            task_id,
            done,
            metadata.is_some()
        );

        let mut body = serde_json::json!({
            "id": task_id,
            "lastTimestamp": last_date,
            "isCompleted": done
        });

        if let Some(meta) = metadata {
            body["metadata"] = meta;
        }

        let resp = client.post(&url).json(&body).send().await?;

        if resp.status().is_success() {
            info!("📈 Progress reported for task {} (done={})", task_id, done);
        } else {
            let err_body = resp.text().await.unwrap_or_default();
            warn!(
                "⚠️ Progress report FAILED for task {}: {} - {}",
                task_id, last_date, err_body
            );
        }
        Ok(())
    }
}
