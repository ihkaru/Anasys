# 📊 Anasys Institutional Harvesting Benchmark
Generated at: 2026-05-01T11:23:58.500Z

## 🚀 Real-time Throughput & Estimate

| Metric | Value |
| :--- | :--- |
| **Total Symbols** | 13,283 |
| **Total Expected Tasks** | 53,132 |
| **Completed Tasks** | 0 (0.00%) |
| **Activity TPS** | **0.00 tasks/sec** (Movement) |
| **Completion TPS** | **0.00 tasks/sec** (Done) |
| **QuestDB Candle Ingestion** | **0.00 rows/sec** |
| **Yahoo Rate Limits (429)** | **1 errors** in 30s |
| **Estimated Completion** | **∞ hours** |

## 📋 Harvesting Task Status Breakdown

| Interval | Completed | In Progress | Never Started | Total | % Done |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `15m` | 0 | 9 | 13,274 | 13,283 | **0.00%** |
| `1d` | 0 | 8 | 13,275 | 13,283 | **0.00%** |
| `1h` | 0 | 10 | 13,273 | 13,283 | **0.00%** |
| `1m` | 0 | 10 | 13,273 | 13,283 | **0.00%** |


## 🌍 Asset Diversity & Provider Coverage

### 🏷️ Asset Classes

| Asset Type | Count | Percentage |
| :--- | :--- | :--- |
| **STOCK** | 12,902 | 97.1% |
| **INDEX** | 227 | 1.7% |
| **COMMODITY** | 77 | 0.6% |
| **CRYPTO** | 66 | 0.5% |
| **FOREX** | 11 | 0.1% |


### 📡 Data Source Efficiency (QuestDB)

| Provider | Candles Ingested | Role |
| :--- | :--- | :--- |
| **YAHOO** | 6,847 | Fallback (Institution) |
| **TRADINGVIEW** | 18,693 | Primary (High Precision) |


## 📦 Database Overview (Row Counts)

### 🟡 QuestDB Tables

| Table | Row Count | Description |
| :--- | :--- | :--- |
| `candles` | 25,540 | OHLCV time-series market data (intraday & daily) |

### 🐘 PostgreSQL Tables

| Table | Row Count |
| :--- | :--- |
| `symbols` | 13,283 |
| `symbol_financials` | 19 |
| `symbol_earnings` | 6 |
| `analyst_ratings` | 7 |
| `corporate_actions` | 0 |
| `insider_transactions` | 198 |
| `macro_data` | 0 |
| `backfill_progress` | 53,132 |
| `market_data` | 440,262 |
| `categories` | 6 |
| `symbol_categories` | 23,531 |
| `watchlists` | 2 |
| `watchlist_items` | 5 |
| `holdings` | 0 |
| `users` | 2 |
| `strategies` | 0 |

## 🗃️ Data Diversity Snapshot (Latest 2 Rows per Table)

---

### 🟡 QuestDB

#### `candles` — OHLCV Time-Series

| symbol | interval | source | open | high | low | close | volume | timestamp |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| BTC-USD | 15m | YAHOO | 77478.203125 | 77478.203125 | 77478.203125 | 77478.203125 | 0 | 2026-05-01T11:22:54.000000Z |
| BTC-USD | 15m | YAHOO | 77318.0625 | 77445.6015625 | 77300 | 77443.9296875 | 62717952 | 2026-05-01T11:15:00.000000Z |

---

### 🐘 PostgreSQL — Harvesting Core

#### `symbols` — Symbols — Master list of all tracked instruments

| id | ticker | name | type | provider | exchange | currency | isActive | iconUrl | lastSyncedAt | description | sector | industry | website | country | tradingviewSymbol | tradingviewExchange | isin | figi | metadataUpdatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 13283 | USDTSGD | USDT/Singapore Dollar | CRYPTO | tradingview | OKX | SGD | true |  |  | USDT/Singapore Dollar |  |  |  |  | USDTSGD | OKX |  |  |  |
| 13282 | USDTAED | USDT/United Arab Emirates Dirham | CRYPTO | tradingview | OKX | AED | true |  |  | USDT/United Arab Emirates Dirham |  |  |  |  | USDTAED | OKX |  |  |  |

