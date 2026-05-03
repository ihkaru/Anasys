# ADR-0013: Incremental Sync (Forward Fill) untuk Data Pipeline

## Status
Accepted (Mei 2026)

## Konteks

ADR-0009 (Autonomous Harvesting Pipeline) mendefinisikan proses *backfill* — tarik data historis dari IPO/listing hingga hari ini. Namun setelah backfill selesai (`isCompleted = true`), tidak ada mekanisme yang melanjutkan pengisian data ke depan secara berkala.

Akibatnya, data OHLCV di QuestDB akan **stale** — candle baru tidak pernah ditambahkan kecuali ada user yang membuka chart (on-demand), padahal ini tidak menjamin konsistensi data untuk seluruh watchlist/portfolio.

Gap ini juga merupakan **prasyarat** untuk ADR-0014 (Alert System): alert berbasis indikator teknikal tidak bisa akurat jika data candle tidak up-to-date.

### Pola Industri (per Mei 2026)

Platform finansial seperti Bloomberg Terminal internal pipelines, Refinitiv, dan Airflow-based hedge fund pipelines menggunakan **Incremental Append Pattern**: setelah backfill selesai, scheduler tidak berhenti — ia beralih mode dari *bulk backfill* ke *incremental sync* yang mengambil delta dari `lastSyncedAt` sampai `now`.

```
Backfill:   [IPO ──────────────────────────────► T-1]
Incremental:                                      [T-1 ──► T-0 ──► T+1 ──► ...]
```

---

## Keputusan Arsitektur

### 1. Enum Status Baru di `backfill_progress`

Saat ini `backfill_progress` hanya memiliki `isCompleted: boolean`. Ubah menjadi enum status:

```typescript
// packages/db/src/schema.ts (Drizzle ORM)
export const backfillStatus = pgEnum('backfill_status', [
  'PENDING',       // Antri, belum diproses
  'IN_PROGRESS',   // Sedang berjalan
  'COMPLETED',     // Backfill selesai (transient → INCREMENTAL)
  'INCREMENTAL',   // Mode maju: sync berkala dari lastSyncedAt → now
  'FAILED',        // Error, perlu retry manual
  'SKIPPED',       // Data tidak tersedia di provider (sudah ada)
]);
```

Diagram transisi state:

```
PENDING → IN_PROGRESS → COMPLETED → INCREMENTAL
                                         ↑↓ (loop)
                            FAILED ←─────┘
```

### 2. BullMQ Job Baru: `incremental-sync`

Tambah job kelima di scheduler (menyempurnakan empat job di ADR-0009):

```typescript
// scheduler.service.ts
scheduler.add('incremental-sync', {
  pattern: '0 * * * *', // Setiap jam (default)
  // Per-tier override via priority queue (lihat bagian 4)
});
```

Logic core job:

```typescript
async function runIncrementalSync(task: BackfillProgress) {
  // 1. Cek gap di QuestDB — jangan percaya lastSyncedAt di Postgres begitu saja
  const lastCandleInQDB = await questdb.query(
    `SELECT max(timestamp) as last FROM candles WHERE symbol = $1 AND interval = $2`,
    [task.symbol, task.interval]
  );

  const from = lastCandleInQDB.last ?? task.lastSyncedAt;
  const to = new Date();
  const gapMs = to.getTime() - new Date(from).getTime();
  const intervalMs = toMilliseconds(task.interval);

  // 2. Jika gap > 2x interval → mini backfill, bukan incremental biasa
  if (gapMs > intervalMs * 2) {
    return triggerMiniBackfill(task, from, to);
  }

  // 3. Ambil delta saja
  const candles = await fetchCandles(task.symbol, task.interval, from, to);
  if (candles.length === 0) return; // Sudah up-to-date

  // 4. Insert ke QuestDB (idempotent via DEDUP)
  await insertToQuestDB(candles);

  // 5. Update lastSyncedAt
  await db.update(backfillProgress)
    .set({ lastSyncedAt: candles.at(-1)!.timestamp, status: 'INCREMENTAL' })
    .where(eq(backfillProgress.id, task.id));
}
```

### 3. Transisi Otomatis COMPLETED → INCREMENTAL

Setelah Engine Rust menandai backfill selesai, API secara otomatis mempromosikan status:

