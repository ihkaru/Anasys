use crate::backfiller::obscura::ObscuraFetcher;
use crate::engine::batcher::Batcher;
use anyhow::Result;
use log::{error, info};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::time::{Duration, sleep};

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskRequest {
    pub id: String,
    pub command: String,
    pub payload: serde_json::Value,
}

pub struct TaskWorker {
    redis_client: redis::Client,
    obscura: Arc<ObscuraFetcher>,
    batcher: Arc<Batcher>,
}

impl TaskWorker {
    pub fn new(redis_client: redis::Client, batcher: Arc<Batcher>) -> Self {
        Self {
            redis_client,
            obscura: Arc::new(ObscuraFetcher::new()),
            batcher,
        }
    }

    pub async fn run(&self) -> Result<()> {
        info!("👷 TaskWorker started (listening for on-demand tasks...)");
        let mut conn = self.redis_client.get_multiplexed_tokio_connection().await?;

        loop {
            // Use BLPOP to wait for tasks (low latency, low CPU)
            let task_raw: Option<(String, String)> = conn.blpop("harvest:tasks:queue", 5.0).await?;

            if let Some((_, json_str)) = task_raw {
                if let Ok(task) = serde_json::from_str::<TaskRequest>(&json_str) {
                    info!("📥 Received task: {} (id: {})", task.command, task.id);
                    let worker_self = self.clone_for_task();
                    tokio::spawn(async move {
                        if let Err(e) = worker_self.handle_task(task).await {
                            error!("🚨 Task failed: {}", e);
                        }
                    });
                }
            }
        }
    }

    fn clone_for_task(&self) -> TaskWorkerClone {
        TaskWorkerClone {
            redis_client: self.redis_client.clone(),
            obscura: Arc::clone(&self.obscura),
            batcher: Arc::clone(&self.batcher),
        }
    }

    async fn handle_task(self, task: TaskRequest) -> Result<()> {
        match task.command.as_str() {
            "ohlcv" | "ohlcv_direct" => {
                let ticker = task.payload["ticker"].as_str().unwrap_or_default();
                let interval = task.payload["interval"].as_str().unwrap_or("1d");
                let asset_type = task.payload["assetType"].as_str().unwrap_or("STOCK");
                let start = task.payload["start"].as_i64().unwrap_or(0);
                let end = task.payload["end"].as_i64().unwrap_or(0);
                let is_direct = task.command == "ohlcv_direct";

                info!(
                    "📈 Executing on-demand OHLCV for {} ({}) - Direct: {}",
                    ticker, interval, is_direct
                );

                let fetch_result = self
                    .obscura
                    .fetch_candles(ticker, interval, asset_type, None, start, end)
                    .await;

                match fetch_result {
                    Ok((candles, _meta)) => {
                        if !candles.is_empty() {
                            let candles_clone = candles.clone();

                            // 🚀 OPTIMIZATION: Send response immediately to Redis
                            // This unblocks the API/Benchmark while we persist data in background
                            if is_direct {
                                self.send_response(&task.id, &candles_clone).await?;
                            }

                            // Background persistence
                            let batcher = Arc::clone(&self.batcher);
                            tokio::spawn(async move {
                                for candle in candles {
                                    let _ = batcher.add_candle(candle).await;
                                }
                                let _ = batcher.flush_candles().await;
                            });

                            if is_direct {
                                return Ok(());
                            }
                        } else if is_direct {
                            return self
                                .send_response(&task.id, Vec::<crate::types::CandleData>::new())
                                .await;
                        }
                    }
                    Err(e) => {
                        error!("🚨 fetch_candles failed for {}: {}", ticker, e);
                        if is_direct {
                            let err_payload = serde_json::json!({ "error": e.to_string() });
                            return self.send_response(&task.id, err_payload).await;
                        }
                    }
                }

                Ok(())
            }
            "search" => {
                let query = task.payload["query"].as_str().unwrap_or_default();
                let limit = task.payload["limit"].as_u64().unwrap_or(10) as usize;

                let start = std::time::Instant::now();
                let results = self.obscura.search_multi(query, limit).await?;
                let duration = start.elapsed();
                log::info!("Task [search] for '{}' took {:?}", query, duration);

                self.send_response(&task.id, results).await
            }
            "quote" => {
                let tickers: Vec<String> = task.payload["tickers"]
                    .as_array()
                    .unwrap_or(&vec![])
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();

                let start = std::time::Instant::now();
                let results = self.obscura.fetch_batch_quotes(tickers).await?;
                let duration = start.elapsed();
                log::info!(
                    "Task [quote] for {} tickers took {:?}",
                    task.payload["tickers"]
                        .as_array()
                        .map(|a| a.len())
                        .unwrap_or(0),
                    duration
                );

                self.send_response(&task.id, results).await
            }
            "movers" => {
                let market = task.payload["market"].as_str().unwrap_or("stocks-usa");
                let category = task.payload["category"].as_str().unwrap_or("gainers");
                let limit = task.payload["limit"].as_u64().unwrap_or(20) as usize;

                let start = std::time::Instant::now();
                let results = self.obscura.fetch_movers(market, category, limit).await?;
                let duration = start.elapsed();
                log::info!("Task [movers] for {} took {:?}", category, duration);

                self.send_response(&task.id, results).await
            }
            _ => {
                error!("❓ Unknown task command: {}", task.command);
                Ok(())
            }
        }
    }

    async fn send_response<T: Serialize>(&self, task_id: &str, data: T) -> Result<()> {
        let mut conn = self.redis_client.get_multiplexed_tokio_connection().await?;
        let response_key = format!("harvest:tasks:response:{}", task_id);
        let response_json = serde_json::to_string(&data)?;

        // Push result and set expiration (30s is plenty for a synchronous request)
        let _: () = conn.rpush(&response_key, response_json).await?;
        let _: () = conn.expire(&response_key, 30).await?;

        info!("📤 Sent response for task: {}", task_id);
        Ok(())
    }
}

// Minimal clone helper
struct TaskWorkerClone {
    redis_client: redis::Client,
    obscura: Arc<ObscuraFetcher>,
    batcher: Arc<Batcher>,
}

impl TaskWorkerClone {
    async fn handle_task(self, task: TaskRequest) -> Result<()> {
        let worker = TaskWorker {
            redis_client: self.redis_client,
            obscura: self.obscura,
            batcher: self.batcher,
        };
        worker.handle_task(task).await
    }
}