#### `backfill_progress` — Backfill Progress — Harvesting task tracker

| id | symbolId | interval | targetStartDate | lastBackfilledAt | isCompleted | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 25 | 7 | 1d | 2025-05-01T00:00:00.000Z | 2025-05-01T13:30:00.000Z | false | 2026-05-01T11:23:49.954Z |
| 12 | 3 | 1m | 2025-05-01T00:00:00.000Z | 2026-04-24T13:30:00.000Z | false | 2026-05-01T11:23:47.928Z |

---

### 🐘 PostgreSQL — Institutional & Fundamental Data

#### `symbol_financials` — Financials — P/E, Market Cap, Revenue, Margins…

| id | symbolId | trailingPE | forwardPE | priceToBook | dividendYield | exDividendDate | beta | fiftyTwoWeekHigh | fiftyTwoWeekLow | fiftyDayAverage | twoHundredDayAverage | averageVolume | marketCap | totalRevenue | revenuePerShare | grossProfit | ebitda | netIncomeToCommon | grossMargins | operatingMargins | profitMargins | returnOnEquity | returnOnAssets | debtToEquity | currentRatio | quickRatio | freeCashflow | targetMeanPrice | targetHighPrice | targetLowPrice | recommendationMean | recommendationKey | numberOfAnalystOpinions | sharesOutstanding | floatShares | sharesShort | shortRatio | heldPercentInsiders | heldPercentInstitutions | bookValue | enterpriseValue | trailingEps | forwardEps | pegRatio | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 19 | 3 | 29.329268 | 28.444496 |  | 0.0023999999 | 2026-03-09T00:00:00.000Z | 1.128 | 385.84 | 147.84 | 313.855 | 280.11926 | 32977985 | 4662022373376 | 402835996672 | 33.248 | 240300998656 | 150175006720 |  | 0.59652 | 0.31568 | 0.32810003 | 0.35705003 | 0.15427 | 16.133 | 2.005 | 1.847 | 38088376320 | 378.50394 | 443 | 185 | 1.39394 | strong_buy | 56 | 5823665113 | 10836734540 | 78071445 | 2.72 | 0.00564 | 0.808 | 34.353 | 4173377306624 | 13.12 | 13.5281 |  | 2026-05-01T08:34:11.466Z |
| 18 | 2 | 24.27262 | 21.130917 |  | 0.0089 | 2026-05-21T00:00:00.000Z | 1.107 | 555.45 | 356.28 | 395.7908 | 468.4585 | 36482890 | 3029167243264 | 318272995328 | 42.836 | 217409994752 | 184457003008 |  | 0.68309 | 0.46326 | 0.39341998 | 0.34013999 | 0.14814 | 30.271 | 1.283 | 1.142 | 37011251200 | 570.7213 | 730 | 392 | 1.28571 | strong_buy | 54 | 7428434704 | 7417589189 | 83407242 | 2.53 | 0.00079 | 0.7593 | 52.615 | 3076370989056 | 16.8 | 19.29779 |  | 2026-05-01T08:33:36.580Z |

#### `symbol_earnings` — Earnings — EPS history, revenue trend, next earnings date

