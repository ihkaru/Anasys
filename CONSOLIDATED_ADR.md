# Consolidated Architecture Decision Records

*Generated on: Sun May  3 10:20:14 PM WIB 2026*

---

## File: 0001-initial-realtime-architecture.md

# ADR-0001: Arsitektur Awal Pengambilan Data Real-time (Status Quo)

## Status
Superceded by ADR-0006 and Implementation of Redis Orchestration

## Konteks & Evolusi
Arsitektur awal yang menggunakan `child_process.spawn` dari Node.js ke Python terbukti kurang stabil untuk produksi karena masalah "Restart Blackout" dan manajemen proses yang kaku. 

Sistem telah berevolusi menjadi arsitektur berbasis **Pub/Sub Orchestration**:
1. **Ingestion Layer (Rust)**: Engine berperforma tinggi yang mengelola scraping/streaming dan menulis langsung ke **Redis** dan **QuestDB**.
2. **Message Bus (Redis)**: Bertindak sebagai buffer dan orchestrator. Data tick-by-tick dipublikasikan ke channel Redis (misal: `ticks:all`).
3. **Delivery Layer (API Gateway/Elysia)**: Tidak lagi menjalankan scraper sendiri. Ia cukup berlangganan (*subscribe*) ke Redis dan meneruskan data ke klien via WebSocket.

## Keuntungan Arsitektur Baru
- **Zero Blackout**: Penambahan simbol di Ingestion Layer tidak mengganggu koneksi WebSocket klien di Delivery Layer.
- **Decoupling**: API Gateway tetap ringan dan fokus pada manajemen koneksi user.
- **Persistensi**: Data otomatis tersimpan di QuestDB untuk analisis historis tanpa membebani aliran realtime.
- **Multi-Source**: Ingestion Layer dapat menarik data dari berbagai provider (Yahoo, TV, CCXT) secara paralel dan menggabungkannya di Redis.

## Konsekuensi
- Membutuhkan infrastruktur Redis yang stabil.
- Kompleksitas debugging meningkat karena data berpindah antar proses/bahasa (Rust -> Redis -> Bun).

## Referensi
- `apps/backend/src/engine/scraper.rs` (Ingestion)
- `apps/api/src/modules/market/services/RealtimeService.ts` (Delivery)
- ADR-0006: Unified Realtime Ingestion

## Referensi
- `apps/backend/src/modules/realtime/streams/TradingViewStreamHandler.ts`
- `apps/backend/src/scripts/bridge_tradingview.py`

---

## File: 0002-hybrid-high-performance-architecture.md

# ADR-0002: Arsitektur Polyglot & Rust-First Performance (PostgreSQL + QuestDB + Redis)

## Status
Approved (Revised based on Schema Audit & Stress Test Results - April 2026)

## Konteks
Berdasarkan pengujian nyata pada 26 April 2026, arsitektur awal (Hybrid) telah ditinggalkan demi efisiensi resource yang ekstrem. Kita menghadapi tantangan hardware spesifik:
- **Storage: HDD (Mechanical Disk)**. Memerlukan penulisan sekuensial masif (batching) untuk mencegah disk thrashing.
- **RAM 16GB**: Kapasitas memori harus dihemat agar bisa dialokasikan untuk OS Page Cache (membantu performa HDD).

## Temuan Baru (Eksperimen April 2026)
- **Rust Performance**: Terukur hanya **4.2MB RAM** untuk memproses 149 simbol aktif.
- **WebSocket Scalability**: Satu koneksi Guest WebSocket stabil menangani **541 simbol unik** secara simultan.
- **Protocol Reverse Engineering**: Mekanisme handshake `~m~` dan heartbeat `~h~` telah berhasil diimplementasikan di Rust.

## Keputusan Arsitektur: Polyglot Persistence & Dual-Path Data Flow
Berdasarkan audit skema Drizzle ORM pada frontend dan Node.js API (yang mengatur entitas kompleks seperti User, Watchlist, Portfolio Holdings, dan Metadata Aset), diputuskan bahwa kita menerapkan **Polyglot Persistence**, di mana dua database bekerja secara spesifik sesuai spesialisasinya:

1.  **PostgreSQL (Relational Source of Truth)**:
    - Menyimpan data bisnis yang butuh operasi mutasi (`UPDATE`, `DELETE`) dan relasi kompleks (ACID).
    - Tabel: `users`, `watchlists`, `holdings`, `symbols`, `categories`, `analyst_ratings`.
    - Diakses eksklusif oleh **Node.js/Bun Backend** via Drizzle ORM.
