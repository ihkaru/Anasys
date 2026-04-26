# ADR-0008: Opportunistic Metadata Enrichment

## Status
Accepted

## Konteks
Database Anasys memiliki >11,000 simbol yang sebagian besar hanya memiliki ticker (misal: `AAPL`) tanpa nama lengkap (`Apple Inc.`) atau informasi bursa. Melakukan enrichment massal (bulk) melalui Yahoo Finance API akan memicu **Rate Limit (HTTP 429)** dengan sangat cepat.

## Keputusan Arsitektur
Sistem menggunakan strategi **Opportunistic & Lazy Enrichment** untuk mengisi metadata simbol secara bertahap:

### 1. Opportunistic Write-back
Setiap kali sistem melakukan `fetchQuotes` (untuk halaman Trending, Movers, atau Watchlist), Yahoo mengembalikan data `shortName` dan `exchange` dalam paket data harga.
- **Tindakan**: Jika simbol di DB lokal masih memiliki nama yang sama dengan ticker (data stub), sistem secara otomatis melakukan "write-back" ke database untuk memperbarui nama dan bursanya.
- **Keuntungan**: Zero extra API calls. Metadata terisi secara organik hanya untuk simbol-simbol yang aktif dilihat oleh pengguna.

### 2. Lazy Full Enrichment
Data detail (Business Summary, Sector, Industry, Website) hanya diambil ketika pengguna benar-benar membuka halaman detail/chart simbol tersebut.
- **Tindakan**: Memanggil `quoteSummary` on-demand dan menyimpan hasilnya ke DB dengan masa berlaku (TTL) 30 hari.

### 3. Smart Seeding
Menjalankan script berkala (`seed_metadata.ts`) yang menargetkan simbol-simbol paling populer dari Yahoo Screeners (Gainers, Losers, Actives) untuk memastikan dashboard utama selalu memiliki metadata lengkap.

## Konsekuensi
- **Partial Completion**: Simbol-simbol yang tidak pernah trending atau dicari user mungkin akan tetap dalam kondisi "stub" untuk waktu yang lama.
- **Asynchronous Updates**: User mungkin melihat ticker berubah menjadi nama lengkap setelah beberapa kali refresh atau navigasi.

## Referensi
- `apps/api/src/modules/market/services/quote.service.ts` (Write-back logic)
- `apps/api/src/modules/market/services/symbol.service.ts` (Enrichment logic)
- `apps/api/src/scripts/seed_metadata.ts` (Smart seed)
