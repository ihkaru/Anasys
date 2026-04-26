pub mod yahoo;

use std::sync::Arc;
use tokio::time::{self, Duration};
use log::{info, error, warn};
use crate::engine::batcher::Batcher;
use yahoo::YahooFetcher;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackfillTask {
    id: i32,
    symbol_id: i32,
    ticker: String,
    interval: String,
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
    batcher: Arc<Batcher>,
    fetcher: YahooFetcher,
    api_url: String,
}

impl Backfiller {
    pub fn new(batcher: Arc<Batcher>) -> Self {
        let api_url = env::var("API_URL").unwrap_or_else(|_| "http://api:3000".to_string());
        Self {
            batcher,
            fetcher: YahooFetcher::new(),
            api_url,
        }
    }

    pub async fn run(self: Arc<Self>) {
        info!("🕒 Backfiller service started");
        let mut interval = time::interval(Duration::from_secs(5)); // Check tasks every 5 seconds

        loop {
            interval.tick().await;
            if let Err(e) = self.process_tasks().await {
                error!("Backfiller error: {}", e);
            }
        }
    }

    async fn process_tasks(&self) -> anyhow::Result<()> {
        let client = reqwest::Client::new();
        let tasks_url = format!("{}/market/internal/backfill/tasks", self.api_url);

        let resp = client.get(&tasks_url).send().await?;
        if !resp.status().is_success() {
            return Ok(()); // Silently wait
        }

        let body: serde_json::Value = resp.json().await?;
        let tasks: Vec<BackfillTask> = serde_json::from_value(body["data"].clone())?;

        if tasks.is_empty() {
            return Ok(());
        }

        for task in tasks {
            info!("🚀 Processing backfill task for {} ({})", task.ticker, task.interval);
            
            // Determine range
            let end_ts = match &task.last_backfilled_at {
                Some(ts) => chrono::DateTime::parse_from_rfc3339(ts)?.timestamp(),
                None => chrono::Utc::now().timestamp(),
            };

            let start_date = chrono::DateTime::parse_from_rfc3339(&task.target_start_date)?;
            let start_ts = start_date.timestamp();

            // Fetch in chunks of ~1 year to avoid Yahoo limits or huge memory usage
            let chunk_size = 365 * 24 * 60 * 60; // 1 year
            let current_end = end_ts;
            let current_start = (current_end - chunk_size).max(start_ts);

            if current_end <= start_ts {
                self.report_progress(task.id, &task.target_start_date, true).await?;
                continue;
            }

            match self.fetcher.fetch_candles(&task.ticker, &task.interval, current_start, current_end).await {
                Ok(ticks) => {
                    let count = ticks.len();
                    let earliest_ts = ticks.iter().map(|t| t.timestamp).min();

                    for tick in ticks {
                        self.batcher.add_tick(tick).await?;
                    }

                    info!("✅ Backfilled {} ticks for {}. New progress: {}", count, task.ticker, current_start);

                    let is_done = current_start <= start_ts || count == 0;
                    
                    // Report progress back to API
                    let last_ts = match earliest_ts {
                        Some(ts) => chrono::DateTime::from_timestamp(ts, 0).unwrap().to_rfc3339(),
                        None => chrono::DateTime::from_timestamp(current_start, 0).unwrap().to_rfc3339(),
                    };

                    self.report_progress(task.id, &last_ts, is_done).await?;
                }
                Err(e) => {
                    error!("Failed to backfill {}: {}", task.ticker, e);
                }
            }

            // Sleep a bit between tasks to be nice to Yahoo
            time::sleep(Duration::from_secs(2)).await;
        }

        Ok(())
    }

    async fn report_progress(&self, id: i32, last_timestamp: &str, is_completed: bool) -> anyhow::Result<()> {
        let client = reqwest::Client::new();
        let report_url = format!("{}/market/internal/backfill/report", self.api_url);

        let report = ProgressReport {
            id,
            last_timestamp: last_timestamp.to_string(),
            is_completed,
        };

        client.post(&report_url).json(&report).send().await?;
        Ok(())
    }
}
