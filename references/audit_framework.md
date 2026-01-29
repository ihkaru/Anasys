# Anasys Code Audit Framework

This framework defines the "Rubric" for auditing the Anasys codebase, based on **Antigravity Awesome Skills**.

## 1. Foundation & Configuration (Skill: `bun-development`, `typescript-expert`)

| Check | Criteria | Reference |
|-------|----------|-----------|
| **Runtime Config** | `bun.lockb` exists and is committed. No `package-lock.json` or `yarn.lock`. | `bun-development` |
| **Scripts** | Scripts use `bun run` or `bunx` instead of `npm`/`node`. | `bun-development` |
| **Monorepo** | `workspaces` configured in root `package.json`. | bun workspaces |
| **TSConfig** | `moduleResolution: bundler`, `noEmit: true`, `types: ["bun-types"]`. | `bun-development` |
| **Env Vars** | `.env` loading relies on native `Bun.env` where possible or standard process.env compatibility. | `bun-development` |

## 2. Backend Architecture (Skill: `api-patterns`, `api-security`)

| Check | Criteria | Reference |
|-------|----------|-----------|
| **Framework** | Usage of ElysiaJS patterns (controllers, services, guards). | Elysia Docs |
| **Authentication** | Global Auth Guard implementation. No unprotected sensitive routes. | `api-security` |
| **Config** | Centralized `src/config.ts` for secrets/constants. No hardcoded secrets. | `api-security` |
| **Validation** | Schema validation for all inputs (headers, body, query). | `api-patterns` |
| **Error Handling** | Global error handler for standardized JSON responses. | `api-patterns` |
| **Logging** | Structured logging (ID, Level, Module) for observability. | `api-patterns` |

## 3. Database & Data Integrity (Skill: `postgres-best-practices`)

| Check | Criteria | Reference |
|-------|----------|-----------|
| **Schema** | Use of appropriate types (TimescaleDB hypertables for time-series). | TimescaleDB |
| **Indexes** | Indexing on frequently queried columns (`symbol_id`, `timestamp`). | `postgres-best-practices` |
| **N+1 Queries** | Use of `JOIN` or `with` in Drizzle instead of loops. | `postgres-best-practices` |
| **Seeding** | Batch insert strategies (chunks > 1000 rows) for performance. | `postgres-best-practices` |
| **Integrity** | Foreign keys enforced where appropriate (except specific hypertable limits). | `postgres-best-practices` |

## 4. Frontend Architecture (Skill: `vueuse-functions`)

| Check | Criteria | Reference |
|-------|----------|-----------|
| **Composables** | Use `VueUse` standard functions instead of custom implementations. | `vueuse-functions` |
| **Reactive State** | Proper use of `ref`, `computed`, `watch`. | Vue 3 Best Practices |
| **Performance** | Use `useAsyncState` / `useFetch` for data loading states. | `vueuse-functions` |
| **Browser API** | Use `useLocalStorage`, `useTitle`, `useDark` etc. wrappers. | `vueuse-functions` |
| **Components** | Atomic design, separation of concerns (Container vs Presentational). | React/Vue Patterns |

## 5. Security & Safety (Skill: `security-audit`)

| Check | Criteria | Reference |
|-------|----------|-----------|
| **Secrets** | `JWT_SECRET` validation on startup. | `api-security` |
| **Headers** | Security headers (CORS, Helmet-equivalent) configured. | `api-security` |
| **Sanitization** | Input sanitization (XSS prevention via framework). | `api-security` |
