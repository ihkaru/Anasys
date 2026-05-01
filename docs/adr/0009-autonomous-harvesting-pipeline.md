# ADR-0009: Autonomous Harvesting Pipeline untuk Algo Trading

## Status
Accepted (Mei 2026)

## Konteks

Berdasarkan audit kode mendalam pada Mei 2026, ditemukan bahwa sistem harvesting saat ini memiliki tiga gap kritis:

1. **Data OHLCV dibuang oleh Rust Engine**: `backfiller/yahoo.rs` menerima data OHLCV lengkap dari Yahoo Finance, tetapi struct `TickData` hanya memiliki field `price` (close). Akibatnya, field `open`, `high`, dan `low` dibuang sebelum masuk ke QuestDB. Semua backfill historis hanya berisi `close price` — tidak dapat digunakan untuk indikator teknikal (MA, RSI, Bollinger Bands, dll).

2. **Bid/Ask tidak disimpan**: `scraper.rs` sudah merequest field `bid` dan `ask` dari TradingView WebSocket, tetapi `TickData` tidak memiliki field untuk menampungnya, sehingga data spread real-time terbuang.

3. **Tidak ada mekanisme discovery dan harvesting otonom**: Scheduler hanya menjalankan VIP sync (watchlist/holdings), tidak ada job yang menemukan simbol baru secara otomatis atau mensinkronkan semua simbol di database.

Selain itu, untuk mendukung **algo trading** yang membutuhkan data historis intraday panjang (>60 hari), diperlukan sumber data tambahan karena Yahoo Finance hanya menyediakan data intraday 60 hari ke belakang.

## Keputusan Arsitektur

### 1. QuestDB: Dua Tabel Terpisah

Sebelumnya hanya ada tabel `ticks`. Sekarang dipisah menjadi:

- **`ticks`** (diperbarui): Real-time data per tick dari TradingView WebSocket. Ditambah field `bid` dan `ask` untuk analisis spread dan order flow.
  ```
  ticks: symbol, price, volume, bid, ask, timestamp
  ```

- **`candles`** (baru): Data OHLCV historis hasil backfill. Mendukung semua interval dan banyak sumber.
  ```
  candles: symbol, interval, open, high, low, close, volume, source, timestamp
  ```

### 2. Matriks Sumber Data per Instrumen

| Instrumen | Timeframe | Sumber | Jangkauan |
|---|---|---|---|
| Crypto (BINANCE:BTCUSDT) | Real-time ticks | TradingView WS via Engine Rust | Live |
| Crypto | 1m–1h historis | **Binance klines API** (baru) | 3+ tahun |
| Crypto | 1d–1w | Yahoo Finance | Sejak listing |
| Saham US/IDX | Real-time ticks | TradingView WS via Engine Rust | Live |
| Saham US/IDX | 1m–1h historis | **TradingView Playwright** | 1–2 tahun |
| Saham US/IDX | 1d–1w | Yahoo Finance | IPO hingga kini |
| Forex (FX:EURUSD) | Real-time ticks | TradingView WS via Engine Rust | Live |
| Forex | 1d | Yahoo Finance | Tahun |

### 3. Engine Rust: Penambahan `BinanceFetcher`

Ditambahkan `backfiller/binance.rs` yang mengakses Binance klines API secara langsung:
- Endpoint: `https://api.binance.com/api/v3/klines` (gratis, tanpa autentikasi)
- Data yang tersedia: semua trading pairs USDT, interval `1m` hingga `1M`, historis hingga 3+ tahun
- Routing: Backfiller memilih `BinanceFetcher` untuk simbol crypto format Binance, `YahooFetcher` untuk instrumen lainnya.

### 4. Engine Rust: Dynamic Symbol List via Redis

