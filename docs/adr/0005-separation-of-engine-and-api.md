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
