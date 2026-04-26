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