Menggantikan env var statis `ANASYS_SCRAPE_SYMBOLS`, Engine sekarang polling Redis Set `harvest:realtime:symbols` setiap 30 detik. API memperbarui Set ini saat user menambah/menghapus watchlist. Ini memungkinkan tracking real-time ticks untuk instrumen apapun yang user pantau, tanpa restart Engine.

### 5. BullMQ sebagai Job Scheduler

Menggantikan `setInterval` yang fragile di `scheduler.service.ts` dengan **BullMQ** — production-grade job queue berbasis Redis:
- Jobs persist saat restart (disimpan di Redis)
- Retry otomatis dengan exponential backoff
- Deduplication (tidak bisa dua instance berjalan bersamaan)
- Cron scheduling yang presisi
- Bull Board UI untuk monitoring

Empat job types:

| Job | Jadwal | Target | Sumber |
|---|---|---|---|
| `vip-sync` | Tiap 15 menit | Watchlist + Holdings | Yahoo + TV Playwright |
| `standard-sync` | Tiap 4 jam | Semua simbol, sorted by lastSyncedAt | Yahoo 1d/1h |
| `discovery` | Tiap 24 jam (jam 2 pagi) | Temukan simbol baru | Binance API + SEC EDGAR + IDX |
| `enrichment` | Tiap 6 jam | Simbol tanpa metadata lengkap | Yahoo quoteSummary |

### 6. Symbol Discovery dari Sumber Resmi

Menggantikan pendekatan ad-hoc, discovery job menggunakan tiga sumber otoritatif:
- **Binance** (`GET /api/v3/exchangeInfo`): ~2.000 crypto pairs aktif
- **SEC EDGAR** (`company_tickers.json`): ~10.000 saham US yang terdaftar resmi
- **IDX** (idx.co.id atau data publik): ~900 emiten Indonesia

Setiap simbol baru yang ditemukan otomatis:
1. Diinsert ke tabel `symbols` (PostgreSQL)
2. Dibuat entry `backfill_progress` untuk interval `1d` (10 tahun) dan `1h` (1 tahun)
3. Backfiller Engine otomatis mengambil dan mengisi data historisnya

## Konsekuensi

### Positif
- **Zero data loss**: OHLCV lengkap tersimpan, bid/ask tersimpan — semua data yang masuk dipertahankan.
- **Intraday historis panjang untuk crypto**: Binance klines memberikan data 1m hingga 3+ tahun, memungkinkan backtesting yang akurat.
- **Discovery otonom**: Sistem menemukan simbol baru tanpa interaksi user — cukup jalankan sekali, data mengalir terus-menerus.
- **Job reliability**: BullMQ memastikan jobs tidak hilang saat restart, ada retry otomatis, dan bisa dimonitor via UI.
- **Bid/Ask tersedia**: Memungkinkan analisis spread, estimasi slippage, dan order flow analysis untuk algo trading.

### Negatif
- **Kompleksitas Engine bertambah**: Dua struct data (`TickData`, `CandleData`), dua fetcher (`YahooFetcher`, `BinanceFetcher`), dua tabel QuestDB.
- **Migrasi data**: Data backfill historis yang sudah ada di QuestDB (hanya close price) perlu dibuang dan dijalankan ulang untuk mendapat OHLCV lengkap. Atau bisa dibiarkan untuk forward-fill saja.
- **BullMQ dependency**: Menambah ketergantungan pada Redis sebagai job store (sudah ada di infrastruktur, risiko rendah).

## Referensi
- Audit kode Mei 2026: `apps/engine/src/backfiller/yahoo.rs`, `apps/engine/src/engine/scraper.rs`, `apps/engine/src/engine/batcher.rs`
- ADR-0002: Polyglot Persistence (PostgreSQL + QuestDB + Redis)
- ADR-0006: Unified Realtime Ingestion (Engine Rust sebagai single ingestor)
- ADR-0007: Multi-Source Data Strategy (Smart Proxy routing)
- ADR-0008: Opportunistic Metadata Enrichment
