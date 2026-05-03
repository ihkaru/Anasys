# 📊 Anasys Institutional Harvesting Benchmark
Generated at: 2026-05-03T05:58:54.238Z

## 🚀 Real-time Throughput & Estimate

| Metric | Value |
| :--- | :--- |
| **Total Symbols** | 13,283 |
| **Total Expected Tasks** | 53,132 |
| **Completed Tasks** | 0 (0.00%) |
| **Activity TPS** | **0.97 tasks/sec** (Movement) |
| **Completion TPS** | **0.00 tasks/sec** (Done) |
| **QuestDB Candle Ingestion** | **1229.90 rows/sec** |
| **Yahoo Rate Limits (429)** | **0 errors** in 30s |
| **Estimated Completion** | **304.31 hours** |

## 📋 Harvesting Task Status Breakdown

| Interval | Completed | In Progress | Never Started | Total | % Done |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `15m` | 0 | 5 | 13,278 | 13,283 | **0.00%** |
| `1d` | 0 | 12 | 13,271 | 13,283 | **0.00%** |
| `1h` | 0 | 12 | 13,271 | 13,283 | **0.00%** |
| `1m` | 0 | 12 | 13,271 | 13,283 | **0.00%** |


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
| **TRADINGVIEW** | 34,635 | Primary (High Precision) |
| **YAHOO** | 20,762 | Fallback (Institution) |


## 📦 Database Overview (Row Counts)

### 🟡 QuestDB Tables

| Table | Row Count | Description |
| :--- | :--- | :--- |
| `candles` | 55,397 | OHLCV time-series market data (intraday & daily) |

### 🐘 PostgreSQL Tables

| Table | Row Count |
| :--- | :--- |
| `symbols` | 13,283 |
| `symbol_financials` | 37 |
| `symbol_earnings` | 16 |
| `analyst_ratings` | 17 |
| `corporate_actions` | 0 |
| `insider_transactions` | 467 |
| `macro_data` | 0 |
| `backfill_progress` | 53,132 |
| `market_data` | 584,493 |
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
| CVX | 1h | YAHOO | 190.6300048828125 | 190.6300048828125 | 190.6300048828125 | 190.6300048828125 | 0 | 2026-05-01T20:00:00.000000Z |
| UNH | 1h | YAHOO | 368.7799987792969 | 368.7799987792969 | 368.7799987792969 | 368.7799987792969 | 0 | 2026-05-01T20:00:00.000000Z |

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
| 59 | 15 | 15m | 2018-01-01T00:00:00.000Z | 2018-01-01T00:00:00.000Z | false | 2026-05-03T05:59:03.646Z |
| 7 | 2 | 15m | 2018-01-01T00:00:00.000Z | 2018-01-01T00:00:00.000Z | false | 2026-05-03T05:59:03.163Z |

---

### 🐘 PostgreSQL — Institutional & Fundamental Data

#### `symbol_financials` — Financials — P/E, Market Cap, Revenue, Margins…

| id | symbolId | trailingPE | forwardPE | priceToBook | dividendYield | exDividendDate | beta | fiftyTwoWeekHigh | fiftyTwoWeekLow | fiftyDayAverage | twoHundredDayAverage | averageVolume | marketCap | totalRevenue | revenuePerShare | grossProfit | ebitda | netIncomeToCommon | grossMargins | operatingMargins | profitMargins | returnOnEquity | returnOnAssets | debtToEquity | currentRatio | quickRatio | freeCashflow | targetMeanPrice | targetHighPrice | targetLowPrice | recommendationMean | recommendationKey | numberOfAnalystOpinions | sharesOutstanding | floatShares | sharesShort | shortRatio | heldPercentInsiders | heldPercentInstitutions | bookValue | enterpriseValue | trailingEps | forwardEps | pegRatio | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 4 | 11781 |  |  |  |  |  |  | 5586.2 | 3125 | 4833.16 | 4265.066 | 2224 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 2026-05-03T04:45:33.264Z |
| 17 | 1 | 33.915257 | 29.386591 |  | 0.0039 | 2026-05-11T00:00:00.000Z |  | 288.62 | 193.25 | 261.2186 | 255.1833 | 44885765 | 4109006274560 | 451442016256 | 30.534 | 216070995968 | 159975997440 |  | 0.47862 | 0.32275 | 0.27152002 | 1.4147099 | 0.26229 | 79.548 | 1.07 | 0.906 | 100480753664 | 301.35953 | 355 | 215 | 1.875 | buy | 42 | 14667688000 | 14642606254 | 134422787 | 3.24 | 0.01642 | 0.65318 | 5.998 | 4125210181632 | 8.26 | 9.53292 | 2.44 | 2026-05-03T04:45:16.046Z |

