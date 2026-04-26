use crate::engine::scraper::TickData;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{self, Duration};
use log::{info, error, debug};
use anyhow::Result;
use std::env;

pub struct Batcher {
    buffer: Arc<Mutex<Vec<TickData>>>,
    flush_interval: u64,
    max_batch_size: usize,
    questdb_url: String,
}

impl Batcher {
    pub fn new(flush_interval: u64, max_batch_size: usize) -> Self {
        let questdb_url = env::var("QUESTDB_URL").unwrap_or_else(|_| "http://questdb:9000".to_string());
        Self {
            buffer: Arc::new(Mutex::new(Vec::with_capacity(max_batch_size))),
            flush_interval,
            max_batch_size,
            questdb_url,
        }
    }

    pub async fn add_tick(&self, tick: TickData) -> Result<()> {
        let mut buf = self.buffer.lock().await;
        buf.push(tick);

        if buf.len() >= self.max_batch_size {
            drop(buf); // Release lock before flushing
            self.flush().await?;
        }
        Ok(())
    }

    pub async fn start_timer(self: Arc<Self>) -> Result<()> {
        let batcher = Arc::clone(&self);
        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(batcher.flush_interval));
            loop {
                interval.tick().await;
                if let Err(e) = batcher.flush().await {
                    error!("Batcher timer flush error: {}", e);
                }
            }
        });
        Ok(())
    }

    pub async fn flush(&self) -> Result<()> {
        let mut buf = self.buffer.lock().await;
        if buf.is_empty() {
            return Ok(());
        }

        let ticks_to_flush: Vec<TickData> = buf.drain(..).collect();
        drop(buf); // Release lock while doing IO

        let count = ticks_to_flush.len();
        
        // Convert to QuestDB ILP (InfluxDB Line Protocol) format
        // Format: table_name,symbol=BTCUSDT price=50000.0,volume=1.5 timestamp_nanos
        let mut ilp_data = String::new();
        for tick in ticks_to_flush {
            let line = format!(
                "ticks,symbol={} price={},volume={} {}\n",
                tick.symbol.replace(":", "_"), // QuestDB ILP doesn't like colons in tags if not handled
                tick.price,
                tick.volume,
                tick.timestamp * 1_000_000_000 // Convert to nanos
            );
            ilp_data.push_str(&line);
        }

        // Send to QuestDB via REST ILP
        let client = reqwest::Client::new();
        let url = format!("{}/write", self.questdb_url);
        
        match client.post(&url).body(ilp_data).send().await {
            Ok(res) if res.status().is_success() => {
                debug!("Successfully flushed {} ticks to QuestDB", count);
            }
            Ok(res) => {
                error!("QuestDB returned error {}: {}", res.status(), res.text().await.unwrap_or_default());
            }
            Err(e) => {
                error!("Failed to connect to QuestDB at {}: {}", url, e);
            }
        }

        Ok(())
    }
}
