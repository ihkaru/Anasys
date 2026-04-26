use serde::Deserialize;
use anyhow::{Result, anyhow};
use log::{info, error};
use chrono::{DateTime, Utc};

#[derive(Debug, Deserialize)]
pub struct YahooChartResponse {
    pub chart: YahooChartResult,
}

#[derive(Debug, Deserialize)]
pub struct YahooChartResult {
    pub result: Option<Vec<YahooResultItem>>,
    pub error: Option<YahooError>,
}

#[derive(Debug, Deserialize)]
pub struct YahooResultItem {
    pub timestamp: Vec<i64>,
    pub indicators: YahooIndicators,
}

#[derive(Debug, Deserialize)]
pub struct YahooIndicators {
    pub quote: Vec<YahooQuote>,
}

#[derive(Debug, Deserialize)]
pub struct YahooQuote {
    pub open: Vec<Option<f64>>,
    pub high: Vec<Option<f64>>,
    pub low: Vec<Option<f64>>,
    pub close: Vec<Option<f64>>,
    pub volume: Vec<Option<f64>>,
}

#[derive(Debug, Deserialize)]
pub struct YahooError {
    pub code: String,
    pub description: String,
}

pub struct YahooFetcher {
    client: reqwest::Client,
}

impl YahooFetcher {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .unwrap_or_default();
        Self { client }
    }

    pub async fn fetch_candles(
        &self,
        ticker: &str,
        interval: &str,
        start: i64,
        end: i64,
    ) -> Result<Vec<crate::engine::scraper::TickData>> {
        let url = format!(
            "https://query1.finance.yahoo.com/v8/finance/chart/{}?period1={}&period2={}&interval={}",
            ticker, start, end, interval
        );

        info!("Fetching Yahoo data for {} ({}): {} to {}", ticker, interval, start, end);

        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Yahoo API returned status {}: {}", resp.status(), resp.text().await?));
        }

        let data: YahooChartResponse = resp.json().await?;
        
        if let Some(err) = data.chart.error {
            return Err(anyhow!("Yahoo API Error: {} - {}", err.code, err.description));
        }

        let result = data.chart.result.ok_or_else(|| anyhow!("Empty result from Yahoo"))?;
        let item = result.get(0).ok_or_else(|| anyhow!("No data item from Yahoo"))?;
        
        let timestamps = &item.timestamp;
        let quotes = item.indicators.quote.get(0).ok_or_else(|| anyhow!("No quote data from Yahoo"))?;

        let mut ticks = Vec::new();
        for (i, ts) in timestamps.iter().enumerate() {
            let open = quotes.open.get(i).and_then(|v| *v).unwrap_or(0.0);
            let high = quotes.high.get(i).and_then(|v| *v).unwrap_or(0.0);
            let low = quotes.low.get(i).and_then(|v| *v).unwrap_or(0.0);
            let close = quotes.close.get(i).and_then(|v| *v).unwrap_or(0.0);
            let volume = quotes.volume.get(i).and_then(|v| *v).unwrap_or(0.0);

            if close == 0.0 { continue; } // Skip bad data

            ticks.push(crate::engine::scraper::TickData {
                symbol: ticker.to_string(),
                price: close,
                volume: volume as f64,
                timestamp: *ts,
            });
        }

        Ok(ticks)
    }
}