```typescript
// POST /api/market/internal/backfill/promote-to-incremental
// Dipanggil dari Engine setelah write terakhir ke QuestDB berhasil

async function promoteToIncremental(symbol: string, interval: string) {
  const lastCandle = await questdb.query(
    `SELECT max(timestamp) as last FROM candles WHERE symbol = $1 AND interval = $2`,
    [symbol, interval]
  );

  await db.update(backfillProgress)
    .set({
      status: 'INCREMENTAL',
      isCompleted: true,
      lastSyncedAt: lastCandle.last,
    })
    .where(
      and(
        eq(backfillProgress.symbol, symbol),
        eq(backfillProgress.interval, interval)
      )
    );
}
```

### 4. Priority Tier untuk Incremental Sync

Tidak semua simbol membutuhkan frekuensi sync yang sama. Tier berdasarkan aktivitas user:

| Tier | Kriteria | Sync Frequency | BullMQ Priority |
|---|---|---|---|
| **VIP** | Ada di watchlist/holdings aktif | Tiap 15 menit | 10 (tertinggi) |
| **Active** | Chart dibuka < 7 hari terakhir | Tiap 1 jam | 7 |
| **Standard** | Chart dibuka < 30 hari terakhir | Tiap 6 jam | 4 |
| **Cold** | Tidak diakses > 30 hari | Tiap 24 jam | 1 (terendah) |

Tier ditentukan saat job `incremental-sync` dijalankan, bukan saat dibuat — sehingga selalu fresh.

### 5. Idempotency via QuestDB DEDUP

QuestDB mendukung deduplication level tabel. Pastikan tabel `candles` dibuat dengan opsi ini:

```sql
-- QuestDB DDL
CREATE TABLE IF NOT EXISTS candles (
  symbol       SYMBOL,
  interval     SYMBOL,
  open         DOUBLE,
  high         DOUBLE,
  low          DOUBLE,
  close        DOUBLE,
  volume       DOUBLE,
  source       SYMBOL,
  timestamp    TIMESTAMP
) TIMESTAMP(timestamp)
  PARTITION BY DAY
  DEDUP UPSERT KEYS(symbol, interval, timestamp); -- ← Idempotency key
```

Dengan ini, insert candle yang sudah ada hanya akan di-upsert (tidak duplikat), membuat operasi incremental sync **idempotent** secara native.

---

## Urutan Implementasi

1. **Drizzle migration**: Tambah enum `backfill_status`, migrasikan kolom `isCompleted` boolean ke enum
2. **QuestDB**: Rekreasi tabel `candles` dengan DEDUP option (lihat: G1 di ADR-0012 harus diselesaikan dulu)
3. **API**: Endpoint `POST /internal/backfill/promote-to-incremental`
4. **Engine Rust**: Panggil endpoint promote setelah flush terakhir backfill berhasil
5. **BullMQ**: Job `incremental-sync` dengan priority tier
6. **Testing**: Verifikasi idempotency dengan insert candle yang sama dua kali → tidak duplikat

## Prasyarat

- **G1 ADR-0012 HARUS diselesaikan lebih dulu**: OHLCV harus proper masuk ke QuestDB (bukan hanya close price). Incremental sync yang dimulai dari data yang tidak lengkap akan terus menghasilkan data yang tidak lengkap.
- QuestDB harus running dan schema tabel `candles` sudah dengan DEDUP option.

## Konsekuensi

### Positif
- Data selalu fresh: setiap simbol di watchlist/portfolio mendapat update berkala tanpa interaksi user
- Resource-efficient: tier system memastikan frekuensi sync proporsional dengan aktualitas kebutuhan
- Idempotent: restart job tidak menyebabkan duplikasi data
- Fondasi alert: ADR-0014 dapat berjalan karena data selalu up-to-date

### Negatif
- Migrasi schema: kolom `isCompleted` di `backfill_progress` perlu diubah → perlu Drizzle migration hati-hati
- Satu titik coupling baru: Engine Rust harus memanggil API untuk promote → jika API down saat backfill selesai, status tidak terupdate. Mitigasi: tambah retry di Engine dengan exponential backoff.

## Referensi
- ADR-0009: Autonomous Harvesting Pipeline (4 job types awal)
- ADR-0012: Data Pipeline Best Practices (G1 sebagai prasyarat)
- ADR-0014: Alert System & Algo Trading (incremental sync sebagai prasyarat)
- QuestDB Docs: https://questdb.io/docs/reference/sql/create-table/#dedup
