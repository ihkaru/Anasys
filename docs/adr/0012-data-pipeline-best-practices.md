# ADR-0012: Data Pipeline Best Practices & Gap Resolution

## Status
Accepted (Mei 2026)

## Konteks

Audit Mei 2026 setelah sesi debugging intensif menemukan beberapa gap antara
arsitektur yang diputuskan di ADR sebelumnya (0007, 0009) dengan implementasi aktual.

### Gap yang Ditemukan

| # | Gap | ADR Asal | Dampak |
|---|---|---|---|
| G1 | OHLCV dari TV/Yahoo masuk ke Postgres, **tidak naik ke QuestDB** | ADR-0007, ADR-0009 | Engine tidak tahu data sudah ada — scrape ulang sia-sia |
| G2 | `INGEST-PENDING` signal hanya berupa log string, **tidak dikirim ke Engine** | ADR-0007 | Engine tidak bisa bereaksi terhadap demand dari user |
| G3 | SQLite browser cache **tanpa TTL per interval** | ADR-0007 | Data stale ditampilkan tanpa user sadar |
| G4 | `return` invalid di `bridge_tradingview.py` (bug kritis) | ADR-0011 | **100% backfill dari TradingView gagal silently** |
| G5 | `console.time()` blocking pada concurrent fetch | — | Timeframe switching menyebabkan chart kosong silently |
| G6 | Cache key tanpa `source` identifier | ADR-0007 | Polusi cache antar provider (Yahoo vs TradingView) |

---

## Keputusan Arsitektur

### 1. Tetap Gunakan Unofficial TradingView Scraper

**Keputusan**: Unofficial TradingView Python scraper (`bridge_tradingview.py`) dipertahankan
sebagai sumber data historis untuk aset non-crypto.

**Alasan**:
- Provider resmi (Polygon.io, Twelve Data) memerlukan biaya atau memiliki batasan ticker
- TradingView memiliki cakupan instrumen paling luas (saham global, forex, komoditas, crypto)
- Dengan guardrails yang tepat (rate limiter, retry, error handling), risiko dapat dikelola

**Guardrails yang harus ada**:
- ✅ Rate limiter dengan exponential backoff sudah ada (`rate-limiter.ts`)
- ✅ Error handling ketat — tidak ada silent fallback ke provider lain
- ✅ Bridge syntax validated sebelum deploy
- 🔲 TODO: Health check endpoint untuk deteksi TV rate limit dini

### 2. Arsitektur Storage: Postgres sebagai Operational Store, QuestDB sebagai Analytical Store

Menggantikan ambiguitas sebelumnya, peran masing-masing storage dikunci:

```
┌──────────────────────────────────────────────────────┐
│                    DATA SOURCES                      │
│  TradingView Scraper (Python)  │  Yahoo Finance      │
│  Binance klines API (Rust)     │  TradingView WS     │
└────────────┬─────────────────────────────────────────┘
             │
      ┌──────▼──────────────────────────────────┐
      │           API (Bun/Elysia)              │
      │  On-demand backfill (user request)      │
      │  Market data Proxy (Smart Routing)      │
      └──────┬──────────────────────────────────┘
             │
     ┌───────▼───────┐      ┌───────────────────┐
     │   Postgres    │      │     QuestDB        │
     │  (Operational)│      │   (Analytical)     │
     │               │      │                    │
     │  • symbols    │      │  • candles (OHLCV) │
     │  • users      │      │  • ticks           │
     │  • watchlist  │      │                    │
     │  • portfolios │      │  ← diisi Engine    │
     │  • market_data│ ──── │    (via Redis pub) │
     │    (cache     │ pub  │                    │
     │     sementara)│      │                    │
     └───────────────┘      └───────────────────┘
```

**Aturan**:
- `market_data` di Postgres adalah **operational cache** sementara
- QuestDB adalah **source of truth** untuk data OHLCV jangka panjang
- Data dari Postgres **HARUS** dipromosikan ke QuestDB via Engine (lihat G1)

