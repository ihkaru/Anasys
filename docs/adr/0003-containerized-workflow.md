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

## Standarisasi Base Image & Dependensi (Update Mei 2026)
Pengujian di lingkungan produksi (Coolify) menemukan isu kompabilitas serius (GLIBC mismatch) ketika binary Rust yang dikompilasi di Debian Bookworm (glibc 2.38) dijalankan di host OS dengan glibc lebih lama (2.36 atau kurang). Oleh karena itu, diputuskan untuk mengubah standar produksi:

1.  **Alpine Standard for Production**: Guna menjamin portabilitas absolut dan menghindari dependensi glibc eksternal, seluruh binary Rust untuk produksi **wajib** dikompilasi menggunakan target `x86_64-unknown-linux-musl` di dalam base image `rust:alpine`. Runtime image menggunakan `alpine:3.23`.
2.  **Performance Optimization (mimalloc)**: Karena allocator bawaan `musl` memiliki isu performa (lock contention) pada aplikasi multi-threaded, kita **wajib** menggunakan `mimalloc` sebagai global allocator di Engine Rust untuk semua build `musl`.
3.  **Pure-Rust Crypto Backend**: Semua library networking (`reqwest`, `redis`, `tokio-tungstenite`) **wajib** dikonfigurasi untuk menggunakan backend kriptografi `ring` (`rustls-tls-manual-roots`), secara eksplisit menghindari default `aws-lc-rs` yang rentan terhadap versi *assembler* dan *libc* dari OS Host.
4.  **Strict Service Readiness**: Docker Compose wajib menggunakan `healthcheck` yang presisi pada seluruh service (`engine`, `api`, `frontend`, `questdb`, `postgres`, `redis`) guna memastikan orkestrasi yang stabil.

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
