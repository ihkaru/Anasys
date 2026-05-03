# 📊 Anasys Institutional Harvesting Benchmark
Generated at: 2026-05-03T17:40:50.369Z

## 🚀 Real-time Throughput & Estimate

| Metric | Value |
| :--- | :--- |
| **Total Symbols** | 13,285 |
| **Total Expected Tasks** | 53,140 |
| **Completed Tasks** | 5,983 (11.26%) |
| **Activity TPS** | **0.00 tasks/sec** (Movement) |
| **Completion TPS** | **0.00 tasks/sec** (Done) |
| **QuestDB Candle Ingestion** | **0.00 rows/sec** |
| **Yahoo Rate Limits (429)** | **0 errors** in 30s |
| **Estimated Completion** | **∞ hours** |

## 📋 Harvesting Task Status Breakdown

| Interval | Completed | In Progress | Never Started | Total | % Done |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `15m` | 1,023 | 532 | 12,748 | 13,283 | **7.70%** |
| `1d` | 1,993 | 75 | 13,188 | 13,283 | **15.00%** |
| `1h` | 1,987 | 81 | 13,188 | 13,283 | **14.96%** |
| `1m` | 980 | 601 | 12,673 | 13,283 | **7.38%** |


## 🌍 Asset Diversity & Provider Coverage

### 🏷️ Asset Classes

| Asset Type | Count | Percentage |
| :--- | :--- | :--- |
| **STOCK** | 12,904 | 97.1% |
| **INDEX** | 227 | 1.7% |
| **COMMODITY** | 77 | 0.6% |
| **CRYPTO** | 66 | 0.5% |
| **FOREX** | 11 | 0.1% |


### 📡 Data Source Efficiency (QuestDB)

| Provider | Candles Ingested | Role |
| :--- | :--- | :--- |
| **YAHOO** | 476,418 | Fallback (Institution) |
| **TRADINGVIEW** | 602,089 | Primary (High Precision) |
| **TEST** | 1 | Fallback (Institution) |


## 📦 Database Overview (Row Counts)

### 🟡 QuestDB Tables

| Table | Row Count | Description |
| :--- | :--- | :--- |
| `candles` | 1,078,508 | OHLCV time-series market data (intraday & daily) |

### 🐘 PostgreSQL Tables

| Table | Row Count |
| :--- | :--- |
| `symbols` | 13,285 |
| `symbol_financials` | 79 |
| `symbol_earnings` | 39 |
| `analyst_ratings` | 44 |
| `corporate_actions` | 0 |
| `insider_transactions` | 1,580 |
| `macro_data` | 0 |
| `backfill_progress` | 53,132 |
| `market_data` | 786,822 |
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
| SOL-USD | 1h | YAHOO | 84.16999816894531 | 84.16999816894531 | 84.16999816894531 | 84.16999816894531 | 0 | 2026-05-03T16:01:38.000000Z |
| SOL-USD | 1h | YAHOO | 84.16999816894531 | 84.16999816894531 | 84.16999816894531 | 84.16999816894531 | 0 | 2026-05-03T16:01:38.000000Z |

---

### 🐘 PostgreSQL — Harvesting Core

#### `symbols` — Symbols — Master list of all tracked instruments

| id | ticker | name | type | provider | exchange | currency | isActive | iconUrl | lastSyncedAt | description | sector | industry | website | country | tradingviewSymbol | tradingviewExchange | isin | figi | lotSize | metadataUpdatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 13286 | BBCA.JK | BBCA.JK | STOCK | yahoo |  |  | true |  |  |  |  |  |  |  |  |  |  |  | 100 |  |
| 13285 | TLKM.JK | TLKM.JK | STOCK | yahoo | IDX |  | true |  |  |  |  |  |  |  |  |  |  |  | 100 |  |

#### `backfill_progress` — Backfill Progress — Harvesting task tracker