2.  **QuestDB (Time-Series Sink)**:
    - Secara eksklusif HANYA untuk menyimpan miliaran baris data *tick* & *candlestick* historis.
    - Ditulis oleh **Rust Engine** via InfluxDB Line Protocol (ILP) secara *batching* untuk optimasi mekanis HDD.
    - Di-query oleh Node.js (sebagai *Read-Replica*) saat menggambar grafik historis di UI.
3.  **Redis (Real-time Broadcaster)**:
    - Data tick dari WebSocket langsung dikirim ke UI via Redis Pub/Sub tanpa menyentuh disk.
    - Menjamin *Watchlist* dan *Chart* di UI berkedip instan (latensi milidetik).

## Mitigasi Risiko: Self-Healing Backfiller
Untuk mengatasi risiko kehilangan data histori (gap) saat aplikasi crash (data di buffer hilang):
- Engine dilengkapi modul **Backfiller** mandiri.
- Saat startup, engine mendeteksi celah timestamp di database dan menarik data OHLC 1m yang hilang via REST API TradingView.
- Menjamin akurasi indikator teknikal (SMA, RSI) tetap 100% pada level candle.

## Konsekuensi
- **Positif**:
    - **Resource Hemat**: Menggunakan < 20MB RAM untuk 500+ ticker (Scraper level).
    - **HDD Longevity**: Mengurangi beban mekanis HDD secara signifikan.
    - **Zero-Dependency**: Tidak membutuhkan Python runtime di server.
- **Negatif**:
    - **Complexity**: Membutuhkan logika manajemen buffer dan sinkronisasi backfill yang presisi di Rust.

## Estimasi Penggunaan Resource (Realistis)
| Komponen | Estimasi RAM | Keterangan |
| :--- | :--- | :--- |
| **Rust Engine** | < 100 MB | Scraper, Broadcaster, & Batcher. |
| **Node.js API** | ~ 200 MB | Bun runtime untuk REST API dan GraphQL Frontend. |
| **Write Buffer** | 512 MB | Buffer penahan sebelum flush ke HDD. |
| **PostgreSQL 16** | ~ 500 MB | Database operasional ringan untuk data pengguna & bisnis. |
| **QuestDB** | 2 - 4 GB | Database storage & historical time-series cache. |
| **Redis 8.0** | 500 MB | Real-time Pub/Sub distribution. |
| **OS Page Cache** | ~10 GB | Sisa RAM yang digunakan Linux untuk mempercepat I/O HDD. |

## Referensi
- Hasil Stress Test 541 Simbol (April 2026).
- Strategi Batch-Flush untuk Mechanical Storage.

---

## File: 0003-containerized-workflow.md

# ADR-0003: Containerized Development and Production Workflow

## Status
Approved

## Konteks
Sebelumnya, pengembangan dilakukan secara lokal menggunakan runtime sistem (Bun, Rust) sementara database menggunakan Docker. Hal ini menimbulkan risiko "It works on my machine" dan kerumitan dalam sinkronisasi versi library antara developer dan production server (Coolify).

## Keputusan Arsitektur
Kita mengadopsi strategi **"Full Containerization"** untuk seluruh siklus pengembangan:

1.  **Environment Parity**: Menggunakan Docker untuk Development dan Production guna meminimalisir perbedaan perilaku sistem (terutama terkait networking dan filesystem).
2.  **Service Naming & Context**:
    *   **`engine`**: Mengacu pada Rust Performance Engine (`apps/engine`).
    *   **`api`**: Mengacu pada Bun API Gateway (`apps/api`).
3.  **Separated Dockerfiles**:
    *   **`Dockerfile.dev`**: Dioptimalkan untuk kecepatan iterasi. Menggunakan `cargo-watch` (engine) atau `bun --watch` (api) untuk hot-reload.
    *   **`Dockerfile.prod`**: Dioptimalkan untuk keamanan dan ukuran menggunakan multi-stage build.
3.  **Volume-Based Development**: Melakukan *mounting* source code ke dalam container dev agar perubahan kode terdeteksi secara instan tanpa perlu melakukan build ulang image.
4.  **Persistent Cargo Cache**: Menggunakan Docker Volumes untuk folder `target/` dan `cargo_registry` guna mempercepat kompilasi ulang di dalam container.

