# ADR-0015: Real-Time Candle Streaming via TradingView Chart Session Multiplexer

**Status**: Accepted  
**Date**: 2026-05-03  
**Authors**: Engineering Team  
**Supersedes**: ADR-0013 (Incremental Sync — now demoted to gap-filler role)

---

## Context

ADR-0013 planned an *incremental sync* model: after backfill completes, a
BullMQ job polls Obscura every minute per symbol to fetch the latest candle.

After analysis, this Pull Model has fundamental limitations when the target
is **1-minute OHLCV-based algo-trading alerts across hundreds of symbols**:

| Issue | Pull (ADR-0013) | Streaming (This ADR) |
|---|---|---|
| Latency per candle | 60–120 s | < 5 s |
| New WS connection per symbol/poll | Yes (expensive) | No (multiplexed) |
| Missed candles on restart | Possible | Replayable via Redis Streams |
| TradingView throttle risk | High (open/close flood) | Low (persistent session) |
| Scalability to 300+ symbols | Poor | Good (50 sessions/conn) |

**Industrial standard** (used by Bloomberg, Refinitiv, retail terminal vendors):
one persistent WebSocket connection per session bucket carries *N* chart
sessions that push candle updates as each bar closes — no polling needed.

TradingView's own DataFeed API does exactly this internally.

---

## Decision

### 1. New Rust Component: `CandleStreamer`

A new `engine::candle_streamer::CandleStreamer` component runs alongside the
existing `TradingViewScraper` (tick stream). It:

- Opens **one WS connection per ≤ 50 symbols** (safe TradingView limit).
- Per symbol: creates one `chart_create_session` + `create_series` for each
  target interval (e.g. `1m`).
- Listens for **`du` (data update)** push messages — emitted by TradingView
  whenever the forming candle is updated, and when a new bar opens (old bar
  is now closed).
- Uses a **"last-seen-timestamp" state machine** to detect when a candle is
  closed (new bar's timestamp > previous bar's timestamp).
- On closed candle:
  1. `Batcher → QuestDB` via ILP (persistence + query source of truth).
  2. `XADD stream:candles:{interval}` → Redis Streams (event bus for alerts).

### 2. Redis Streams — not Pub/Sub — for candle events

| | Redis Pub/Sub | Redis Streams |
|---|---|---|
| Persistence | ❌ Fire-and-forget | ✅ Up to configurable MAXLEN |
| Consumer groups | ❌ | ✅ Multiple independent consumers |
| Replay on restart | ❌ | ✅ Resume from last ACKed entry |
| Use case | Tick price (loss OK) | OHLCV candles (loss NOT OK) |

Stream key: `stream:candles:1m` (one stream per interval).  
Consumer group: `alert-engine` (created by API on startup).

Each stream entry fields:
```
symbol    AAPL
interval  1m
open      150.25
high      150.80
low       150.10
close     150.75
volume    125000
timestamp 1714742460   (unix seconds, UTC)
```

### 3. API: `CandleConsumer` Service

A new `CandleConsumer` TypeScript service (started at API boot) runs a tight
`XREADGROUP` loop:

```
XREADGROUP GROUP alert-engine api-worker-1 COUNT 10
           BLOCK 2000
           STREAMS stream:candles:1m >
```

For each entry:
1. Query Postgres for active alerts matching `symbol + interval`.
2. Push one BullMQ job per alert to the existing `alerts` queue.
3. `XACK` — acknowledge to prevent redelivery.

This keeps the `AlertWorker` unchanged: it still evaluates PineTS and
dispatches notifications. CandleConsumer is purely a fanout bridge.

### 4. ADR-0013 Role Change

