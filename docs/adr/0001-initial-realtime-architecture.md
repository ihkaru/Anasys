# ADR-0001: Arsitektur Awal Pengambilan Data Real-time (Status Quo)

## Status
Accepted

## Konteks
Saat ini, proyek **Anasys** membutuhkan data pasar (stock/crypto) secara real-time untuk ditampilkan di frontend dan digunakan oleh sistem alert. Karena ketiadaan API resmi yang gratis dan stabil untuk data tick-by-tick, sistem menggunakan library pihak ketiga.

Arsitektur saat ini adalah sebagai berikut:
1. **Backend (Node.js/Bun)**: Mengelola state aplikasi dan koneksi klien.
2. **Python Bridge**: Skrip Python (`apps/backend/src/scripts/bridge_tradingview.py`) yang menggunakan library `tradingview-scraper`.
3. **Child Process**: Node.js memicu skrip Python tersebut menggunakan `child_process.spawn`.
4. **Data Flow**: Python mengambil data via WebSocket dari TradingView -> mencetak JSON ke `stdout` -> Node.js membaca `stdout` -> Broadcaster meneruskan ke klien via WebSocket.

## Keputusan Arsitektur Saat Ini
- Menggunakan skrip Python sebagai jembatan karena ekosistem library scraper TradingView lebih matang di Python.
- Mengirimkan daftar simbol (tickers) sebagai argumen baris perintah saat proses dijalankan.
- Komunikasi satu arah dari Python ke Node.js melalui `stdout`.

## Konsekuensi & Batasan (Pain Points)
- **Restart Blackout**: Setiap kali simbol ditambahkan atau dihapus, proses Python harus dimatikan (`kill`) dan dijalankan ulang. Hal ini menyebabkan jeda (blackout) data selama beberapa detik bagi seluruh pengguna yang sedang aktif.
- **Scalability**: Menjalankan satu proses Python per stream mungkin tidak efisien jika jumlah simbol sangat banyak.
- **Reliability**: Jika proses Python mati, Node.js harus mendeteksi dan merestart manual, yang bisa menyebabkan data hilang sementara.
- **Rate Limiting**: Karena menggunakan scraping WebSocket TradingView (tidak resmi), ada risiko pemblokiran IP jika koneksi dibuka-tutup terlalu sering (akibat restart proses).

## Referensi
- `apps/backend/src/modules/realtime/streams/TradingViewStreamHandler.ts`
- `apps/backend/src/scripts/bridge_tradingview.py`
