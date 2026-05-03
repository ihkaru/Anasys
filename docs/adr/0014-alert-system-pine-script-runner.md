# ADR-0014: Alert System & Pine Script Runner untuk Algo Trading

## Status
Proposed (Mei 2026) — Pending Implementation

## Konteks

Berdasarkan diagnosis mendalam, sistem Anasys memiliki fondasi data yang kuat (real-time ticks via Redis Pub/Sub, OHLCV di QuestDB, BullMQ, multi-asset by design) tetapi belum memiliki mekanisme untuk:

1. **Alert berbasis indikator teknikal** (price crossing threshold, RSI overbought, dll)
2. **Eksekusi logika algo trading** yang ditulis pengguna dalam bahasa yang familiar

Visi jangka panjang adalah mendukung **Pine Script Runner** — kemampuan menjalankan strategi trading yang ditulis di Pine Script (atau sintaks kompatibel) menggunakan data backend Anasys sendiri, tanpa bergantung pada TradingView cloud.

### State of the Art per Mei 2026

#### Pine Script Runtime Options

| Proyek | Bahasa | Pendekatan | Status |
|---|---|---|---|
| **PineTS** (LuxAlgo) | **TypeScript** | Native Transpiler & Runtime, 1:1 syntax compatibility | **Aktif (Rilis Apr 2026)** |
| **PyneCore** | Python | AST transformation, Pine-compatible functions | Aktif |
| **OpenPineScript** | TypeScript | Local runtime engine, interpretasi Pine Script asli | Beta |

**Keputusan**: Menggunakan **PineTS** (LuxAlgo) sebagai runner utama.

**Alasan**:
- **Native Bun Support**: Berjalan langsung di proses API kita (TypeScript). Tidak perlu menambah kompleksitas infrastruktur dengan sidecar Python service.
- **High Freshness**: Rilis terbaru (April 2026) menjamin dukungan terhadap fitur Pine Script v6 terbaru.
- **Streaming Ready**: Memiliki API streaming yang bisa langsung di-pipe dari Redis Pub/Sub kita.

> [!WARNING]
> **Pertimbangan Lisensi**: PineTS menggunakan **AGPL-3.0**. Jika Anasys dipublikasikan sebagai SaaS, kita wajib membuka source code Anasys ke publik atau membeli lisensi komersial. Jika Anasys hanya digunakan secara internal/pribadi, lisensi ini tidak menjadi masalah.

#### Alert Architecture per Mei 2026

Best practice industri menggunakan **Hot/Cold Path Separation**:
- **Hot Path**: Ingestion → Indicator check → Alert trigger (harus < 1 detik)
- **Cold Path**: Logging, historical aggregation, notification delivery (bisa async via BullMQ)

---

## Penilaian Kesiapan Arsitektur Saat Ini

| Komponen | Kesiapan | Catatan |
|---|---|---|
| Fondasi data real-time | ████████░░ 80% | Redis Pub/Sub ticks sudah ada |
| Data OHLCV historis | ████░░░░░░ 40% | G1 ADR-0012 belum resolved — OHLCV tidak lengkap |
| Indicator engine | ████████░░ 80% | **PineTS** menggantikan manual implementation |
| Alert state management | ░░░░░░░░░░ 0% | Belum ada schema, belum ada state machine |
| Delivery pipeline | █████░░░░░ 50% | WebSocket ada, tapi broadcast bukan per-user |
| Multi-asset logic | ██████░░░░ 60% | ANASYS_SCRAPE_SYMBOLS sudah multi-asset |
| Pine Script runner | ██████░░░░ 60% | **PineTS** siap diintegrasikan |

**Kesimpulan**: Alert system **belum bisa diimplementasikan dengan benar** tanpa menyelesaikan G1 (ADR-0012) terlebih dahulu. Alert berbasis indikator dari data OHLCV yang tidak lengkap lebih berbahaya dari tidak ada alert sama sekali — khususnya untuk algo trading.

---

## Keputusan Arsitektur

### Komponen 1 — Alert Schema di PostgreSQL