## Standarisasi Base Image & Dependensi (Update Mei 2026 - Re-evaluated)
Pengujian di lingkungan produksi (Coolify) menemukan isu kompabilitas serius (GLIBC mismatch) ketika binary Rust dijalankan di host OS dengan glibc lama. Namun, ditemukan bahwa Engine menggunakan **Obscura** (headless browser engine berbasis V8) yang memiliki ketergantungan libc sangat kompleks dan tidak didukung secara stabil di lingkungan `musl`. Oleh karena itu, diputuskan strategi final:

1.  **Ubuntu 24.04 (Noble) for Production**: Guna menjamin dukungan V8/Obscura dan simbol glibc terbaru (termasuk GLIBC 2.38+), standar runtime image dialihkan ke `ubuntu:24.04`. Ini menyediakan glibc 2.39 yang kompatibel ke belakang dengan build environment terbaru.
2.  **glibc Build Strategy**: Seluruh binary Rust untuk produksi dikompilasi menggunakan target standard `x86_64-unknown-linux-gnu` di dalam image berbasis Debian Bookworm. Kita tidak lagi menggunakan `musl` guna menghindari fragilitas build V8.
3.  **Pure-Rust Crypto Backend**: Tetap menggunakan backend kriptografi `ring` (`rustls-tls-manual-roots`) untuk menghindari dependensi pada library sistem yang bervariasi.
4.  **Strict Service Readiness**: Docker Compose tetap menggunakan `healthcheck` yang presisi guna memastikan orkestrasi yang stabil di Coolify.

## Konsekuensi

### Positif
- **Seamless Onboarding**: Developer baru hanya perlu menjalankan `./dev.sh start` tanpa perlu menginstal Rust atau library sistem secara manual.
- **Coolify Ready**: Konfigurasi `docker-compose.yml` utama sudah siap untuk langsung di-*deploy* ke produksi.
- **Consistent Tooling**: Memastikan versi Rust dan library networking selalu seragam di semua environment.

### Negatif
- **Storage Overhead**: Docker volumes untuk cache Rust bisa memakan ruang disk yang cukup besar (beberapa GB).
- **Initial Build Time**: Build awal di dalam Docker mungkin sedikit lebih lambat dibanding build native di host machine.

## Mitigasi
- Menambahkan `.dockerignore` yang ketat untuk memastikan hanya file yang diperlukan yang masuk ke dalam build context.
- Menyediakan skrip `dev.sh` sebagai abstraksi perintah Docker yang kompleks agar tetap mudah digunakan.

