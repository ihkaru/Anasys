use crate::types::{TickData, CandleData};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{self, Duration};
use log::{error, debug};
use anyhow::Result;
use std::env;

pub struct Batcher {
    tick_buffer:   Arc<Mutex<Vec<TickData>>>,
    candle_buffer: Arc<Mutex<Vec<CandleData>>>,
    flush_interval: u64,
    max_batch_size: usize,
    questdb_url: String,
}

impl Batcher {
    pub fn new(flush_interval: u64, max_batch_size: usize) -> Self {
        let questdb_url = env::var("QUESTDB_URL").unwrap_or_else(|_| "http://questdb:9000".to_string());
        Self {
            tick_buffer:   Arc::new(Mutex::new(Vec::with_capacity(max_batch_size))),
            candle_buffer: Arc::new(Mutex::new(Vec::with_capacity(max_batch_size))),
            flush_interval,
            max_batch_size,
            questdb_url,
        }
    }

    // ─── Tick (real-time) ───────────────────────────────────────────────────

    pub async fn add_tick(&self, tick: TickData) -> Result<()> {
        let mut buf = self.tick_buffer.lock().await;
        buf.push(tick);
        if buf.len() >= self.max_batch_size {
            drop(buf);
            self.flush_ticks().await?;
        }
        Ok(())
    }

    async fn flush_ticks(&self) -> Result<()> {
        let mut buf = self.tick_buffer.lock().await;
        if buf.is_empty() { return Ok(()); }
        let batch: Vec<TickData> = buf.drain(..).collect();
        drop(buf);

        let count = batch.len();
        // ILP format: ticks,symbol=BTCUSDT price=50000.0,volume=1.5,bid=49999.0,ask=50001.0 1234567890000000000
        let mut ilp = String::new();
        for t in batch {
            ilp.push_str(&format!(
                "ticks,symbol={} price={},volume={},bid={},ask={} {}\n",
                t.symbol.replace(':', "_"),
                t.price, t.volume, t.bid, t.ask,
                t.timestamp * 1_000_000_000
            ));
        }

        self.send_ilp(&ilp, count, "ticks").await;
        Ok(())
    }

    // ─── Candle (OHLCV historical) ──────────────────────────────────────────

    pub async fn add_candle(&self, candle: CandleData) -> Result<()> {
        let mut buf = self.candle_buffer.lock().await;
        buf.push(candle);
        if buf.len() >= self.max_batch_size {
            drop(buf);
            self.flush_candles().await?;
        }
        Ok(())
    }

    pub async fn flush_candles(&self) -> Result<()> {
        let mut buf = self.candle_buffer.lock().await;
        if buf.is_empty() { return Ok(()); }
        let batch: Vec<CandleData> = buf.drain(..).collect();
        drop(buf);

        let count = batch.len();
        // ILP format: candles,symbol=AAPL,interval=1d,source=YAHOO open=150.0,high=155.0,low=149.0,close=154.0,volume=80000000 1234567890000000000
        let mut ilp = String::new();
        for c in batch {
            ilp.push_str(&format!(
                "candles,symbol={},interval={},source={} open={},high={},low={},close={},volume={} {}\n",
                c.symbol.replace(':', "_"),
                c.interval,
                c.source,
                c.open, c.high, c.low, c.close, c.volume,
                c.timestamp * 1_000_000_000
            ));
        }

        self.send_ilp(&ilp, count, "candles").await;
        Ok(())
    }

    // ─── Timer (flush both buffers periodically) ────────────────────────────

    pub async fn start_timer(self: Arc<Self>) -> Result<()> {
        let batcher = Arc::clone(&self);
        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(batcher.flush_interval));
            loop {
                interval.tick().await;
                if let Err(e) = batcher.flush_ticks().await {
                    error!("Batcher tick flush error: {}", e);
                }
                if let Err(e) = batcher.flush_candles().await {
                    error!("Batcher candle flush error: {}", e);
                }
            }
        });
        Ok(())
    }

    // ─── Shared HTTP sender ─────────────────────────────────────────────────

    async fn send_ilp(&self, ilp: &str, count: usize, table: &str) {
        let client = reqwest::Client::new();
        let url = format!("{}/write", self.questdb_url);
        match client.post(&url).body(ilp.to_string()).send().await {
            Ok(res) if res.status().is_success() => {
                debug!("✅ Flushed {} rows to QuestDB table `{}`", count, table);
            }
            Ok(res) => {
                error!("QuestDB `{}` error {}: {}", table, res.status(), res.text().await.unwrap_or_default());
            }
            Err(e) => {
                error!("Failed to connect to QuestDB (table: {}): {}", table, e);
            }
        }
    }
}
