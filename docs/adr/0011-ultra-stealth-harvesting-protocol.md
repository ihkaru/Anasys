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