| id | symbolId | interval | targetStartDate | lastBackfilledAt | lastSyncedAt | isCompleted | backfillStatus | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 8269 | 2068 | 1d | 2018-01-01T00:00:00.000Z |  |  | true | PENDING | 2026-05-03T17:30:05.667Z |
| 8270 | 2068 | 1h | 2018-01-01T00:00:00.000Z |  |  | true | PENDING | 2026-05-03T17:30:04.202Z |

---

### 🐘 PostgreSQL — Institutional & Fundamental Data

#### `symbol_financials` — Financials — P/E, Market Cap, Revenue, Margins…

| id | symbolId | trailingPE | forwardPE | priceToBook | dividendYield | exDividendDate | beta | fiftyTwoWeekHigh | fiftyTwoWeekLow | fiftyDayAverage | twoHundredDayAverage | averageVolume | marketCap | totalRevenue | revenuePerShare | grossProfit | ebitda | netIncomeToCommon | grossMargins | operatingMargins | profitMargins | returnOnEquity | returnOnAssets | debtToEquity | currentRatio | quickRatio | freeCashflow | targetMeanPrice | targetHighPrice | targetLowPrice | recommendationMean | recommendationKey | numberOfAnalystOpinions | sharesOutstanding | floatShares | sharesShort | shortRatio | heldPercentInsiders | heldPercentInstitutions | bookValue | enterpriseValue | trailingEps | forwardEps | pegRatio | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 81 | 8135 |  |  |  |  |  | -0.014 | 1.85 | 0.226 | 0.45064 | 0.762375 | 1889057 | 17125100 | 116233000 | 3.092 | -28426000 | -143698496 |  | -0.24455999 | -4.02616 | -1.19722 | -0.86626 | -0.27109 | 109.065 | 1.588 | 0.887 | 23351624 |  |  |  |  | none |  | 43354683 | 8948077 | 270488 | 0.05 | 0.59754 | 0.0764 | 0.15919776 | 29188052 | -0.12 |  |  | 2026-05-03T15:57:20.570Z |
| 80 | 9794 |  |  |  |  |  |  | 31.055 | 1.4 | 1.831568 | 2.805508 | 435368 | 451701088 | 11072733 | 0.524 | 4046317 | -3328443 |  | 0.36543 | -0.48039 | -0.2807 | -0.91541 | -0.17233999 | 154.862 | 1.341 | 0.933 | -2735654 |  |  |  |  | none |  | 206674356 | 19934531 | 15635 | 0.29 | 0.00125 | 0.00061 | 0.185 | 49070780 | -0.15 |  |  | 2026-05-03T15:57:14.340Z |

#### `symbol_earnings` — Earnings — EPS history, revenue trend, next earnings date

| id | symbolId | nextEarningsDate | nextExDividendDate | nextDividendDate | earningsHistory | revenueHistory | earningsTrend | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 40 | 8135 |  |  |  | [] | [] | [{"period":"0q","endDate":null,"growth":null,"earningsEstimate":null,"revenue... | 2026-05-03T15:57:20.720Z |
| 39 | 9794 |  |  |  | [] | [] | [{"period":"0q","endDate":null,"growth":null,"earningsEstimate":null,"revenue... | 2026-05-03T15:57:14.483Z |

#### `analyst_ratings` — Analyst Ratings — Buy/Hold/Sell breakdown & trend

| id | symbolId | strongBuy | buy | hold | sell | strongSell | ratingsTrend | updatedAt |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 44 | 8135 | 0 | 0 | 0 | 0 | 0 | [] | 2026-05-03T15:57:20.566Z |
| 43 | 9794 | 0 | 0 | 0 | 0 | 0 | [] | 2026-05-03T15:57:14.334Z |

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
| 33 | 2026-05-03T17:01:38.000Z | 84.02999877929688 | 84.02999877929688 | 84.02999877929688 | 84.02999877929688 |  | 0 | YAHOO | 1h |
| 36 | 2026-05-03T17:01:14.000Z | 0.10808999836444855 | 0.10808999836444855 | 0.10808999836444855 | 0.10808999836444855 |  | 0 | YAHOO | 1h |

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