#### `symbol_earnings` — Earnings — EPS history, revenue trend, next earnings date

| id | symbolId | nextEarningsDate | nextExDividendDate | nextDividendDate | earningsHistory | revenueHistory | earningsTrend | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 16 | 1 | 2026-07-30T20:00:00.000Z | 2026-05-11T00:00:00.000Z | 2026-02-12T00:00:00.000Z | [{"date":"Mon Jun 30 2025 00:00:00 GMT+0000 (Coordinated Universal Time)","ep... | [{"date":"2Q2025","revenue":94036000000,"earnings":23434000000},{"date":"3Q20... | [{"period":"0q","endDate":"2026-06-30T00:00:00.000Z","growth":0.1993,"earning... | 2026-05-03T04:45:16.891Z |
| 15 | 4007 |  | 2026-05-12T00:00:00.000Z | 2019-03-29T00:00:00.000Z | [] | [] | [{"period":"0q","endDate":null,"growth":null,"earningsEstimate":null,"revenue... | 2026-05-03T04:34:04.691Z |

#### `analyst_ratings` — Analyst Ratings — Buy/Hold/Sell breakdown & trend

| id | symbolId | strongBuy | buy | hold | sell | strongSell | ratingsTrend | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 17 | 1 | 7 | 25 | 14 | 1 | 1 | [{"period":"0m","strongBuy":7,"buy":25,"hold":14,"sell":1,"strongSell":1},{"p... | 2026-05-03T04:45:16.029Z |
| 16 | 4007 | 0 | 0 | 0 | 0 | 0 | [] | 2026-05-03T04:34:04.539Z |

#### `corporate_actions` — Corporate Actions — Dividends & stock splits

*No data found.*

#### `insider_transactions` — Insider Transactions — Executive buy/sell activity

| id | symbolId | insiderName | position | transactionDate | transactionType | shares | price | value | source | createdAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 278 | 4108 | SALEM MATTHEW A | Chief Executive Officer | 2026-04-24T00:00:00.000Z | Purchase at price 6.04 per share. | 60000 | 6.0412 | 362472 | YAHOO | 2026-05-03T04:33:32.604Z |
| 279 | 4108 | MATTSON W PATRICK | President | 2026-04-24T00:00:00.000Z | Purchase at price 6.03 per share. | 40000 | 6.0268 | 241072 | YAHOO | 2026-05-03T04:33:32.604Z |

#### `macro_data` — Macro Data — Fed rates, CPI, GDP indicators

*No data found.*

---

### 🐘 PostgreSQL — Market Data Cache (Legacy)

#### `market_data` — Daily/Intraday OHLCV cached in Postgres

| symbolId | timestamp | open | high | low | close | adjClose | volume | source | interval |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 36 | 2026-05-03T05:12:02.000Z | 0.1080000028014183 | 0.1080000028014183 | 0.1080000028014183 | 0.1080000028014183 |  | 0 | YAHOO | 1h |
| 33 | 2026-05-03T05:11:49.000Z | 83.80999755859375 | 83.80999755859375 | 83.80999755859375 | 83.80999755859375 |  | 0 | YAHOO | 1h |

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

