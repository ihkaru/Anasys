use anyhow::{Result, anyhow};
use log::info;
use crate::types::CandleData;

/// Binance klines API response: array of arrays
/// [open_time, open, high, low, close, volume, close_time, ...]
type BinanceKline = Vec<serde_json::Value>;

pub struct BinanceFetcher {
    client: reqwest::Client,
}

impl BinanceFetcher {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (compatible; AnasysEngine/1.0)")
            .build()
            .unwrap_or_default();
        Self { client }
    }

    /// Fetch OHLCV dari Binance klines API.
    /// symbol: format "BTCUSDT" (tanpa "BINANCE:")
    /// interval: "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"
    /// Binance menyimpan data 1m hingga ~3+ tahun ke belakang — jauh melebihi Yahoo (60 hari).
    pub async fn fetch_candles(
        &self,
        symbol: &str,
        interval: &str,
        start_ms: i64,
        end_ms: i64,
    ) -> Result<Vec<CandleData>> {
        // Binance interval mapping dari format kita ke format Binance
        let binance_interval = self.map_interval(interval)?;

        // Binance limit max 1000 candles per request
        let url = format!(
            "https://api.binance.com/api/v3/klines?symbol={}&interval={}&startTime={}&endTime={}&limit=1000",
            symbol, binance_interval,
            start_ms * 1000,  // Binance pakai milliseconds
            end_ms * 1000,
        );

        info!("📥 Binance fetch: {} ({}) {} → {}", symbol, interval, start_ms, end_ms);

        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Binance API status {}: {}", resp.status(), resp.text().await?));
        }

        let raw: Vec<BinanceKline> = resp.json().await?;

        let mut candles = Vec::with_capacity(raw.len());
        for k in raw {
            // Binance kline format:
            // [0]=open_time(ms), [1]=open, [2]=high, [3]=low, [4]=close, [5]=volume, ...
            if k.len() < 6 { continue; }

            let open_time_ms = k[0].as_i64().unwrap_or(0);
            let open   = k[1].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
            let high   = k[2].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
            let low    = k[3].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
            let close  = k[4].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
            let volume = k[5].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);

            if close <= 0.0 { continue; }

            candles.push(CandleData {
                symbol:    format!("BINANCE_{}", symbol), // konsisten dengan format ILP (no colon)
                interval:  interval.to_string(),
                open,
                high,
                low,
                close,
                volume,
                source:    "BINANCE".to_string(),
                timestamp: open_time_ms / 1000, // konversi ke detik
            });
        }

        info!("✅ Binance: {} candles untuk {} ({})", candles.len(), symbol, interval);
        Ok(candles)
    }

    /// Cek apakah ticker ini adalah Binance symbol (heuristik: diakhiri USDT/BTC/ETH/BNB)
    pub fn is_binance_symbol(ticker: &str) -> bool {
        let t = ticker.to_uppercase();
        // Format: "BINANCE:BTCUSDT" atau sudah di-strip jadi "BTCUSDT"
        let clean = t.trim_start_matches("BINANCE:");
        clean.ends_with("USDT")
            || clean.ends_with("BTC")
            || clean.ends_with("ETH")
            || clean.ends_with("BNB")
            || clean.ends_with("BUSD")
    }

    /// Ekstrak simbol Binance bersih dari format "BINANCE:BTCUSDT" → "BTCUSDT"
    pub fn extract_symbol(ticker: &str) -> String {
        ticker.to_uppercase()
            .trim_start_matches("BINANCE:")
            .to_string()
    }

    fn map_interval(&self, interval: &str) -> Result<&str> {
        match interval {
            "1m"  => Ok("1m"),
            "3m"  => Ok("3m"),
            "5m"  => Ok("5m"),
            "15m" => Ok("15m"),
            "30m" => Ok("30m"),
            "1h"  => Ok("1h"),
            "2h"  => Ok("2h"),
            "4h"  => Ok("4h"),
            "6h"  => Ok("6h"),
            "8h"  => Ok("8h"),
            "12h" => Ok("12h"),
            "1d"  => Ok("1d"),
            "3d"  => Ok("3d"),
            "1w"  => Ok("1w"),
            "1mo" => Ok("1M"),
            other => Err(anyhow!("Interval '{}' tidak didukung oleh Binance", other)),
        }
    }
}
