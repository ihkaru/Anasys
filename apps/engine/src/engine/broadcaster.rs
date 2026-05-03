use crate::types::TickData;
use anyhow::Result;
use redis::AsyncCommands;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct Broadcaster {
    connection: Arc<Mutex<redis::aio::MultiplexedConnection>>,
}

impl Broadcaster {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        Ok(Self {
            connection: Arc::new(Mutex::new(client.get_multiplexed_tokio_connection().await?)),
        })
    }

    pub async fn broadcast(&self, tick: &TickData) -> Result<()> {
        let mut conn = self.connection.lock().await;
        let payload = serde_json::to_string(tick)?;

        // Channel spesifik per simbol: "tick:BINANCE_BTCUSDT"
        let symbol_channel = format!("tick:{}", tick.symbol);
        let _: () = conn.publish(&symbol_channel, &payload).await?;

        // Global channel: semua ticks dalam satu stream
        let _: () = conn.publish("ticks:all", &payload).await?;

        Ok(())
    }
}
