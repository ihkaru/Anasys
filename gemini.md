# Project Status and Progress

## Overview

- **Project**: High Performance Finance App (Analisis)
- **Stack**: Bun, ElysiaJS, Vue 3, Framework7, Drizzle ORM, PostgreSQL (TimescaleDB).
- **Monorepo**: Bun Workspaces.
- **Protocol**: ALL commands (`bun`, `node`, `npm`) MUST be run via WSL (`wsl <command>`) or inside a WSL terminal. Do NOT run them on Windows Host.

## Status: 2026-01-28

### ✅ Completed

#### Backend
- [x] Initialized Monorepo Structure.
- [x] Created `docker-compose.yml` (Postgres + Backend).
- [x] Setup `apps/backend` (ElysiaJS) with modular architecture.
- [x] Setup `packages/db` (Drizzle ORM) with TimescaleDB.
- [x] Implemented Market APIs:
  - `GET /market/overview` - Default indices overview
  - `POST /market/overview` - Dynamic quotes for multiple tickers
  - `GET /market/quotes?tickers=...` - Real-time quotes
  - `GET /market/search?q=...` - Symbol search via Yahoo Finance
  - `GET /market/trending` - Trending symbols by region
  - `GET /market/recommendations/:ticker` - Similar assets
  - `GET /market/movers` - Top gainers/losers
  - `GET /market/history/:ticker` - OHLCV data
- [x] Implemented QuoteService with caching & rate limiting
- [x] YahooFinanceProvider with quote, search, trending, recommendations
- [x] SchedulerService for periodic data sync (hourly)

#### Frontend
- [x] Setup `apps/frontend` (Vue 3 + Framework7 + Vite).
- [x] Implemented Charts with `lightweight-charts`.
- [x] Refactored large components into smaller modules:
  - ChartPage → TradingChart, IntervalSelector, SignalSummaryCard, AssetDetailsCard, RecommendationsSection
  - ExplorePage → TrendingSection, AssetItemList, CategoryChips, useExploreFilters
  - HomePage → UserGreeting, MarketSummaryCard, WatchlistSelector, WatchlistItemList, AddAssetSheet
  - PortfolioPage → PortfolioSummaryCard, AllocationChart, HoldingsList, AddHoldingSheet
- [x] MarketStore with search, trending, quotes, recommendations
- [x] WatchlistStore with real-time price fetching
- [x] HoldingsStore with portfolio management
- [x] Animated tab transitions in MainLayout

### 🔧 Architecture Notes

#### Backend Rate Limiting Strategy
- **Quotes**: Batched (5 per request), 500ms delay between batches
- **Caching TTL**:
  - Quotes: 1 minute
  - Search: 5 minutes
  - Trending: 15 minutes
  - Recommendations: 1 hour
- **Scheduler**: Syncs 15 stale symbols per hour

#### Frontend-Backend Data Flow
- Frontend NEVER calls Yahoo Finance directly
- Backend acts as caching proxy to prevent rate limiting
- Real-time data fetched on-demand via `fetchOverview(tickers)`
- Trending and search use backend APIs with caching

## Next Steps

- [ ] Implement holdings price refresh endpoint
- [ ] Add financial statements (earnings, income, balance sheet)
- [ ] Implement push notifications for price alerts
- [ ] Add offline support with SQLite caching
- [ ] Performance optimization (virtualized lists)

## 🔄 Routine Maintenance Tasks

### Automatic (Built-in Scheduler)
These run automatically when the backend is running:

| Task | Frequency | Description |
|------|-----------|-------------|
| Stale Symbol Sync | Every 1 hour | Syncs 15 oldest symbols with Yahoo Finance |

### Manual Commands (Run via `bun run`)

Run these commands from `apps/backend/`:

| Command | Frequency | Description |
|---------|-----------|-------------|
| `bun run repair:vip` | **Daily** (recommended) | Repair gaps in VIP symbols (watchlist + holdings) |
| `bun run repair:dry` | Before major changes | Analyze database without making changes |
| `bun run repair` | **Weekly** | Full repair for all ~2000 symbols (~1 hour) |
| `bun run audit` | Monthly | Detect and remove anomalous data globally |

### Rate Limit Safe Operations
All repair scripts use:
- **1.5s minimum delay** between Yahoo API requests
- **Exponential backoff** (2x, 4x, 8x) on rate limit errors
- **3 retries** before failing
- **VIP prioritization** (watchlist + holdings first)

### Database Health Checks

```bash
# Check for anomalies and gaps (no changes)
bun run repair:dry

# Expected healthy output:
# Anomalies Found: 0
# Gaps Detected: 0 (or minimal)
```

### Recovery Procedures

If you see many anomalies or gaps:
```bash
# 1. First, clean anomalies only
bun run audit

# 2. Then, repair VIP symbols first
bun run repair:vip

# 3. Finally, full repair (optional, takes ~1hr)
bun run repair
```

## Notes

- `bun` command was not available in Windows shell, so structure was created manually to be run in WSL/Docker.
- **Critical**: User must run `bun install` in the root directory (via WSL) to bootstrap the project.
- **Tools**: Use `wsl bash -lc "..."` to run commands if simple `wsl` fails to find PATH.
- **Swipe Conflict**: Tab swipe disabled to allow horizontal scroll in trending/watchlist components.