## Referensi
- [ADR-0002: Arsitektur Rust-First Performance](file:///home/ihza/projects/Anasys/docs/adr/0002-hybrid-high-performance-architecture.md)
- Dokumentasi `cargo-watch` untuk hot-reloading.

---

## File: 0004-pure-bun-ecosystem.md

# ADR-0004: Pure Bun Ecosystem (All-in-One Toolchain)

## Status
Approved (April 2026)

## Konteks
Monorepo Anasys terdiri dari berbagai lapisan teknologi:
- **Bun API Gateway** (`apps/api`) - TypeScript/Elysia.js.
- **Vue 3/Vite Frontend** (`apps/frontend`) - TypeScript.
- **Shared Drizzle ORM Schema** (`packages/db`) - TypeScript.
- **Rust Performance Engine** (`apps/engine`) - High-performance data ingestion.

Dalam mengelola *dependencies* TypeScript/JavaScript, awalnya terdapat kebingungan arsitektural antara mencampur penggunaan PNPM (sebagai *package manager*) dan Bun (sebagai *runtime*). Menggunakan dua *package manager* berbeda di satu *repository* berisiko memunculkan konflik *lockfile* ganda, duplikasi *cache*, dan kompleksitas *toolchain*.

## Keputusan Arsitektur
Mulai April 2026, Anasys mengadopsi standar **Pure Bun Ecosystem** untuk seluruh komponen berbasis JavaScript/TypeScript. Komponen **Rust Performance Engine** dikecualikan dari standar ini dan tetap dikelola secara native menggunakan `cargo`.

Bun akan digunakan sebagai satu-satunya *toolchain* untuk seluruh ekosistem JS/TS:

1.  **Package Manager (`bun install`)**: 
    - Menggantikan npm/pnpm. Menggunakan algoritma *global cache* dan resolusi *native* berkecepatan tinggi.
    - File `bun.lock` bertindak sebagai *source of truth* untuk resolusi dependensi (mendukung format *binary* untuk CI/CD yang lebih kencang).
2.  **Workspace Manager (`bun --filter`)**: 
    - Mengelola interaksi *cross-package* (`@apps/backend` -> `@packages/db`) langsung secara *native* dari properti `"workspaces"` di `package.json` tanpa `pnpm-workspace.yaml`.
3.  **Runtime & Test Runner (`bun run`, `bun test`)**: 
    - Eksekusi instan untuk file TypeScript (Elysia.js backend) dan *test suite*.

## Konsekuensi
- **Positif**:
    - **Zero Tooling Fatigue**: Hanya memerlukan satu CLI tool (`bun`) untuk seluruh siklus pengembangan (install, dev, build, test, lint).
    - **Instalasi Super Cepat**: Waktu resolusi *node_modules* terpangkas signifikan dibandingkan alat lain.
    - **Native TS Support**: Tidak perlu `ts-node` atau konfigurasi kompilasi tambahan di *backend*.
- **Negatif**:
    - **Vendor Lock-in**: Ekosistem sangat bergantung pada siklus rilis dan *bug-fixes* dari tim pengembang Bun. Jika ada fitur *cutting-edge* yang *broken* di Bun, seluruh *pipeline* akan terpengaruh (mitigasi: mengunci versi spesifik di produksi).

## Referensi
- Diskusi optimasi *monorepo* April 2026.
- Rilis Bun Workspace v1.x+.

---

## File: 0005-separation-of-engine-and-api.md

# ADR-0005: Physical Separation of Performance Engine (Rust) and API Gateway (Bun)

## Status
Approved (April 2026)

## Konteks
Sebelumnya, komponen backend Anasys (Rust Engine dan TypeScript API) digabungkan dalam satu direktori `apps/backend`. Struktur "hybrid" ini menyebabkan beberapa masalah:
- **Konflik Toolchain**: `package.json` dan `Cargo.toml` berada di lokasi yang sama, membingungkan proses instalasi dan build Docker.
- **Complexity in Deployment**: Dockerfile menjadi sangat besar dan kompleks karena harus menangani dua runtime (Rust dan Bun) sekaligus.
- **Resource Management**: Sulit untuk melakukan scaling layanan secara terpisah di lingkungan produksi (misalnya: menambah jumlah replika API tanpa menduplikasi Engine yang melakukan scraping).

## Keputusan Arsitektur
Diputuskan untuk memisahkan secara fisik komponen backend menjadi dua aplikasi mandiri di dalam monorepo:

1.  **`apps/engine` (Rust)**:
    *   **Fungsi**: Scraping data realtime dari TradingView, batching, dan ingestion ke QuestDB via ILP.
    *   **Runtime**: Native Rust (Dockerized).
    *   **Port**: Tidak mengekspos port publik, hanya berkomunikasi internal ke QuestDB/Redis.

2.  **`apps/api` (Bun)**:
    *   **Fungsi**: REST API, Autentikasi, Business Logic, dan akses PostgreSQL via Drizzle.
    *   **Runtime**: Bun (Elysia.js).
    *   **Port**: Mengekspos port `3000` (internal) / `28081` (host).

## Konsekuensi

### Positif
- **Clean Separation of Concerns**: Logika performa tinggi (Rust) terisolasi dari logika bisnis (TypeScript).
- **Independent Scaling**: API dapat di-scale secara horizontal tanpa mempengaruhi Engine.
- **Docker Optimization**: Setiap layanan memiliki Dockerfile yang spesifik dan jauh lebih kecil/cepat untuk di-build.
- **Improved Dev Experience**: Perintah `bun --filter` dan `cargo` menjadi lebih presisi tanpa resiko konflik file konfigurasi.

### Negatif
- **Orchestration Overhead**: Memerlukan dua definisi layanan terpisah di `docker-compose.yml`.
- **Inter-service Communication**: Perlu manajemen environment variable yang lebih disiplin untuk memastikan API tahu cara menghubungi layanan lain (QuestDB/Redis).

## Referensi
- [ADR-0002: Arsitektur Polyglot Persistence](file:///home/ihza/projects/Anasys/docs/adr/0002-hybrid-high-performance-architecture.md)
- [ADR-0004: Pure Bun Ecosystem](file:///home/ihza/projects/Anasys/docs/adr/0004-pure-bun-ecosystem.md)

---

## File: 0006-unified-realtime-ingestion.md

# ADR-0006: Unified Real-time Ingestion via Redis Pub/Sub

## Status
Approved (April 2026)

## Konteks
Sebelumnya, sistem memiliki beberapa mekanisme pengambilan data real-time yang tersebar:
- Rust Engine melakukan scraping TradingView untuk batching ke QuestDB.
- Bun API memiliki handler sendiri (`BinanceStreamHandler`, `TradingViewStreamHandler`) yang mencoba membuka koneksi WebSocket langsung ke penyedia data.

Masalah yang muncul:
- **Redundansi Koneksi**: Dua layanan berbeda (Engine dan API) membuka koneksi WebSocket ke simbol yang sama, memboroskan bandwidth dan meningkatkan risiko rate-limiting.
- **Instabilitas API**: Handler di sisi Bun API (TypeScript) terbukti kurang stabil untuk mempertahankan ribuan koneksi WebSocket dan memiliki masalah dependensi eksternal (seperti ketergantungan pada script Python).
- **Inkonsistensi Data**: Ada potensi perbedaan tipis antara data yang disimpan di QuestDB (via Engine) dan data yang dikirim ke client (via API).

## Keputusan Arsitektur
Diputuskan untuk memusatkan seluruh tanggung jawab pengambilan data real-time (Ingestion) pada **Anasys Performance Engine (Rust)**.

1.  **Single Ingestor**: Hanya Rust Engine yang diizinkan melakukan koneksi WebSocket ke penyedia data eksternal (Binance, TradingView, dll).
2.  **Redis Pub/Sub as Backbone**: Rust Engine mempublikasikan setiap *tick* data ke Redis Pub/Sub pada channel `ticks:all` dan `tick:<SYMBOL>`.
3.  **Passive Consumer API**: Bun API dirombak untuk menghapus seluruh handler upstream langsung. API kini hanya berlangganan (Subscribe) ke Redis dan meneruskan data tersebut ke WebSocket client (Broadcasting).
4.  **Source Normalization**: Data dipetakan ke dalam format `QuoteUpdate` yang seragam sebelum dipublikasikan ke Redis, sehingga API tidak perlu peduli dari mana asal datanya.

## Konsekuensi

### Positif
- **Efisiensi Ekstrim**: Hanya ada satu koneksi per penyedia data, terlepas dari berapa banyak user yang terhubung ke API.
- **Stabilitas API**: Kode API menjadi jauh lebih sederhana dan ringan (tanpa logika rekoneksi WebSocket yang kompleks).
- **Data Integrity**: Menjamin bahwa data yang dilihat user di WebSocket identik dengan data yang masuk ke database QuestDB.
- **Skalabilitas**: Kita bisa menambah ratusan instansi API untuk melayani jutaan user tanpa menambah beban koneksi ke Binance/TradingView.

### Negatif
- **Ketergantungan pada Redis**: Jika Redis mati, alur data real-time terputus (meskipun Redis sangat stabil).
- **Latensi Redis**: Ada tambahan latensi mikrodetik (µs) saat data melewati Redis, namun ini diabaikan dibandingkan latensi jaringan internet.

## Referensi
- [ADR-0005: Physical Separation of Engine and API](0005-separation-of-engine-and-api.md)

---

## File: 0007-multi-source-data-strategy.md

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

---

## File: 0008-opportunistic-metadata-enrichment.md

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

---

## File: 0009-autonomous-harvesting-pipeline.md

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

---

## File: 0010-hybrid-architecture-diagram.md

# ADR-0010: Comprehensive Polyglot Data Flow Architecture Diagram

## Status
Approved (Documented May 2026)

## Konteks
Setelah migrasi ke *Rust-based High-Throughput Engine* dan penerapan arsitektur *Polyglot Persistence* (kombinasi PostgreSQL + QuestDB), terjadi risiko kebingungan teknis di sesi *engineering* (seperti kebingungan letak data `Market Data (OHLCV)`). 

Untuk itu, dokumen ini diciptakan sebagai representasi visual absolut menggunakan Mermaid JS agar tidak ada lagi kesalahan persepsi terkait aliran data.

## Arsitektur Aliran Data (Data Flow Architecture)

Diagram di bawah ini mengilustrasikan bagaimana Anasys melakukan *harvesting* data secara masif, bagaimana *Engine* dan *API* berkomunikasi, serta di mana masing-masing jenis data berakhir.

```mermaid
graph TD
    %% -------------------------
    %% External Data Sources
    %% -------------------------
    subgraph External["🌐 External Market Sources"]
        TV["TradingView WS (Obscura)"]
        YF["Yahoo Finance (REST)"]
        BN["Binance (REST/WS)"]
        MC["Macro / FED Data"]
    end

    %% -------------------------
    %% Anasys Core Engine (Rust)
    %% -------------------------
    subgraph Engine["🦀 Anasys Engine (Rust)"]
        direction TB
        
        Orch["Backfill Orchestrator\n(Task Poller)"]
        
        subgraph Fetchers["High-Speed Fetchers"]
            OF["ObscuraFetcher"]
            YF_fetch["YahooFetcher"]
            BF["BinanceFetcher"]
        end
        
        Bat["Engine Batcher\n(Buffer & Flush)"]
        
        Orch -->|Routes tasks based on symbol| Fetchers
        OF -->|OHLCV / Ticks| Bat
        YF_fetch -->|OHLCV| Bat
        BF -->|OHLCV| Bat
    end

    %% -------------------------
    %% Databases (Polyglot Persistence)
    %% -------------------------
    subgraph Storage["🗄️ Polyglot Databases"]
        direction LR
        
        PG[("🐘 PostgreSQL\n(Relational & Metadata)")]
        QDB[("🚀 QuestDB\n(Time-Series OHLCV)")]
        RD[("🔴 Redis\n(Pub/Sub & Cache)")]
    end

    %% -------------------------
    %% Anasys API (Node/Bun)
    %% -------------------------
    subgraph API_Layer["🟢 Anasys API (Node.js/Bun)"]
        direction TB
        
        API_Core["Elysia API Server"]
        ORM["Drizzle ORM"]
        Q_REST["QuestDB HTTP Client"]
        
        API_Core --> ORM
        API_Core --> Q_REST
    end

    %% -------------------------
    %% Frontend / Clients
    %% -------------------------
    Client("💻 Frontend UI (Vue)")

    %% -------------------------
    %% Connections & Data Flow
    %% -------------------------
    
    %% Engine fetching data
    TV -.->|Stealth Handshake| OF
    YF -.-> YF_fetch
    BN -.-> BF
    
    %% Internal API communication (Engine -> API)
    Orch -->|Polls Tasks via REST| API_Core
    Orch -->|Reports Progress (isCompleted)| API_Core
    
    %% API saving metadata to Postgres
    ORM -->|Reads/Writes Tasks, Symbols, Financials| PG
    
    %% Engine saving raw data to QuestDB & Redis
    Bat ==>|Flush OHLCV via ILP (Port 9000)| QDB
    Bat -->|Publish Real-time Ticks| RD
    
    %% API serving data to clients
    Q_REST -->|Reads Historical Candlesticks via HTTP| QDB
    ORM -->|Reads Watchlists, Holdings, Progress| PG
    API_Core -->|Sends Unified Data| Client
    RD -.->|Live Tick Broadcaster| Client

    %% Styling
    classDef external fill:#f9f9f9,stroke:#333,stroke-width:2px,stroke-dasharray: 5 5;
    classDef rust fill:#dea584,stroke:#333,stroke-width:2px;
    classDef db fill:#b3e5fc,stroke:#333,stroke-width:2px;
    classDef api fill:#c8e6c9,stroke:#333,stroke-width:2px;
    
    class External external;
    class Engine rust;
    class Storage db;
    class API_Layer api;
```

## Penjelasan Komponen Kunci

### 1. 🐘 PostgreSQL (The Source of Truth)
Menyimpan semua data yang memiliki struktur relasional ketat, membutuhkan *update/delete* reguler, dan berukuran kecil-menengah:
- `users`, `watchlists`, `portfolios`
- `symbols`, `symbol_financials`, `analyst_ratings`
- `backfill_progress` (Pusat antrian tugas untuk engine)

*Akses: Hanya boleh diakses oleh Node.js API melalui Drizzle ORM.*

### 2. 🚀 QuestDB (The Time-Series Sink)
Database spesialis penyimpan triliunan baris data waktu.
- `market_data` (OHLCV candles).
- `ticks` (Data *order-book* atau harga super real-time).

*Akses:*
- **Write:** Dilakukan eksklusif oleh Rust Engine melalui protokol super cepat **Influx Line Protocol (ILP)** agar *hard disk* tidak mengalami keausan (menggunakan metode batch).
- **Read:** Dilakukan oleh Node.js API melalui HTTP REST (Port 9000) saat *Frontend* meminta data grafik untuk di-*render*.

### 3. 🦀 Rust Engine (The Harvester)
Tidak memiliki akses langsung ke PostgreSQL. Ia berinteraksi dengan ekosistem Anasys melalui dua cara:
1.  Meminta tugas dan melaporkan *progress* ke Node.js API via REST endpoint (`/api/market/internal/...`).
2.  Menyemburkan (*flush*) data harga OHLCV historis secara borongan langsung ke QuestDB.

## Manfaat Dokumentasi Ini
- Mencegah teknisi atau AI di masa depan kebingungan mencari data OHLCV di PostgreSQL.
- Mengamankan *Drizzle ORM* dari eksperimen *schema* yang tidak perlu untuk tipe data *time-series*.
- Menjadi panduan utama saat melakukan *benchmarking* (Benchmark script HARUS membaca dari dua tempat: PostgreSQL dan QuestDB).

---

## File: 0011-ultra-stealth-harvesting-protocol.md

# ADR-0011: Ultra-Stealth Harvesting Protocol & Soft-Block Mitigation

## Status
Accepted (Mei 2026)

## Konteks

Setelah implementasi ADR-0009, ditemukan bahwa pemanenan data skala besar (backfilling >12.000 simbol) memicu mekanisme pertahanan dari penyedia data (terutama Yahoo Finance). Masalah utama yang muncul adalah:

1. **Hard Blocks (429)**: Respon status "Too Many Requests" yang memicu penghentian sementara.
2. **Soft Blocks (HTML Consent/CAPTCHA)**: Penyedia data tidak memberikan status 429, melainkan mengembalikan halaman HTML (Captcha/Consent) yang menyebabkan error decoding JSON pada engine Rust.
3. **Yahoo Intraday Limits**: Permintaan data intraday (1m, 15m, 1h) yang melebihi 60 hari ke belakang memicu error 422 Unprocessable Entity, yang jika terjadi berulang kali dapat memicu blokir IP.
4. **Monitoring Gap**: Jendela pengukuran benchmark yang terlalu pendek (3 detik) tidak mampu menangkap progres pada mode konkurensi rendah.

## Keputusan Arsitektur

### 1. Protokol Pemanenan "Ultra-Stealth"

Untuk meniru perilaku manusia dan menghindari deteksi bot, Engine Rust sekarang menggunakan parameter berikut:
- **Konkurensi Rendah**: Maksimal **3 workers** paralel (sebelumnya 20, lalu 5).
- **Inter-task Delay**: Jeda **1 detik** statis di antara peluncuran tugas baru di loop utama.
- **Micro-Jitter**: Jeda acak **0-1000ms** di dalam setiap worker sebelum melakukan request HTTP.
- **User-Agent Roulette**: Rotasi otomatis daftar User-Agent modern untuk setiap request.

### 2. Strategi Mitigasi Blokir Halus (Soft-Block)

- **HTML vs JSON Validation**: `YahooFetcher` sekarang membaca body respon sebagai string mentah sebelum mencoba melakukan parsing JSON. Jika body mengandung kata kunci seperti "Consent", "Captcha", atau "Robot", sistem akan melempar error khusus `RATE_LIMIT`.
- **Global Cooldown (Backoff)**: Jika error `RATE_LIMIT` terdeteksi (baik 429 maupun Soft-Block), mesin akan melakukan "istirahat total" selama **30 detik** sebelum mencoba tugas berikutnya.

### 3. Smart Chunking & Lookback Guard

- **Intraday Lookback Limit**: Untuk interval < 1d, Engine sekarang membatasi `target_start_date` maksimal **60 hari** ke belakang dari waktu saat ini.
- **Auto-Completion**: Jika rentang waktu tugas berada di luar batas provider (misal: mencari data 15m dari 1 tahun yang lalu di Yahoo), tugas tersebut akan ditandai sebagai `Completed` dengan 0 hasil untuk menghindari perulangan yang sia-sia (trash loop).

### 4. Precision Benchmarking Pattern

- **10-Second Delta**: Jendela pengukuran benchmark ditingkatkan menjadi **10 detik**. Ini diperlukan agar statistik `Activity TPS` tetap valid dan stabil pada mode konkurensi rendah.
- **Activity Heartbeat**: Fokus monitoring dialihkan ke `Activity TPS` (pergerakan updatedAt di DB) daripada sekadar `Completion TPS`, karena satu tugas backfill historis bisa memakan waktu lebih lama dari jendela observasi benchmark.

## Konsekuensi

### Positif
- **High Reliability**: Sistem dapat berjalan berhari-hari tanpa terkena blokir IP permanen.
- **Clean Backlog**: Tugas-tugas "sampah" (di luar batas provider) dibersihkan secara otomatis.
- **Better Observability**: Laporan benchmark memberikan gambaran yang jujur tentang pergerakan data riil di QuestDB.

### Negatif
- **Throughput Menurun**: Kecepatan pemanenan per detik turun drastis dibandingkan mode agresif. Namun, efisiensi jangka panjang meningkat karena tidak ada waktu mati (downtime) akibat blokir.
- **Estimasi Penyelesaian**: Waktu penyelesaian total untuk 12.000+ simbol menjadi lebih lama (hari vs jam), namun ini adalah harga yang harus dibayar untuk stabilitas data.

## Referensi
- ADR-0009: Autonomous Harvesting Pipeline
- File: `apps/engine/src/backfiller/mod.rs` (Loop Logic)
- File: `apps/engine/src/backfiller/yahoo.rs` (Stealth Logic)
- File: `apps/api/src/scripts/institutional_benchmark.ts` (Monitoring Logic)

---

## File: 0012-data-pipeline-best-practices.md

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

### 3. Fix INGEST-PENDING: Redis Pub/Sub ke Engine (TODO Priority High)

**Saat ini**: `INGEST-PENDING` hanya berupa log string — Engine tidak tahu.

**Target**:
```typescript
// Setelah backfill berhasil di candle.service.ts:
await redisClient.publish('harvest:ingest-pending', JSON.stringify({
  ticker,
  interval,
  source,
  latestTimestamp: candles.at(-1)?.timestamp,
}));
```

```rust
// Engine Rust subscribe ke channel ini:
// harvest:ingest-pending → tambahkan ke harvest:realtime:symbols
// → Engine mulai scrape ticker ini secara real-time
```

### 4. SQLite Browser Cache: TTL Per Interval

**Saat ini**: Tidak ada TTL — data lama mungkin tersimpan selamanya.

**Target**: TTL dikonfigurasi per interval:

| Interval | TTL Cache |
|---|---|
| 1m, 5m | 5 menit |
| 15m, 30m | 15 menit |
| 1h, 4h | 1 jam |
| 1d, 1wk, 1mo | 4 jam |

Implementasi: tambah kolom `cachedAt` di SQLite, query cek apakah `now - cachedAt > TTL`.

### 5. Source-Aware Cache Key (Sudah Diimplementasikan ✅)

Cache key format: `TICKER:INTERVAL:SOURCE`
- Contoh: `BTCUSD:1d:TRADINGVIEW`, `BTCUSD:1d:YAHOO`
- Mencegah polusi cache antar provider

### 6. Bridge Syntax Validation pada CI/CD

Tambahkan step di pipeline:
```yaml
- name: Validate Python bridge syntax
  run: python3 -m py_compile apps/api/src/scripts/bridge_tradingview.py
```

---

## Gap Status

| Gap | Status | Target |
|---|---|---|
| G1: OHLCV tidak naik ke QuestDB | 🔲 Belum | Redis pub/sub ke Engine |
| G2: INGEST-PENDING signal tidak nyata | 🔲 Belum | Redis publish setelah backfill |
| G3: SQLite tanpa TTL | 🔲 Belum | TTL per interval di useMarketCache |
| G4: `return` invalid di bridge | ✅ Fixed | — |
| G5: `console.time()` blocking | ✅ Fixed | `performance.now()` |
| G6: Cache key tanpa source | ✅ Fixed | `TICKER:INTERVAL:SOURCE` |

---

## Prioritas Pekerjaan Selanjutnya

1. **HIGH**: Implementasi Redis pub/sub dari API ke Engine untuk INGEST-PENDING (G1, G2)
2. **MEDIUM**: SQLite TTL per interval (G3)
3. **LOW**: CI/CD step untuk Python syntax validation

## Referensi
- ADR-0007: Unified Market Data Lake Strategy
- ADR-0009: Autonomous Harvesting Pipeline
- `apps/api/src/modules/market/services/candle.service.ts` — titik backfill
- `apps/api/src/modules/market/providers/tradingview-python.provider.ts` — bridge
- `apps/frontend/src/stores/market/composables/useMarketCache.ts` — SQLite cache

---