| id | symbolId | nextEarningsDate | nextExDividendDate | nextDividendDate | earningsHistory | revenueHistory | earningsTrend | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 6 | 11228 |  |  |  | [{"date":"Tue Sep 30 2025 00:00:00 GMT+0000 (Coordinated Universal Time)","ep... | [{"date":"1Q2025","revenue":0,"earnings":-74038520},{"date":"2Q2025","revenue... | [{"period":"0q","endDate":"2026-03-31T00:00:00.000Z","growth":null,"earningsE... | 2026-05-01T08:07:40.449Z |
| 5 | 7594 | 2026-05-07T20:00:00.000Z |  |  | [{"date":"Mon Mar 31 2025 00:00:00 GMT+0000 (Coordinated Universal Time)","ep... | [{"date":"1Q2025","revenue":0,"earnings":-23508000},{"date":"2Q2025","revenue... | [{"period":"0q","endDate":"2026-03-31T00:00:00.000Z","growth":-0.3689,"earnin... | 2026-05-01T08:07:37.152Z |

#### `analyst_ratings` — Analyst Ratings — Buy/Hold/Sell breakdown & trend

| id | symbolId | strongBuy | buy | hold | sell | strongSell | ratingsTrend | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 7 | 8012 | 0 | 0 | 0 | 0 | 0 | [] | 2026-05-01T08:07:49.879Z |
| 6 | 11228 | 0 | 5 | 0 | 0 | 0 | [{"period":"0m","strongBuy":0,"buy":5,"hold":0,"sell":0,"strongSell":0},{"per... | 2026-05-01T08:07:40.277Z |

#### `corporate_actions` — Corporate Actions — Dividends & stock splits

*No data found.*

#### `insider_transactions` — Insider Transactions — Executive buy/sell activity

| id | symbolId | insiderName | position | transactionDate | transactionType | shares | price | value | source | createdAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 1 | Unknown |  | 2026-04-23T00:00:00.000Z | Sale at price 275.00 per share. | 1534 | 275 | 421850 | YAHOO | 2026-05-01T08:32:24.254Z |
| 2 | 1 | Unknown |  | 2026-04-15T00:00:00.000Z | UNKNOWN | 10928 | 0 |  | YAHOO | 2026-05-01T08:32:24.254Z |

#### `macro_data` — Macro Data — Fed rates, CPI, GDP indicators

*No data found.*

---

### 🐘 PostgreSQL — Market Data Cache (Legacy)

#### `market_data` — Daily/Intraday OHLCV cached in Postgres

| symbolId | timestamp | open | high | low | close | adjClose | volume | source | interval |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 33 | 2026-05-01T11:01:53.000Z | 83.94000244140625 | 83.94000244140625 | 83.94000244140625 | 83.94000244140625 |  | 0 | YAHOO | 1h |
| 34 | 2026-05-01T11:00:08.000Z | 617.1099853515625 | 617.1099853515625 | 617.1099853515625 | 617.1099853515625 |  | 0 | YAHOO | 1h |

---

### 🐘 PostgreSQL — Application & User Data

#### `users` — Users — Registered accounts

| id | email | name | googleId | createdAt |
| :--- | :--- | :--- | :--- | :--- |
| 2 | ipds6104@gmail.com | ipds 6104 | 103545986932146164034 | 2026-04-26T11:02:55.178Z |
| 1 | ihza2karunia@gmail.com | Ihza Karunia | 117460980054781382822 | 2026-04-26T09:43:16.583Z |

#### `strategies` — Strategies — Trading strategy definitions

*No data found.*

#### `categories` — Categories — Symbol classification tags

| id | name | slug |
| :--- | :--- | :--- |
| 6 | CRYPTO | crypto |
| 5 | NYSE | nyse |

#### `watchlists` — Watchlists — User-curated symbol lists

| id | userId | name | isDefault | createdAt | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2 | 2 | Watchlist | true | 2026-04-26T11:02:55.184Z | 2026-04-26T11:02:55.184Z |
| 1 | 1 | Watchlist | true | 2026-04-26T09:43:16.607Z | 2026-04-26T09:43:16.607Z |

#### `holdings` — Holdings — Portfolio positions

*No data found.*

---

### 🐘 PostgreSQL — Junction Tables (count only)

| Table | Row Count | Description |
| :--- | :--- | :--- |
| `symbol_categories` | 23,531 | Many-to-many: symbols ↔ categories |
| `watchlist_items` | 5 | Many-to-many: watchlists ↔ symbols |

