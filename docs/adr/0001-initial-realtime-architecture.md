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