### 3. Fix INGEST-PENDING: Redis Pub/Sub ke Engine (RESOLVED ✅)

**Status**: Terintegrasi penuh (Mei 2026).

**Implementasi**:
- **API**: `SyncService.ts` melakukan `SADD` simbol ke `harvest:realtime:symbols` dan menerbitkan sinyal `harvest:ingest-pending` secara atomik.
- **Engine**: Background listener di `main.rs` berlangganan ke channel Redis tersebut dan memicu `Notify` ke scraper untuk penyegaran instan tanpa restart.

### 4. Lot Size Synchronization & Volume Normalization (RESOLVED ✅)

**Konteks**: Simbol bursa tertentu (seperti IDX `.JK`) melaporkan volume dalam unit "lot" (100 lembar), sementara bursa lain melaporkan dalam lembar saham. Ini menyebabkan diskontinuitas data volume di QuestDB.

**Keputusan**:
1. **Metadata Store**: `SymbolService` (API) menyimpan `lotSize` di PostgreSQL dan menyinkronkannya ke Redis hash `harvest:lot-sizes`.
2. **Engine Enrichment**: Engine Rust melakukan caching `lot_size` lokal (berbasis Redis) dan secara otomatis mengalikan field `volume` pada setiap *tick* dan *candle* sebelum penulisan ke QuestDB.
3. **Default**: Lot size default adalah 1. Simbol `.JK` dideteksi secara otomatis dan diset ke 100.

### 5. SQLite Browser Cache: TTL Per Interval

**Saat ini**: Tidak ada TTL — data lama mungkin tersimpan selamanya.

**Target**: TTL dikonfigurasi per interval:

| Interval | TTL Cache |
|---|---|
| 1m, 5m | 5 menit |
| 15m, 30m | 15 menit |
| 1h, 4h | 1 jam |
| 1d, 1wk, 1mo | 4 jam |

Implementasi: tambah kolom `cachedAt` di SQLite, query cek apakah `now - cachedAt > TTL`.

### 6. Source-Aware Cache Key (Sudah Diimplementasikan ✅)

Cache key format: `TICKER:INTERVAL:SOURCE`
- Contoh: `BTCUSD:1d:TRADINGVIEW`, `BTCUSD:1d:YAHOO`
- Mencegah polusi cache antar provider

### 7. Bridge Syntax Validation pada CI/CD

Tambahkan step di pipeline:
```yaml
- name: Validate Python bridge syntax
  run: python3 -m py_compile apps/api/src/scripts/bridge_tradingview.py
```
---

## Gap Status

| Gap | Status | Target |
|---|---|---|
| G1: OHLCV tidak naik ke QuestDB | ✅ Fixed | Redis pub/sub ke Engine |
| G2: INGEST-PENDING signal tidak nyata | ✅ Fixed | Redis publish setelah backfill |
| G3: SQLite tanpa TTL | 🔲 Belum | TTL per interval di useMarketCache |
| G4: `return` invalid di bridge | ✅ Fixed | — |
| G5: `console.time()` blocking | ✅ Fixed | `performance.now()` |
| G6: Cache key tanpa source | ✅ Fixed | `TICKER:INTERVAL:SOURCE` |

---

## Prioritas Pekerjaan Selanjutnya

1. **HIGH**: SQLite TTL per interval (G3)
2. **MEDIUM**: CI/CD step untuk Python syntax validation

## Referensi
- ADR-0007: Unified Market Data Lake Strategy
- ADR-0009: Autonomous Harvesting Pipeline
- `apps/api/src/modules/market/services/candle.service.ts` — titik backfill
- `apps/api/src/modules/market/providers/tradingview-python.provider.ts` — bridge
- `apps/frontend/src/stores/market/composables/useMarketCache.ts` — SQLite cache
