# ADR-0002: Arsitektur Rust-First Performance (Bun + Rust + QuestDB)

## Status
Proposed (Revised based on Technical Review)

## Konteks
Berdasarkan tinjauan teknis mendalam terhadap arsitektur awal (ADR-0001), kita menghadapi tantangan kritis pada infrastruktur server:
- **Storage: HDD (Mechanical Disk)**. Penulisan real-time (tick-by-tick) ke HDD akan menyebabkan *disk thrashing* dan kegagalan sistem.
- **Complexity**: Penggunaan tiga runtime (Bun, Python, Rust) menambah kerumitan *deployment* dan overhead IPC (Inter-Process Communication).
- **RAM 16GB**: Kapasitas memori harus dikelola secara presisi untuk memberikan ruang bagi *write buffer* database.

## Decision Drivers
*   **HDD Resilience**: Strategi "Write-Buffer-First" untuk meminimalkan beban I/O pada piringan mekanis HDD.
*   **Zero IPC Overhead**: Menghilangkan latensi antar-bahasa dengan konsolidasi logika ke Rust.
*   **Stack Simplification**: Menghapus ketergantungan pada Python runtime untuk efisiensi *maintenance*.
*   **Determinism**: Kontrol penuh atas alokasi memori dan *flush timing* untuk data real-time.

## Keputusan Arsitektur
Kita akan beralih dari model "Hybrid" ke **Rust-First Architecture**:

1. **Integrated Ingestion (Rust)**: Scraper WebSocket TradingView akan di-rewrite sepenuhnya ke Rust menggunakan `tokio-tungstenite`. Satu proses Rust akan menangani koneksi, parsing protocol, dan kalkulasi.
2. **Write-Buffer Strategy**: Rust akan mengalokasikan *in-process memory buffer* (misal 256MB-512MB) untuk menampung aliran data tick. Data akan di-*flush* ke QuestDB secara sekuensial dalam batch besar (setiap 2-5 detik) untuk mengakomodasi keterbatasan HDD.
3. **Core Engine (Rust via Bun.ffi)**: Logika indikator teknikal tetap di Rust, namun diintegrasikan langsung ke Bun API melalui FFI (Foreign Function Interface). Hal ini menghilangkan kebutuhan akan Unix Sockets atau `stdout` IPC.
4. **QuestDB Optimization**: Database akan dikonfigurasi khusus untuk *sequential writes*. WAL (Write-Ahead Log) akan diletakkan pada buffer memori sebelum dikomit ke HDD.
5. **Shared Stream (Redis 8.0)**: Tetap digunakan sebagai distributor data ke frontend via WebSockets/Server-Sent Events untuk skalabilitas 100+ user.

## Konsekuensi
- **Positif**: 
    - **Performa HDD Terjaga**: Penulisan sekuensial yang terkontrol memperpanjang umur HDD dan menjaga responsivitas sistem.
    - **Single Logic Tree**: Tidak ada lagi fragmentasi kode antara Python dan Rust.
    - **Deployment Ringan**: Menghapus ketergantungan Python, `pip`, dan venv di server produksi (Coolify).
- **Negatif**:
    - **Kurva Pembelajaran**: Tim harus menangani protokol WebSocket TradingView yang kompleks langsung di Rust (tanpa bantuan library Python yang sudah ada).
    - **Development Time**: Proses *rewrite* scraper awal akan memakan waktu lebih lama dibanding menggunakan bridge Python.

## Estimasi Penggunaan Resource (Production Level)
| Komponen | Estimasi RAM | Alasan |
| :--- | :--- | :--- |
| **Rust Scraper + Engine** | 150 - 300 MB | Termasuk TLS stack, internal buffers, dan indicator caches. |
| **Write Buffer (RAM)** | 512 MB | Alokasi khusus untuk memitigasi bottleneck HDD. |
| **QuestDB** | 2 - 4 GB | Penggunaan cache yang agresif untuk pembacaan data historis. |
| **Redis 8.0** | 500 MB | State management dan real-time Pub/Sub. |
| **Bun API Backend** | 300 - 500 MB | Manajemen session user dan REST API. |
| **Total Estimasi** | **~6 GB** | **Status: SANGAT AMAN** (Sisa ~10GB untuk OS Page Cache). |

## Mitigasi Risiko
- **HDD Write-Rate Monitoring**: Menambahkan alert jika *flush latency* dari buffer ke HDD mulai meningkat melampaui batas aman.
- **Protocol Stability**: Menggunakan unit test yang ketat di Rust untuk memastikan parser WebSocket tidak pecah saat TradingView memperbarui skema pesan mereka.

## Referensi
- Tinjauan Teknis Arsitektur (April 2026)
- Dokumentasi QuestDB: HDD Storage Optimization.
- Spesifikasi Server: Intel Xeon, 16GB RAM, 1TB HDD.
