# Audit Action Items

Follow-up tasks based on the Comprehensive Code Audit findings.

## High Priority
- None (Codebase is solid!)

## Medium Priority (Optimization)
- [ ] **Migrate Custom Hooks to VueUse**
  - **Context**: Several components use custom `onMounted`/`onUnmounted` logic for window events.
  - **Action**: Refactor to use `useEventListener`, `useWindowScroll`, etc.
  - **Benefit**: Less code, better memory management (auto-cleanup).

- [ ] **Explicit Hypertable Migration**
  - **Context**: `market_data` table relies on manual setup for TimescaleDB properties.
  - **Action**: Add a Drizzle migration that executes `SELECT create_hypertable('market_data', 'timestamp', if_not_exists => TRUE);`.
  - **Benefit**: Ensures reproducible environments (vital for new developers/CI).

## Low Priority (Observability)
- [ ] **Distributed Tracing IDs**
  - **Context**: Logging is good but lacks a unified Request ID across async boundaries.
  - **Action**: Add `requestId` to `requestLogger` middleware in `apps/backend/src/middleware/security.ts`.
  - **Benefit**: Easier debugging of concurrent requests in production logs.
