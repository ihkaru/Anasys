# Project Status and Progress

## Overview

- **Project**: High Performance Finance App (Anasys)
- **Stack**: Bun, ElysiaJS, Vue 3, Framework7, Drizzle ORM, PostgreSQL (TimescaleDB)
- **Monorepo**: Bun Workspaces
- **Protocol**: ALL commands (`bun`, `node`, `npm`) MUST be run via WSL (`wsl <command>`) or inside a WSL terminal. Do NOT run them on Windows Host.

## Status: 2026-01-29

### ✅ Completed

#### Setup & Onboarding

- [x] **One-Command Setup**: `bun run setup` handles everything automatically
- [x] Created `scripts/setup.ts` - interactive setup wizard
- [x] Environment validation with proper error messages
- [x] JWT_SECRET validation (throws error in production if not set)

#### Backend

- [x] Initialized Monorepo Structure
- [x] Created `docker-compose.yml` (Postgres + Backend)
- [x] Setup `apps/backend` (ElysiaJS) with modular architecture
- [x] Setup `packages/db` (Drizzle ORM) with TimescaleDB
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
- [x] **Global Auth Guard** on all market endpoints (401 if not authenticated)
- [x] Centralized config with `src/config.ts`

#### Frontend

- [x] Setup `apps/frontend` (Vue 3 + Framework7 + Vite)
- [x] Implemented Charts with `lightweight-charts`
- [x] Refactored large components into smaller modules:
  - ChartPage → TradingChart, IntervalSelector, SignalSummaryCard, AssetDetailsCard, RecommendationsSection
  - ExplorePage → TrendingSection, AssetItemList, CategoryChips, useExploreFilters
  - HomePage → UserGreeting, MarketSummaryCard, WatchlistSelector, WatchlistItemList, AddAssetSheet
  - PortfolioPage → PortfolioSummaryCard, AllocationChart, HoldingsList, AddHoldingSheet
- [x] MarketStore with search, trending, quotes, recommendations
- [x] WatchlistStore with real-time price fetching
- [x] HoldingsStore with portfolio management
- [x] Animated tab transitions in MainLayout

#### Data Quality & Testing

- [x] Comprehensive data consistency tests (`src/tests/data_consistency.test.ts`)
- [x] Database-side anomaly detection (OHLC validity, volatility, flash crashes)
- [x] Optimized seeding (~16 min for 28M records vs ~60+ min before)
- [x] Fast anomaly cleanup script

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

#### Security

- All API endpoints (except `/health` and `/auth/*`) require authentication
- JWT tokens validated via cookie or `Authorization: Bearer` header
- Centralized JWT secret management via `src/config.ts`
- Dev backdoor available in non-production mode

## 📜 Available Commands

### Root Level (from project root)

| Command | Description |
| :--- | :--- |
| `bun run setup` | 🚀 One-command setup wizard |
| `bun run dev` | Start all dev servers |
| `bun run test` | Run all tests |
| `bun run test:consistency` | Run data consistency tests |
| `bun run db:push` | Push schema to database |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run db:seed` | Seed market data |
| `bun run db:audit` | Clean anomalous data |
| `bun run db:repair` | Full repair (~1 hour) |
| `bun run db:repair:vip` | Repair VIP symbols only |
| `bun run db:clean` | Reset database |

### Backend Level (from `apps/backend/`)

| Command | Description |
| :--- | :--- |
| `bun run dev` | Start backend only |
| `bun run seed` | Run seeding scripts |
| `bun run test` | Run all backend tests |
| `bun run repair` | Full data repair |
| `bun run repair:vip` | VIP-only repair |
| `bun run repair:dry` | Dry-run (analyze only) |
| `bun run audit` | Clean anomalies |
| `bun run clean-slate` | Reset market data |

## 🔄 Routine Maintenance Tasks

### Automatic (Built-in Scheduler)

These run automatically when the backend is running:

| Task | Frequency | Description |
| :--- | :--- | :--- |
| Stale Symbol Sync | Every 1 hour | Syncs 15 oldest symbols with Yahoo Finance |

### Manual Commands

Run from project root using `bun run`:

| Command | Frequency | Description |
| :--- | :--- | :--- |
| `db:repair:vip` | **Daily** | Repair VIP symbols (watchlist + holdings) |
| `test:consistency` | **Weekly** | Validate database integrity |
| `db:audit` | **Monthly** | Detect and remove anomalies |
| `db:repair` | As needed | Full repair for all ~11K symbols |

### Database Health Checks

```bash
# Quick health check (no changes)
bun run test:consistency

# Expected healthy output:
# ✅ DATABASE IS CLEAN - No critical anomalies detected!
```

### Recovery Procedures

If you see many anomalies or gaps:

```bash
# 1. First, clean anomalies only
bun run db:audit

# 2. Then, repair VIP symbols
bun run db:repair:vip

# 3. Validate
bun run test:consistency
```

## Next Steps

- [ ] Implement holdings price refresh endpoint
- [ ] Add financial statements (earnings, income, balance sheet)
- [ ] Implement push notifications for price alerts
- [ ] Add offline support with SQLite caching
- [ ] Performance optimization (virtualized lists)

## Notes

- `bun` command was not available in Windows shell, so structure was created manually to be run in WSL/Docker.
- **Critical**: User must run `bun install` in the root directory (via WSL) to bootstrap the project.
- **Tools**: Use `wsl bash -lc "..."` to run commands if simple `wsl` fails to find PATH.
- **Swipe Conflict**: Tab swipe disabled to allow horizontal scroll in trending/watchlist components.