```sql
-- Definisi alert (dibuat user)
CREATE TABLE alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  name          VARCHAR(255) NOT NULL,
  symbol        VARCHAR(50) NOT NULL,
  interval      VARCHAR(10) NOT NULL,  -- '1m', '5m', '1h', '1d'
  condition_type VARCHAR(50) NOT NULL, -- 'price_above', 'price_below', 'rsi_overbought', 'crossover', dll
  threshold     DOUBLE PRECISION,
  params        JSONB,                 -- Parameter tambahan (misal: RSI period, MA period)
  status        alert_status NOT NULL DEFAULT 'ACTIVE',
  cooldown_minutes INT NOT NULL DEFAULT 60,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Status lifecycle alert
CREATE TYPE alert_status AS ENUM (
  'ACTIVE',       -- Sedang dipantau
  'PAUSED',       -- Dijeda user
  'TRIGGERED',    -- Baru saja fired (transient)
  'COOLDOWN',     -- Menunggu cooldown selesai sebelum bisa fire lagi
  'RESOLVED',     -- Kondisi tidak lagi terpenuhi
  'ACKNOWLEDGED'  -- User sudah lihat/dismiss
);

-- History setiap kali alert fired
CREATE TABLE alert_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id        UUID NOT NULL REFERENCES alerts(id),
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_value   DOUBLE PRECISION,    -- Nilai indikator saat trigger
  trigger_data    JSONB,               -- Data lengkap (OHLCV, semua indikator)
  acknowledged_at TIMESTAMPTZ,
  delivery_status VARCHAR(20) DEFAULT 'PENDING'  -- PENDING, SENT, FAILED
);
```

### Komponen 2 — Alert State Machine (Storm Prevention)

Tanpa state machine, alert akan *spam* saat harga oscillate di sekitar threshold.

```
ACTIVE ──[kondisi terpenuhi]──► TRIGGERED ──[kirim notifikasi]──► COOLDOWN
  ↑                                                                    │
  └────────────[cooldown habis & kondisi tidak terpenuhi]─────────────┘
  
COOLDOWN ──[kondisi masih terpenuhi setelah cooldown]──► TRIGGERED (fire lagi)

ACTIVE/COOLDOWN ──[user pause]──► PAUSED ──[user resume]──► ACTIVE
```

Implementasi cooldown menggunakan Redis untuk hot path (sub-ms check):

```typescript
// Cek cooldown sebelum evaluate (hot path di Redis)
const cooldownKey = `alert:cooldown:${alertId}`;
const inCooldown = await redis.exists(cooldownKey);
if (inCooldown) return; // Skip — masih cooldown

// Setelah fire, set cooldown di Redis
await redis.set(cooldownKey, '1', 'EX', alert.cooldown_minutes * 60);
// Update status di Postgres (cold path, async)
await db.update(alerts).set({ status: 'COOLDOWN' }).where(eq(alerts.id, alertId));
```

### Komponen 3 — Indicator Computation & Pine Script Execution (Unified via PineTS)

Kita tidak lagi membedakan antara "alert sederhana" dan "Pine Script". Keduanya diproses oleh **PineTS** untuk konsistensi:

```typescript
import { PineTS } from 'pinets';

// Di dalam BullMQ job atau Real-time stream handler:
async function evaluateLogic(script: string, candles: any[]) {
  const engine = new PineTS(candles);
  const { plots, signals } = await engine.run(script);
  
  // Evaluasi apakah signal buy/sell muncul atau plot menembus threshold
  return { triggered: signals.length > 0, data: plots };
}
```

### Komponen 4 — Arsitektur Sederhana (Zero Sidecar)

Berbeda dengan rencana awal (PyneCore), kita tidak butuh sidecar Python.

```
┌─────────────────────────────────────────────────────────┐
│                    API (Bun)                             │
│                                                          │
│  1. Pull script dari DB                                 │
│  2. Pull data dari QuestDB (historis) / Redis (live)    │
│  3. Eksekusi via library 'pinets'                       │
│  4. Emit alert jika kondisi terpenuhi                   │
└─────────────────────────────────────────────────────────┘
```

### Komponen 5 — Delivery Pipeline (Per-User WebSocket)

Alert delivery saat ini menggunakan broadcast WebSocket (semua user dapat semua data). Perlu upgrade ke per-user routing:

```typescript
// WebSocket connection map
const userSockets = new Map<string, WebSocket>(); // userId → socket

// Saat alert fired → kirim hanya ke user yang punya alert
async function deliverAlertToUser(userId: string, alertEvent: AlertEvent) {
  const socket = userSockets.get(userId);
  
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'ALERT', data: alertEvent }));
    await markDelivered(alertEvent.id);
  } else {
    // User offline → simpan untuk delivery saat reconnect
    await redis.lpush(`alert:pending:${userId}`, JSON.stringify(alertEvent));
  }
}
```

