# ADR-0007: Unified Market Data Lake Strategy

## Status
Accepted (Diperbarui: 2026-04-26)

## Konteks
Anasys bertujuan menjadi **pemilik data pasar itu sendiri** — bukan sekadar pembungkus API pihak ketiga.
Visi akhirnya adalah sebuah sistem yang secara otonom memanen data dari seluruh bursa dunia, 24/7, tanpa memerlukan interaksi user sama sekali. Sehingga dalam jangka panjang, semua ticker dengan semua timeframe sudah tersedia di storage lokal kita.

## Keputusan Arsitektur

### 1. Tier Data

| Tier | Teknologi | Tujuan |
|---|---|---|
| **Engine (Hot)** | QuestDB | Raw ticks + historical OHLCV hasil scrape Anasys Engine (Rust). Sumber kebenaran jangka panjang. |
| **Provider (Warm)** | Yahoo Finance, TradingView | Fallback untuk ticker yang belum ada di Engine. Juga sebagai seed data historis. |
| **Cache (Cold)** | PostgreSQL + SQLite | Metadata simbol (nama, logo, exchange), cache quote client-side. |

### 2. Smart Proxy — Backend Sebagai Router

**Frontend tidak pernah memilih sumber data.** Frontend hanya mengirim `ticker` + `interval`.

Backend (`MarketService.getOHLCV`) bertugas sebagai Smart Proxy:

```
Request: GET /market/history/AAPL?interval=1d

Smart Proxy Logic:
1. Cek Engine (QuestDB)
   → ADA data? → Downsample dari ticks → Return ke frontend ✅
   → TIDAK ADA? → Lanjut ke step 2

2. Ambil dari Provider Eksternal (Yahoo)
   → Kirim data ke frontend (user tidak menunggu)
   → Fire-and-forget: Log INGEST-PENDING signal ⚡
     (masa depan: trigger Engine untuk mulai scrape ticker ini)
```

### 3. Autonomous Harvesting (Visi Jangka Panjang)

Ketika infrastruktur Engine siap, scraper akan berjalan secara otonom:
- **Discovery**: Secara periodik memindai seluruh ticker dari bursa yang didukung.
- **Ingestion On-Demand**: Setiap kali ada `INGEST-PENDING` log (dari Smart Proxy), Engine mulai menscrape ticker tersebut.
- **Backfill**: Setelah ticker mulai discrape, Engine mengisi data historis (backfill) dari provider eksternal ke QuestDB.
- **Self-Healing**: Jika ada gap data (misal server down), Engine otomatis mengisi kekosongan dari provider.

Hasilnya: **Setiap request chart ke depannya akan dilayani dari Engine**, bukan provider eksternal.

### 4. Realtime Quotes

Real-time quotes (harga live di navbar) tetap menggunakan Yahoo/TradingView via WebSocket karena:
- Engine belum tentu menscrape semua ticker secara realtime.
- Yahoo/TV memberikan update harga yang cukup akurat untuk tampilan live price.

Ini bisa berubah di masa depan jika Engine sudah memiliki cakupan penuh.

### 5. Pencarian Multi-Source

Hasil pencarian (`GET /api/market/search`) mengembalikan semua hasil dari semua provider:
- Query dijalankan paralel: **Database → Yahoo → TradingView**.
- Hasil dari Database menggunakan `source` aslinya (bukan dipaksa menjadi "LOCAL").
- User memilih dari hasil mana yang ingin ditambahkan ke watchlist, tanpa perlu tahu detail teknis routing datanya.

## Konsekuensi

- **Frontend lebih sederhana**: Tidak ada state `selectedSource`. UI bersih dari keputusan teknis.
- **Routing terpusat**: Semua logika "dari mana data diambil" berada di `MarketService.getOHLCV` — satu tempat.
- **Siap untuk otomasi**: Arsitektur ini sudah menyediakan titik integrasi (`INGEST-PENDING`) untuk Engine harvester di masa depan.
- **Konsistensi data**: User selalu mendapat data terbaik yang tersedia tanpa perlu memilih secara manual.

## Referensi
- `apps/api/src/modules/market/market.service.ts` — `getOHLCV` (Smart Proxy), `searchSymbolsMultiSource`
- `apps/api/src/modules/market/services/QuestDBService.ts` — Query interface ke Engine
- `apps/frontend/src/stores/market/market.store.ts` — Store tanpa `selectedSource`
- `apps/frontend/src/stores/market/composables/useMarketHistory.ts` — Fetch history tanpa source param
