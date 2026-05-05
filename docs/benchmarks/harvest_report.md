# 📊 Anasys Institutional Harvesting Benchmark
Generated at: 2026-05-05T00:22:44.588Z

## 🚀 Real-time Throughput & Estimate

| Metric | Value |
| :--- | :--- |
| **Total Symbols** | 15,775 |
| **Total Expected Tasks** | 63,100 |
| **Completed Tasks** | 60,595 (96.03%) |
| **Activity TPS** | **0.00 tasks/sec** (Movement) |
| **Completion TPS** | **0.00 tasks/sec** (Done) |
| **QuestDB Candle Ingestion** | **0.00 rows/sec** |
| **Yahoo Rate Limits (429)** | **0 errors** in 30s |
| **Estimated Completion** | **∞ hours** |

## 📋 Harvesting Task Status Breakdown

| Interval | Completed | In Progress | Never Started | Total | % Done |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `15m` | 15,773 | 0 | 15,238 | 15,773 | **100.00%** |
| `1d` | 15,773 | 0 | 15,574 | 15,773 | **100.00%** |
| `1h` | 15,770 | 3 | 15,579 | 15,773 | **99.98%** |
| `1m` | 13,279 | 4 | 12,563 | 13,283 | **99.97%** |


## 🌍 Asset Diversity & Provider Coverage

### 🏷️ Asset Classes

| Asset Type | Count | Percentage |
| :--- | :--- | :--- |
| **STOCK** | 15,394 | 97.6% |
| **INDEX** | 227 | 1.4% |
| **COMMODITY** | 77 | 0.5% |
| **CRYPTO** | 66 | 0.4% |
| **FOREX** | 11 | 0.1% |


### 📡 Data Source Efficiency (QuestDB)

| Provider | Candles Ingested | Role |
| :--- | :--- | :--- |
| **YAHOO** | 32,620,443 | Fallback (Institution) |
| **TRADINGVIEW** | 607,565 | Primary (High Precision) |
| **TEST** | 1 | Fallback (Institution) |


## 📦 Database Overview (Row Counts)

### 🟡 QuestDB Tables

| Table | Row Count | Description |
| :--- | :--- | :--- |
| `candles` | 33,228,009 | OHLCV time-series market data (intraday & daily) |

### 🐘 PostgreSQL Tables

| Table | Row Count |
| :--- | :--- |
| `symbols` | 15,775 |
| `symbol_financials` | 209 |
| `symbol_earnings` | 118 |
| `analyst_ratings` | 127 |
| `corporate_actions` | 0 |
| `insider_transactions` | 4,100 |
| `macro_data` | 0 |
| `backfill_progress` | 60,602 |
| `market_data` | 12,667,838 |
| `categories` | 6 |
| `symbol_categories` | 23,531 |
| `watchlists` | 1 |
| `watchlist_items` | 1 |
| `holdings` | 0 |
| `users` | 2 |
| `strategies` | 0 |

## 🗃️ Data Diversity Snapshot (Latest 2 Rows per Table)

---

### 🟡 QuestDB

#### `candles` — OHLCV Time-Series

| symbol | interval | source | open | high | low | close | volume | timestamp |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| BTCUSD | 1d | TRADINGVIEW | 79855 | 79855 | 79810 | 79829 | 1.34098333 | 2026-05-05T00:00:00.000000Z |
| BTCUSD | 1d | TRADINGVIEW | 79855 | 79855 | 79810 | 79829 | 1.34098333 | 2026-05-05T00:00:00.000000Z |

---

### 🐘 PostgreSQL — Harvesting Core

#### `symbols` — Symbols — Master list of all tracked instruments

| id | ticker | name | type | provider | exchange | currency | isActive | iconUrl | lastSyncedAt | description | sector | industry | website | country | tradingviewSymbol | tradingviewExchange | isin | figi | lotSize | metadataUpdatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 15776 | AACIW | Armada Acquisition Corp. III | STOCK | yahoo | NASDAQ |  | true |  |  |  |  |  |  |  |  |  |  |  | 1 |  |
| 15775 | AACIU | Armada Acquisition Corp. III | STOCK | yahoo | NASDAQ |  | true |  |  |  |  |  |  |  |  |  |  |  | 1 |  |

#### `backfill_progress` — Backfill Progress — Harvesting task tracker

| id | symbolId | interval | targetStartDate | lastBackfilledAt | lastSyncedAt | isCompleted | backfillStatus | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 44081 | 11021 | 1d | 2018-01-01T00:00:00.000Z |  | 2026-05-05T00:18:38.345Z | true | INCREMENTAL | 2026-05-05T00:18:38.345Z |
| 26074 | 6519 | 1h | 2018-01-01T00:00:00.000Z |  | 2026-05-05T00:18:38.344Z | true | INCREMENTAL | 2026-05-05T00:18:38.344Z |

