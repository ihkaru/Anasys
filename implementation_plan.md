# Implementation Plan - High Performance Finance App

## Project Context
A high-performance financial analysis application focused on OHLCV data.
- **Platform**: Mobile (Android via Capacitor), Web.
- **Stack**: Bun, ElysiaJS, Drizzle ORM, PostgreSQL, Vue 3, Framework7, Pinia.
- **Key Features**: Google Login, Strategy Analysis, Asset Holding Input, Backtest Visualization (Time Series Chart), Multi-asset Swiping.
- **Data**: `yahoo-finance2`, `ccxt`, `danfo.js` for analysis.
- **Performance**: Strict type safety, Biome linting, Monorepo structure.

## Structure
Monorepo using Bun Workspaces.
```text
/
├── apps/
│   ├── backend/ (ElysiaJS)
│   └── frontend/ (Vue 3 + Framework7)
├── packages/
│   ├── db/ (Drizzle Schema & Config)
│   ├── analysis/ (Shared core logic for indicators/backtest)
│   └── shared/ (Shared types/DTOs)
├── .docker/
├── docker-compose.yml
└── package.json (Bun Workspaces)
```

## Phase 1: Environment & Foundation
- [x] **Step 1.1**: Initialize Monorepo with Bun.
- [x] **Step 1.2**: Setup `docker-compose.yml` for PostgreSQL (and optionally Redis if needed later).
- [x] **Step 1.3**: Configure `packages/db` with Drizzle ORM, Drizzle Kit, and `drizzle-seed`.
- [x] **Step 1.4**: Setup **Biome** for linting/formatting across the monorepo.
- [x] **Step 1.5**: Create `packages/shared` for initializing Eden Treaty (Elysia's type sharing).

## Phase 2: Backend Core (ElysiaJS)
- [x] **Step 2.1**: Initialize Elysia app in `apps/backend`.
- [x] **Step 2.2**: Implement Auth Module (Google OAuth verify).
- [x] **Step 2.3**: Implement Market Data Module (Service wrapper for `yahoo-finance2` and `ccxt`).
- [ ] **Step 2.4**: Create cron/scheduler logic for fetching 1-hour timeframe data.
- [x] **Step 2.5**: Expose API routes with strict validation (TypeBox/Elysia models).

## Phase 3: Packages & Logic
- [x] **Step 3.1**: Implement `packages/analysis`.
    - Install `danfo.js` and `@ixjb94/indicators`.
    - Create clean functions: `calculateStrategy(oledData, strategyType) -> Signals`.
- [x] **Step 3.2**: Connect Backend to Analysis package.

## Phase 4: Frontend (Vue 3 + F7)
- [ ] **Step 4.1**: Initialize Framework7 Vue 3 app in `apps/frontend`.
- [ ] **Step 4.2**: Configure Capacitor (Already done).
- [x] **Step 4.3**: Implement Auth Store (Pinia) & Login Page.
- [x] **Step 4.4**: Create "Strategy Selection" Page.
- [x] **Step 4.5**: Create "Input Holding" Modal/Page (Implemented using VueUse localStorage).
- [x] **Step 4.6**: **Complex Task**: Implement The Chart Component.
    - Integrate `tradingview/lightweight-charts`.
    - Implement Swiper for asset switching (Skipped for now, focused on single chart).
    - Implement Fullscreen toggle.
    - Handle Touch conflicts (Chart vs Swiper) (N/A).

## Phase 5: Integration & Polish
- [x] **Step 5.1**: Connect Frontend to Backend via Elysia Eden Client (Using Axios for flexibility).
- [ ] **Step 5.2**: Test Data Flow (Seed DB -> Fetch -> Analyze -> Visualize).
- [ ] **Step 5.3**: Build for Android (Capacitor sync).
