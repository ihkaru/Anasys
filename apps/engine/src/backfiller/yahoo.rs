use serde::Deserialize;
use anyhow::{Result, anyhow};
use log::info;
use std::time::Duration;
use crate::types::CandleData;

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
    pub open:   Vec<Option<f64>>,
    pub high:   Vec<Option<f64>>,
    pub low:    Vec<Option<f64>>,
    pub close:  Vec<Option<f64>>,
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
        // Use a more recent and varied UA
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
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
    ) -> Result<Vec<CandleData>> {
        let url = format!(
            "https://query1.finance.yahoo.com/v8/finance/chart/{}?period1={}&period2={}&interval={}",
            ticker, start, end, interval
        );

        info!("📥 Yahoo fetch: {} ({}) {} → {}", ticker, interval, start, end);

        let uas = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0"
        ];
        let idx = (chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0) % uas.len() as i64).abs() as usize;
        let ua = uas[idx];

        let resp = self.client.get(&url)
            .header("User-Agent", ua)
            .header("Accept", "application/json")
            .send().await?;
        
        let status = resp.status();
        let body_text = resp.text().await?;

        if !status.is_success() {
            if status.as_u16() == 429 || body_text.contains("Too Many Requests") {
                return Err(anyhow!("RATE_LIMIT: Yahoo 429"));
            }
            return Err(anyhow!("Yahoo API status {}: {}", status, body_text));
        }

        let data: YahooChartResponse = match serde_json::from_str(&body_text) {
            Ok(d) => d,
            Err(e) => {
                if body_text.contains("Consent") || body_text.contains("captcha") || body_text.len() < 100 {
                    return Err(anyhow!("RATE_LIMIT: Yahoo Soft Block (HTML/Consent)"));
                }
                return Err(anyhow!("Yahoo JSON decode error: {} | Body snippet: {}", e, body_text.get(0..200).unwrap_or("")));
            }
        };

        if let Some(err) = data.chart.error {
            return Err(anyhow!("Yahoo API Error: {} - {}", err.code, err.description));
        }

        let result = data.chart.result.ok_or_else(|| anyhow!("Empty result from Yahoo for {}", ticker))?;
        let item   = result.get(0).ok_or_else(|| anyhow!("No data item from Yahoo for {}", ticker))?;

        let timestamps = &item.timestamp;
        let quotes = item.indicators.quote.get(0)
            .ok_or_else(|| anyhow!("No quote data from Yahoo for {}", ticker))?;

        let mut candles = Vec::with_capacity(timestamps.len());

        for (i, ts) in timestamps.iter().enumerate() {
            let open   = quotes.open.get(i).and_then(|v| *v).unwrap_or(0.0);
            let high   = quotes.high.get(i).and_then(|v| *v).unwrap_or(0.0);
            let low    = quotes.low.get(i).and_then(|v| *v).unwrap_or(0.0);
            let close  = quotes.close.get(i).and_then(|v| *v).unwrap_or(0.0);
            let volume = quotes.volume.get(i).and_then(|v| *v).unwrap_or(0.0);

            // Lewati candle dengan data tidak valid
            if close <= 0.0 || open <= 0.0 { continue; }

            candles.push(CandleData {
                symbol:    ticker.to_string(),
                interval:  interval.to_string(),
                open,
                high,
                low,
                close,
                volume,
                source:    "YAHOO".to_string(),
                timestamp: *ts,
            });
        }

        info!("✅ Yahoo: {} candles untuk {} ({})", candles.len(), ticker, interval);
        Ok(candles)
    }
}
