use crate::engine::scraper::TickData;
use redis::AsyncCommands;
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::Result;

pub struct Broadcaster {
    redis_client: redis::Client,
    connection: Arc<Mutex<redis::aio::MultiplexedConnection>>,
}

impl Broadcaster {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        // We use a dummy async block to initialize the connection in a non-async constructor
        // But since this is Rust, we usually make New async or use a handle.
        // For simplicity, we'll let main handle the connection if needed, 
        // but MultiplexedConnection is perfect for shared use.
        
        // Actually, let's make a helper to connect.
        Ok(Self {
            redis_client: client.clone(),
            // We'll initialize this properly in a real async context
            connection: Arc::new(Mutex::new(client.get_multiplexed_tokio_connection().await?)),
        })
    }

    pub async fn broadcast(&self, tick: &TickData) -> Result<()> {
        let mut conn = self.connection.lock().await;
        let payload = serde_json::to_string(tick)?;
        
        // Channel 1: Symbol specific (e.g., tick:BINANCE:BTCUSDT)
        let symbol_channel = format!("tick:{}", tick.symbol);
        let _: () = conn.publish(&symbol_channel, &payload).await?;
        
        // Channel 2: Global channel for all ticks
        let _: () = conn.publish("ticks:all", &payload).await?;
        
        Ok(())
    }
}