---

### 🐘 PostgreSQL — Institutional & Fundamental Data

#### `symbol_financials` — Financials — P/E, Market Cap, Revenue, Margins…

| id | symbolId | trailingPE | forwardPE | priceToBook | dividendYield | exDividendDate | beta | fiftyTwoWeekHigh | fiftyTwoWeekLow | fiftyDayAverage | twoHundredDayAverage | averageVolume | marketCap | totalRevenue | revenuePerShare | grossProfit | ebitda | netIncomeToCommon | grossMargins | operatingMargins | profitMargins | returnOnEquity | returnOnAssets | debtToEquity | currentRatio | quickRatio | freeCashflow | targetMeanPrice | targetHighPrice | targetLowPrice | recommendationMean | recommendationKey | numberOfAnalystOpinions | sharesOutstanding | floatShares | sharesShort | shortRatio | heldPercentInsiders | heldPercentInstitutions | bookValue | enterpriseValue | trailingEps | forwardEps | pegRatio | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 211 | 5428 | 18.277197 |  |  |  |  |  | 24.01 | 13.64 | 21.65976 | 20.343704 | 134395 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 2026-05-05T00:18:35.657Z |
| 210 | 10786 |  |  |  |  |  |  | 11.6 | 10.5 | 10.89 | 10.85795 | 0 |  |  |  |  |  |  | 0 | 0 | 0 | 2.7315202 | -0.015369999 |  | 0.021 | 0.021 | -247227 |  |  |  |  | none |  | 6666750 | 2381306 | 21 |  | 0 | 0.00561 | -0.309 | 53569436 |  |  |  | 2026-05-05T00:18:28.716Z |

#### `symbol_earnings` — Earnings — EPS history, revenue trend, next earnings date

| id | symbolId | nextEarningsDate | nextExDividendDate | nextDividendDate | earningsHistory | revenueHistory | earningsTrend | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 119 | 10786 |  |  |  | [] | [] | [{"period":"0q","endDate":null,"growth":null,"earningsEstimate":null,"revenue... | 2026-05-05T00:18:28.870Z |
| 118 | 11140 |  |  |  | [] | [] | [{"period":"0q","endDate":"2024-03-31T00:00:00.000Z","growth":null,"earningsE... | 2026-05-05T00:18:20.864Z |

#### `analyst_ratings` — Analyst Ratings — Buy/Hold/Sell breakdown & trend

| id | symbolId | strongBuy | buy | hold | sell | strongSell | ratingsTrend | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 127 | 10786 | 0 | 0 | 0 | 0 | 0 | [] | 2026-05-05T00:18:28.714Z |
| 126 | 11140 | 0 | 0 | 0 | 0 | 0 | [] | 2026-05-05T00:18:20.712Z |

#### `corporate_actions` — Corporate Actions — Dividends & stock splits

*No data found.*

#### `insider_transactions` — Insider Transactions — Executive buy/sell activity

| id | symbolId | insiderName | position | transactionDate | transactionType | shares | price | value | source | createdAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 620 | 8755 | WARRINER KENNETH THOMAS | Director | 2026-04-30T00:00:00.000Z | Purchase at price 18.42 per share. | 1000 | 18.415 | 18415 | YAHOO | 2026-05-03T06:00:20.125Z |
| 1267 | 10516 | DESKUS ARCHANA | Director | 2026-04-30T00:00:00.000Z | Sale at price 125.55 per share. | 1800 | 125.55 | 225990 | YAHOO | 2026-05-03T15:56:35.662Z |

#### `macro_data` — Macro Data — Fed rates, CPI, GDP indicators

*No data found.*

---

### 🐘 PostgreSQL — Market Data Cache (Legacy)

#### `market_data` — Daily/Intraday OHLCV cached in Postgres

| symbolId | timestamp | open | high | low | close | adjClose | volume | source | interval |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 13250 | 2026-05-05T00:00:00.000Z | 79855 | 79855 | 79810 | 79829 |  | 1.34098333 | TRADINGVIEW | 1d |
| 33 | 2026-05-04T23:00:00.000Z | 84.0999984741211 | 84.0999984741211 | 84.0999984741211 | 84.0999984741211 |  | 0 | YAHOO | 1h |

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
| 3 | 1 | My Assets | true | 2026-05-03T06:22:08.427Z | 2026-05-03T06:22:08.427Z |

#### `holdings` — Holdings — Portfolio positions

*No data found.*

---

### 🐘 PostgreSQL — Junction Tables (count only)

| Table | Row Count | Description |
| :--- | :--- | :--- |
| `symbol_categories` | 23,531 | Many-to-many: symbols ↔ categories |
| `watchlist_items` | 1 | Many-to-many: watchlists ↔ symbols |

