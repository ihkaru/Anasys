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
