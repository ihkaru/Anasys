# ADR-0010: Comprehensive Polyglot Data Flow Architecture Diagram

## Status
Approved (Documented May 2026)

## Konteks
Setelah migrasi ke *Rust-based High-Throughput Engine* dan penerapan arsitektur *Polyglot Persistence* (kombinasi PostgreSQL + QuestDB), terjadi risiko kebingungan teknis di sesi *engineering* (seperti kebingungan letak data `Market Data (OHLCV)`). 

Untuk itu, dokumen ini diciptakan sebagai representasi visual absolut menggunakan Mermaid JS agar tidak ada lagi kesalahan persepsi terkait aliran data.

## Arsitektur Aliran Data (Data Flow Architecture)

Diagram di bawah ini mengilustrasikan bagaimana Anasys melakukan *harvesting* data secara masif, bagaimana *Engine* dan *API* berkomunikasi, serta di mana masing-masing jenis data berakhir.

```mermaid
graph TD
    %% -------------------------
    %% External Data Sources
    %% -------------------------
    subgraph External["🌐 External Market Sources"]
        TV["TradingView WS (Obscura)"]
        YF["Yahoo Finance (REST)"]
        BN["Binance (REST/WS)"]
        MC["Macro / FED Data"]
    end

    %% -------------------------
    %% Anasys Core Engine (Rust)
    %% -------------------------
    subgraph Engine["🦀 Anasys Engine (Rust)"]
        direction TB
        
        Orch["Backfill Orchestrator\n(Task Poller)"]
        
        subgraph Fetchers["High-Speed Fetchers"]
            OF["ObscuraFetcher"]
            YF_fetch["YahooFetcher"]
            BF["BinanceFetcher"]
        end
        
        Bat["Engine Batcher\n(Buffer & Flush)"]
        
        Orch -->|Routes tasks based on symbol| Fetchers
        OF -->|OHLCV / Ticks| Bat
        YF_fetch -->|OHLCV| Bat
        BF -->|OHLCV| Bat
    end

    %% -------------------------
    %% Databases (Polyglot Persistence)
    %% -------------------------
    subgraph Storage["🗄️ Polyglot Databases"]
        direction LR
        
        PG[("🐘 PostgreSQL\n(Relational & Metadata)")]
        QDB[("🚀 QuestDB\n(Time-Series OHLCV)")]
        RD[("🔴 Redis\n(Pub/Sub & Cache)")]
    end

    %% -------------------------
    %% Anasys API (Node/Bun)
    %% -------------------------
    subgraph API_Layer["🟢 Anasys API (Node.js/Bun)"]
        direction TB
        
        API_Core["Elysia API Server"]
        ORM["Drizzle ORM"]
        Q_REST["QuestDB HTTP Client"]
        
        API_Core --> ORM
        API_Core --> Q_REST
    end

    %% -------------------------
    %% Frontend / Clients
    %% -------------------------
    Client("💻 Frontend UI (Vue)")

    %% -------------------------
    %% Connections & Data Flow
    %% -------------------------
    
    %% Engine fetching data
    TV -.->|Stealth Handshake| OF
    YF -.-> YF_fetch
    BN -.-> BF
    
    %% Internal API communication (Engine -> API)
    Orch -->|Polls Tasks via REST| API_Core
    Orch -->|Reports Progress (isCompleted)| API_Core
    
    %% API saving metadata to Postgres
    ORM -->|Reads/Writes Tasks, Symbols, Financials| PG
    
    %% Engine saving raw data to QuestDB & Redis
    Bat ==>|Flush OHLCV via ILP (Port 9000)| QDB
    Bat -->|Publish Real-time Ticks| RD
    
    %% API serving data to clients
    Q_REST -->|Reads Historical Candlesticks via HTTP| QDB
    ORM -->|Reads Watchlists, Holdings, Progress| PG
    API_Core -->|Sends Unified Data| Client
    RD -.->|Live Tick Broadcaster| Client

    %% Styling
    classDef external fill:#f9f9f9,stroke:#333,stroke-width:2px,stroke-dasharray: 5 5;
    classDef rust fill:#dea584,stroke:#333,stroke-width:2px;
    classDef db fill:#b3e5fc,stroke:#333,stroke-width:2px;
    classDef api fill:#c8e6c9,stroke:#333,stroke-width:2px;
    
    class External external;
    class Engine rust;
    class Storage db;
    class API_Layer api;
```

## Penjelasan Komponen Kunci

### 1. 🐘 PostgreSQL (The Source of Truth)
Menyimpan semua data yang memiliki struktur relasional ketat, membutuhkan *update/delete* reguler, dan berukuran kecil-menengah:
- `users`, `watchlists`, `portfolios`
- `symbols`, `symbol_financials`, `analyst_ratings`
- `backfill_progress` (Pusat antrian tugas untuk engine)

*Akses: Hanya boleh diakses oleh Node.js API melalui Drizzle ORM.*

### 2. 🚀 QuestDB (The Time-Series Sink)
Database spesialis penyimpan triliunan baris data waktu.
- `market_data` (OHLCV candles).
- `ticks` (Data *order-book* atau harga super real-time).

*Akses:*
- **Write:** Dilakukan eksklusif oleh Rust Engine melalui protokol super cepat **Influx Line Protocol (ILP)** agar *hard disk* tidak mengalami keausan (menggunakan metode batch).
- **Read:** Dilakukan oleh Node.js API melalui HTTP REST (Port 9000) saat *Frontend* meminta data grafik untuk di-*render*.

### 3. 🦀 Rust Engine (The Harvester)
Tidak memiliki akses langsung ke PostgreSQL. Ia berinteraksi dengan ekosistem Anasys melalui dua cara:
1.  Meminta tugas dan melaporkan *progress* ke Node.js API via REST endpoint (`/api/market/internal/...`).
2.  Menyemburkan (*flush*) data harga OHLCV historis secara borongan langsung ke QuestDB.

## Manfaat Dokumentasi Ini
- Menjadi panduan utama saat melakukan *benchmarking* (Benchmark script untuk OHLCV kini HANYA membaca dari QuestDB, karena Postgres tidak lagi menyimpan data harga).
