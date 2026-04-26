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