---

## Latency Budget

| Tipe Alert | Target Latency | Path | Feasible? |
|---|---|---|---|
| Price crosses threshold | < 1 detik | Redis Pub/Sub tick → evaluate → WebSocket | ✅ Ya |
| RSI overbought/oversold | < 5 detik | Per candle close job | ✅ Ya |
| Candlestick pattern | Per candle close | BullMQ job | ✅ Ya |
| Cross-asset correlation | < 30 detik | BullMQ batch job | ⚠️ Perlu desain khusus |
| Pine Script strategy | < 10 detik (on-demand) | PyneCore sidecar | ✅ Ya (bukan real-time) |
| Sub-100ms tick alert | < 100ms | ❌ Tidak tersedia — butuh bid/ask stream & co-location |

---

## Urutan Implementasi (Berdasarkan Prioritas)

### Tahap 0 — Prasyarat (BLOCKER)
- [ ] Selesaikan **G1 ADR-0012**: OHLCV harus proper masuk ke QuestDB (tanpa ini semua tahap berikut tidak akurat)
- [ ] Selesaikan **ADR-0013**: Incremental sync aktif → data selalu fresh

### Tahap 1 — Alert Foundation
- [ ] Drizzle migration: schema `alerts` dan `alert_events` (+ enum `alert_status`)
- [ ] Endpoint `POST /api/market/alerts` (CRUD)
- [ ] Alert state machine + cooldown via Redis
- [ ] BullMQ job `alert-evaluation` per interval

### Tahap 2 — Delivery
- [ ] Per-user WebSocket routing (upgrade dari broadcast)
- [ ] Offline delivery via Redis queue
- [ ] Alert history API (`GET /api/market/alerts/:id/events`)

### Tahap 3 — Pine Script Runner (MVP)
- [ ] `apps/pine-runner/` — FastAPI + PyneCore service
- [ ] Endpoint `POST /api/market/pine/run` di API Gateway
- [ ] Docker service baru di `docker-compose.yml`
- [ ] UI: Pine Script editor di frontend (CodeMirror atau Monaco Editor)

### Tahap 4 — Advanced Alert Types
- [ ] Cross-asset correlation alert
- [ ] Pine Script-based alert (user upload Pine Script → jadikan alert condition)
- [ ] Multi-channel delivery (email, Telegram bot)

---

## Konsekuensi

### Positif
- Alert berbasis indikator yang akurat (setelah G1 resolved)
- Storm prevention via state machine + cooldown
- Pine Script Runner membuka kemungkinan backtesting internal tanpa bergantung TradingView
- Delivery reliable: pesan tidak hilang saat user offline

### Negatif
- **Lisensi AGPL-3.0**: Perlu audit legal jika ingin komersialisasi Anasys secara tertutup.
- **Dependency baru**: Menambah `pinets` library ke API service.
- **Kompleksitas meningkat**: Meskipun bahasa sama (TS), eksekusi script dinamis membutuhkan penanganan memori dan isolasi yang hati-hati.

## Alternatif yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Keputusan |
|---|---|---|---|
| **PineTS (LuxAlgo)** | Same stack (TS), rilis terbaru Apr 2026, 1:1 syntax | Lisensi AGPL-3.0 | ✅ Dipilih |
| PyneCore (Python) | Akurasi tinggi | Tambah Python runtime | ❌ Ditolak (Complexity) |
| OpenPineScript | Same stack | Beta, fitur terbatas | ❌ Ditolak |
| Custom DSL | Full control | Effort tinggi | ❌ Ditolak |

## Referensi
- PineTS: https://github.com/LuxAlgo/PineTS — Pine Script-compatible TypeScript framework
- OpenPineScript: https://github.com/OpenPineScript — TypeScript local runtime
- ADR-0012: Data Pipeline Best Practices (G1 sebagai prasyarat mutlak)
- ADR-0013: Incremental Sync (data freshness prasyarat alert)
- ADR-0009: Autonomous Harvesting Pipeline (BullMQ job patterns)
- Research Mei 2026: Hot/Cold Path Separation untuk trading alert systems
