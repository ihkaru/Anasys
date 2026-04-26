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

## Standarisasi Base Image & Dependensi (Update April 2026)
Pengujian ekstensif menemukan isu kompabilitas (GLIBC mismatch) ketika mengkompilasi dependensi C/Assembly (seperti library kriptografi). Oleh karena itu, diputuskan:
1.  **Debian Bookworm Standard**: Semua *base image* baik dev (`rust:1.95`) maupun prod (`debian:bookworm-slim`) diwajibkan menggunakan ekosistem Debian (glibc). Penggunaan Alpine (musl) atau Ubuntu dilarang untuk menghindari *symbol errors* (`__isoc23_sscanf`) saat runtime.
2.  **Pure-Rust Crypto Backend**: Semua library networking (`reqwest`, `redis`, `tokio-tungstenite`) **wajib** dikonfigurasi untuk menggunakan backend kriptografi `ring` (`rustls-tls-manual-roots`), secara eksplisit menghindari default `aws-lc-rs` yang rentan terhadap versi *assembler* dan *libc* dari OS Host.
3.  **Strict Service Readiness**: Docker Compose wajib menggunakan `healthcheck` yang presisi. Khusus untuk **QuestDB**, healthcheck dikonfigurasi untuk mengikuti redirect (`curl -fL`) guna memastikan ketersediaan Web Console dan REST API sebelum layanan lain (`engine`, `api`) mencoba terhubung.

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