Incremental sync via Obscura poll is **demoted to gap-filling**:
- Runs at a 5-minute cadence (not 1-minute).
- Only fills symbols that are NOT yet tracked by CandleStreamer.
- Handles the case where the engine was offline and missed candles.
- Sets `backfill_status = INCREMENTAL` after first run (preserving status machine).

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Rust Engine                               │
│                                                             │
│  ┌─────────────────────┐   ┌──────────────────────────────┐ │
│  │  TradingViewScraper │   │      CandleStreamer           │ │
│  │  (tick / quote QSD) │   │                              │ │
│  │                     │   │  WS Conn 1 (≤50 symbols)    │ │
│  │  quote_create_sess  │   │   cs_001 → AAPL/1m          │ │
│  │  → TickData         │   │   cs_002 → TSLA/1m          │ │
│  │  → Redis PUBLISH    │   │   ...                        │ │
│  │    tick:{symbol}    │   │  WS Conn 2 (next 50)        │ │
│  │  → QuestDB `ticks`  │   │   cs_051 → SYM51/1m         │ │
│  └─────────────────────┘   │                              │ │
│                             │  On candle CLOSE:            │ │
│  ┌─────────────────────┐   │  → Batcher → QuestDB         │ │
│  │  Backfiller         │   │    `candles` (ILP)           │ │
│  │  (Obscura/Yahoo/    │   │  → XADD stream:candles:1m    │ │
│  │   Binance)          │   │    (Redis Stream)            │ │
│  │                     │   └──────────────────────────────┘ │
│  │  Gap-filler only    │                                     │
│  │  (every 5 min)      │                                     │
│  └─────────────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
                                │
                    stream:candles:1m (Redis)
                                │
┌─────────────────────────────────────────────────────────────┐
│                     API (Bun/Node)                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  CandleConsumer                                      │   │
│  │  XREADGROUP GROUP alert-engine                       │   │
│  │  → find alerts WHERE symbol+interval                 │   │
│  │  → BullMQ.add("alerts", { alertId, candle })        │   │
│  │  → XACK                                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────▼───────────────────────────────┐   │
│  │  AlertWorker (BullMQ)                                │   │
│  │  → PineTS evaluate                                   │   │
│  │  → Redis cooldown check                              │   │
│  │  → AlertNotificationService dispatch                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Connection Scaling Table

| Symbol Count | WS Connections | Chart Sessions/Conn | Notes |
|---|---|---|---|
| ≤ 50 | 1 | ≤ 50 | Single connection |
| 51–100 | 2 | ≤ 50 each | Auto-spawn |
| 101–300 | 3–6 | ≤ 50 each | Safe range |
| 301–1000 | 7–20 | ≤ 50 each | May need IP rotation |
| > 1000 | Needs TradingView API key | — | Commercial plan |

For **≤ 300 symbols** (initial target), 6 WS connections is acceptable.
TradingView unofficially allows this for non-commercial, non-HFT use.

---

## Consequences

**Positive:**
- Candle delivery latency: 1–5 seconds from bar close (vs 60–120 s for pull).
- No per-symbol WS open/close overhead during steady state.
- Missed-candle recovery via Redis Streams replay on restart.
- Scales to 300 symbols with 6 WS connections.

**Negative / Risks:**
- TradingView WS is an **unofficial API** — protocol can change without notice.
- Candle data for the **last forming bar** arrives incrementally (partial OHLCV);
  only the closed bar should be written as final.
- Per-connection state must be carefully managed to avoid memory leaks on
  session rotation.

**Mitigations:**
- Backfiller (ADR-0013) acts as a fallback gap-filler.
- QuestDB DEDUP keys (ADR-0013) ensure idempotent re-writes if a candle is
  delivered twice after reconnect.
- Emit only CLOSED bars (timestamp-change detection), not partial forming bars.

---

## Implementation Files

| File | Change |
|---|---|
| `apps/engine/src/engine/candle_streamer.rs` | **NEW** — Chart session multiplexer |
| `apps/engine/src/engine/redis_stream.rs` | **NEW** — Redis Streams XADD wrapper |
| `apps/engine/src/engine/mod.rs` | Expose new modules |
| `apps/engine/src/main.rs` | Wire CandleStreamer alongside existing scraper |
| `apps/api/src/modules/alert/services/CandleConsumer.ts` | **NEW** — Redis Stream → BullMQ bridge |
| `apps/api/src/app.ts` (or entry) | Start CandleConsumer on boot |
