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
| **PyneCore** (pynecore.org) | Python | AST transformation, Pine-compatible functions (`ta.sma`, `ta.rsi`, dll) | Aktif, Apache v2.0 |
| **OpenPineScript** | TypeScript | Local runtime engine, interpretasi Pine Script asli | Beta, community |
| **PineTS** | TypeScript/JS | Transpiler, Pine-style di browser/Node.js | Eksperimental |

**Kesimpulan**: TradingView **tidak mendukung** eksekusi Pine Script secara native di luar platform mereka. Opsi terbaik per Mei 2026 adalah **PyneCore** — open source, Python, kompatibilitas tinggi dengan fungsi `ta.*` Pine Script, dan sudah terbukti akurasi 14-15 digit terhadap hasil TradingView.

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
| Indicator engine | ████░░░░░░ 40% | `@ixjb94/indicators` ada di packages/analysis, belum disambung ke pipeline |
| Alert state management | ░░░░░░░░░░ 0% | Belum ada schema, belum ada state machine |
| Delivery pipeline | █████░░░░░ 50% | WebSocket ada, tapi broadcast bukan per-user |
| Multi-asset logic | ██████░░░░ 60% | ANASYS_SCRAPE_SYMBOLS sudah multi-asset |
| Pine Script runner | ░░░░░░░░░░ 0% | Belum ada, perlu komponen baru |

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

### Komponen 3 — Indicator Computation (Opsi B: BullMQ + API)

Untuk MVP, gunakan **Opsi B** (lebih mudah, pakai tooling yang sudah ada):

```typescript
// BullMQ job — dipicu setiap candle close (per interval)
async function evaluateAlertsForInterval(interval: string) {
  const activeAlerts = await db.select()
    .from(alerts)
    .where(
      and(
        eq(alerts.interval, interval),
        eq(alerts.status, 'ACTIVE')  // + COOLDOWN yang sudah expire
      )
    );

  for (const alert of activeAlerts) {
    // 1. Ambil N candles terakhir dari QuestDB
    const candles = await questdb.query(
      `SELECT * FROM candles WHERE symbol = $1 AND interval = $2 
       ORDER BY timestamp DESC LIMIT 200`,
      [alert.symbol, alert.interval]
    );

    // 2. Hitung indikator via @ixjb94/indicators (packages/analysis)
    const currentValue = await computeIndicator(alert.condition_type, candles, alert.params);

    // 3. Evaluasi kondisi
    const shouldFire = evaluateCondition(alert.condition_type, currentValue, alert.threshold);

    if (shouldFire) {
      await fireAlert(alert, currentValue, candles.at(-1));
    }
  }
}

// Supported condition types (MVP):
type AlertConditionType =
  | 'price_above'         // price > threshold
  | 'price_below'         // price < threshold
  | 'price_crosses_above' // crossover
  | 'price_crosses_below' // crossunder
  | 'rsi_overbought'      // RSI > 70 (atau custom threshold)
  | 'rsi_oversold'        // RSI < 30
  | 'ma_crossover'        // SMA/EMA crossover
  | 'volume_spike';       // volume > N*avg_volume
```

### Komponen 4 — Pine Script Runner (Via PyneCore)

**Arsitektur yang dipilih: PyneCore sebagai sidecar Python service**

```
┌─────────────────────────────────────────────────────────┐
│                    API (Bun/Elysia)                      │
│                                                          │
│  POST /api/market/pine/run                               │
│  { script: string, symbol: string, interval: string }   │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP atau Redis Queue
                     ▼
┌─────────────────────────────────────────────────────────┐
│              PyneCore Runner (Python FastAPI)            │
│                                                          │
│  1. Terima Pine Script (v5/v6) atau Pyne Python code    │
│  2. Ambil data candles dari QuestDB langsung            │
│  3. Jalankan via PyneCore                               │
│  4. Return: signal list, indicator values, backtest stats│
└─────────────────────────────────────────────────────────┘
```

**Contoh flow untuk Pine Script runner:**

```python
# apps/pine-runner/main.py (FastAPI + PyneCore)
from pynecore import Series
from pynecore.lib import script, ta, strategy
from pynecore.providers import CustomProvider  # inject data dari QuestDB

@app.post("/run")
async def run_pine_script(payload: RunRequest):
    # 1. Compile Pine Script → Pyne Python (via pynesys.io API atau offline)
    pyne_code = await compile_pine_to_pyne(payload.script)
    
    # 2. Load data dari QuestDB
    candles = await fetch_from_questdb(payload.symbol, payload.interval, payload.from_date)
    
    # 3. Inject data ke PyneCore provider
    provider = CustomProvider(ohlcv=candles)
    
    # 4. Eksekusi
    result = pynecore.run(pyne_code, provider=provider)
    
    return {
        "signals": result.signals,
        "plots": result.plots,
        "stats": result.stats  # Jika strategy: win rate, max drawdown, dll
    }
```

**Catatan penting tentang Pine Script compilation**:
- PyneCore menyediakan koneksi ke `pynesys.io` untuk compile Pine Script → Pyne Python
- API key pynesys.io diperlukan untuk fitur ini
- Alternatif offline: user menulis langsung dalam sintaks Pyne (Python-compatible), yang lebih sustainable jangka panjang

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
- **PyneCore dependency**: Python runtime baru di infrastruktur. Mitigasi: isolated Docker container, tidak mempengaruhi Bun/Rust services
- **pynesys.io API key**: Diperlukan untuk compile Pine Script v5/v6 → Pyne. Alternatif: user menulis langsung di Pyne syntax
- **Pine Script compatibility gap**: PyneCore belum 100% kompatibel dengan semua fitur Pine Script v6 (khususnya fitur yang baru ditambahkan setelah Jan 2026). Mitigasi: dokumentasikan fitur yang tidak didukung
- **Kompleksitas meningkat**: Dari 2 bahasa (TypeScript + Rust) menjadi 3 bahasa (+ Python). Hanya dapat dibenarkan jika PyneCore memberikan nilai yang tidak bisa dicapai dengan `@ixjb94/indicators` saja

## Alternatif yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Keputusan |
|---|---|---|---|
| OpenPineScript (TypeScript) | Same stack dengan frontend | Beta, belum stabil, Pine v6 support terbatas | ❌ Ditolak |
| QuantConnect | Institutional grade | Berbayar, bukan self-hosted, lock-in | ❌ Ditolak |
| Custom DSL (buat sendiri) | Full control | Engineering effort sangat tinggi | ❌ Ditolak |
| PyneCore (Python) | Open source, Apache v2, akurasi tinggi | Tambah Python runtime | ✅ Dipilih |
| @ixjb94/indicators only | Same stack, zero new service | Tidak support Pine Script syntax dari user | ✅ Dipilih untuk Tahap 1-2 |

## Referensi
- PyneCore: https://pynecore.org — Pine Script-compatible Python framework
- OpenPineScript: https://github.com/OpenPineScript — TypeScript local runtime
- ADR-0012: Data Pipeline Best Practices (G1 sebagai prasyarat mutlak)
- ADR-0013: Incremental Sync (data freshness prasyarat alert)
- ADR-0009: Autonomous Harvesting Pipeline (BullMQ job patterns)
- Research Mei 2026: Hot/Cold Path Separation untuk trading alert systems
