# Project Configuration & Docker Dump
Generated on: Sun Apr 26 04:17:07 PM WIB 2026

## Project Structure
```text
.
├── COMPLETED_TASK.md
├── COMPLETION_REPORT.md
├── Cargo.lock
├── Cargo.toml
├── DOCKER_CONFIG.md
├── README.md
├── SERVER_STATUS.md
├── apps
│   ├── api
│   │   ├── Dockerfile.dev
│   │   ├── Dockerfile.prod
│   │   ├── data
│   │   │   ├── raw
│   │   │   └── us
│   │   ├── package.json
│   │   ├── public
│   │   │   └── logos
│   │   ├── scripts
│   │   ├── server.log
│   │   └── src
│   │       ├── config.ts
│   │       ├── db.ts
│   │       ├── index.ts
│   │       ├── middleware
│   │       ├── modules
│   │       ├── scripts
│   │       ├── tests
│   │       └── utils
│   ├── engine
│   │   ├── Cargo.lock
│   │   ├── Cargo.toml
│   │   ├── Dockerfile.dev
│   │   ├── Dockerfile.prod
│   │   └── src
│   │       ├── backfiller
│   │       ├── engine
│   │       └── main.rs
│   └── frontend
│       ├── index.html
│       ├── package.json
│       ├── public
│       │   ├── assets
│       │   └── favicon.svg
│       ├── src
│       │   ├── App.vue
│       │   ├── api
│       │   ├── components
│       │   ├── composables
│       │   ├── layouts
│       │   ├── main.ts
│       │   ├── pages
│       │   ├── router
│       │   ├── services
│       │   ├── stores
│       │   ├── style.css
│       │   ├── utils
│       │   └── vite-env.d.ts
│       ├── tsconfig.json
│       ├── tsconfig.tsbuildinfo
│       └── vite.config.ts
├── artifacts
│   └── implementation_plan.md
├── asset_classification.csv
├── biome.json
├── bun.lock
├── categorize_assets.sh
├── credential_analisis.example.json
├── detect_god_files.sh
├── dev.ps1
├── dev.sh
├── docker-compose.dev.yml
├── docker-compose.yml
├── docs
│   └── adr
│       ├── 0001-initial-realtime-architecture.md
│       ├── 0002-hybrid-high-performance-architecture.md
│       ├── 0003-containerized-workflow.md
│       ├── 0004-pure-bun-ecosystem.md
│       ├── 0005-separation-of-engine-and-api.md
│       ├── 0006-unified-realtime-ingestion.md
│       └── README.md
├── dump_docker_config.sh
├── export
│   └── ohlc_mu_20260131-181152.json
├── gemini.md
├── get-pip.py
├── git_status.txt
├── implementation_plan.md
├── package.json
├── packages
│   ├── analysis
│   │   ├── README.md
│   │   ├── index.ts
│   │   ├── package.json
│   │   ├── src
│   │   │   └── index.ts
│   │   ├── test
│   │   │   └── analysis.test.ts
│   │   └── tsconfig.json
│   ├── db
│   │   ├── drizzle
│   │   │   ├── 0000_tricky_franklin_richards.sql
│   │   │   ├── 0001_low_jigsaw.sql
│   │   │   ├── 0002_cheerful_puck.sql
│   │   │   ├── 0003_blue_black_panther.sql
│   │   │   └── meta
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── src
│   │       └── schema.ts
│   └── shared
│       ├── package.json
│       └── src
│           └── types.ts
├── references
│   ├── action_items.md
│   ├── audit_framework.md
│   ├── audit_report.md
│   └── tradingview_scrapper.md
├── sample.json
├── scratch
│   ├── benchmark_python.py
│   ├── benchmark_rust
│   │   ├── Cargo.lock
│   │   ├── Cargo.toml
│   │   └── src
│   │       └── main.rs
│   └── tv_stress_test
│       ├── Cargo.lock
│       ├── Cargo.toml
│       └── src
│           └── main.rs
├── scripts
│   └── setup.ts
├── show_structure.sh
├── test-api-bypass.ts
├── test-api.ts
├── test-jwt.ts
├── test-service.ts
├── test-sync.ts
├── test.ts
├── test_output.txt
├── tsconfig.json
├── tsconfig.tsbuildinfo
└── ws_test.ts
```

## Table of Contents

- [apps/api/Dockerfile.dev](#file-apps-api-dockerfile-dev)
- [apps/api/Dockerfile.prod](#file-apps-api-dockerfile-prod)
- [apps/api/package.json](#file-apps-api-package-json)
- [apps/engine/Dockerfile.dev](#file-apps-engine-dockerfile-dev)
- [apps/engine/Dockerfile.prod](#file-apps-engine-dockerfile-prod)
- [apps/frontend/package.json](#file-apps-frontend-package-json)
- [biome.json](#file-biome-json)
- [credential_analisis.example.json](#file-credential_analisis-example-json)
- [dev.sh](#file-dev-sh)
- [docker-compose.dev.yml](#file-docker-compose-dev-yml)
- [docker-compose.yml](#file-docker-compose-yml)
- [.dockerignore](#file--dockerignore)
- [.env.example](#file--env-example)
- [package.json](#file-package-json)
- [packages/analysis/package.json](#file-packages-analysis-package-json)
- [packages/db/package.json](#file-packages-db-package-json)
- [packages/shared/package.json](#file-packages-shared-package-json)

---

### File: apps/api/Dockerfile.dev

```dockerfile
FROM oven/bun:1.2-slim

WORKDIR /app

# Copy root package.json and lockfile
COPY package.json bun.lock ./
# Copy workspaces package.json
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/analysis/package.json ./packages/analysis/
COPY packages/shared/package.json ./packages/shared/

# Skip bun install in image since we rely on host bind mount in dev
# RUN bun install

# Copy source
COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/analysis ./packages/analysis
COPY packages/shared ./packages/shared

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["bun", "run", "dev"]

```


---

### File: apps/api/Dockerfile.prod

```dockerfile
# Stage 1: Build
FROM oven/bun:1.2-slim AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/analysis/package.json ./packages/analysis/
COPY packages/shared/package.json ./packages/shared/

RUN bun install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/analysis ./packages/analysis
COPY packages/shared ./packages/shared

# Stage 2: Run
FROM oven/bun:1.2-slim

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/analysis ./packages/analysis
COPY --from=build /app/packages/shared ./packages/shared

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]

```


---

### File: apps/api/package.json

```json
{
	"name": "anasys-api",
	"version": "1.0.0",
	"type": "module",
	"scripts": {
		"dev": "bun run --env-file=../../.env --watch src/index.ts",
		"seed": "bun run src/scripts/seed.ts",
		"test": "bun test --env-file=../../.env",
		"test:consistency": "bun test src/tests/data_consistency.test.ts --timeout 120000",
		"repair": "bun run src/scripts/ultimate_repair.ts",
		"repair:vip": "bun run src/scripts/ultimate_repair.ts --vip-only",
		"repair:dry": "bun run src/scripts/ultimate_repair.ts --dry-run",
		"audit": "bun run src/scripts/audit_global.ts",
		"prune": "bun run src/scripts/prune_stale_data.ts",
		"prune:dry": "bun run src/scripts/prune_stale_data.ts --dry-run",
		"clean-slate": "bun run src/scripts/clean_slate.ts",
		"clean-slate:keep-symbols": "bun run src/scripts/clean_slate.ts --keep-symbols"
	},
	"dependencies": {
		"@elysiajs/cookie": "^0.8.0",
		"@elysiajs/cors": "^1.2.0",
		"@elysiajs/eden": "^1.2.0",
		"@elysiajs/jwt": "^1.2.0",
		"@elysiajs/swagger": "^1.2.1",
		"ccxt": "^4.5.34",
		"csv-parse": "^6.1.0",
		"drizzle-orm": "^0.39.3",
		"elysia": "^1.4.28",
		"google-auth-library": "^9.15.0",
		"ioredis": "^5.10.1",
		"jose": "^6.1.3",
		"postgres": "^3.4.4",
		"yahoo-finance2": "^3.13.0"
	},
	"devDependencies": {
		"@types/bun": "^1.3.6",
		"bun-types": "^1.3.6"
	}
}

```


---

### File: apps/engine/Dockerfile.dev

```dockerfile
# Gunakan official Rust image berbasis Debian Bookworm (glibc 2.36)
# PENTING: Sama dengan runtime image (debian:bookworm-slim) agar tidak ada GLIBC mismatch
FROM rust:1.95

# Install system dependencies untuk build
# libssl-dev: dibutuhkan beberapa crate native
# curl: untuk healthcheck dan debugging
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install cargo-watch untuk hot-reload (dikompilasi sekali, di-cache di layer ini)
RUN cargo install cargo-watch

WORKDIR /app/apps/engine

ENV RUST_LOG=info
ENV REDIS_URL=redis://redis:6379
ENV QUESTDB_URL=http://questdb:9000

CMD ["cargo", "watch", "-x", "run"]

```


---

### File: apps/engine/Dockerfile.prod

```dockerfile
# Stage 1: Plan recipes
# PENTING: Semua stages pakai base image yang SAMA (cargo-chef:latest-rust-1.95)
# agar tidak ada inkonsistensi toolchain yang mengacaukan Docker layer cache
FROM lukemathwalker/cargo-chef:latest-rust-1.95 AS planner
WORKDIR /app
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# Stage 2: Build dependencies (paling sering di-cache)
FROM lukemathwalker/cargo-chef:latest-rust-1.95 AS cacher
WORKDIR /app
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

# Stage 3: Build application
# Menggunakan cargo-chef image yang sama (bukan rust:slim terpisah) untuk konsistensi toolchain
FROM lukemathwalker/cargo-chef:latest-rust-1.95 AS builder
WORKDIR /app
COPY . .
# Copy pre-compiled dependencies dari stage cacher
COPY --from=cacher /app/target target
COPY --from=cacher /usr/local/cargo /usr/local/cargo
RUN cargo build --release

# Stage 4: Runtime — minimal image untuk production
# debian:bookworm-slim = glibc 2.36, konsisten dengan build environment (cargo-chef berbasis bookworm)
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user untuk keamanan
RUN groupadd -g 1000 anasys && useradd -u 1000 -g anasys -s /bin/sh anasys
USER anasys

WORKDIR /app
COPY --from=builder /app/target/release/anasys-engine /app/anasys-engine

# Hanya default yang sane — REDIS_URL adalah runtime config, jangan di-bake ke image
ENV RUST_LOG=info

CMD ["./anasys-engine"]

```


---

### File: apps/frontend/package.json

```json
{
	"name": "@apps/frontend",
	"version": "1.0.0",
	"type": "module",
	"scripts": {
		"dev": "vite --host",
		"build": "vue-tsc && vite build",
		"preview": "vite preview"
	},
	"dependencies": {
		"@capacitor-community/sqlite": "^8.0.0",
		"@capacitor/android": "^6.1.0",
		"@capacitor/core": "^6.1.0",
		"@capacitor/ios": "^6.1.0",
		"@codetrix-studio/capacitor-google-auth": "^3.4.0-rc.4",
		"@vueuse/core": "^14.1.0",
		"axios": "^1.13.2",
		"framework7": "^9.0.3",
		"framework7-vue": "^9.0.3",
		"jeep-sqlite": "^2.8.0",
		"lightweight-charts": "^4.2.1",
		"pinia": "^3.0.1",
		"sql.js": "1.11.0",
		"swiper": "^11.1.4",
		"vue": "^3.4.0",
		"vue3-google-login": "^2.0.34"
	},
	"devDependencies": {
		"@vitejs/plugin-vue": "^5.0.0",
		"@types/node": "^20.11.0",
		"typescript": "^5.0.0",
		"vite": "^5.0.0",
		"vue-tsc": "^2.0.0",
		"@capacitor/cli": "^6.1.0"
	}
}

```


---

### File: biome.json

```json
{
	"$schema": "https://biomejs.dev/schemas/2.3.12/schema.json",
	"overrides": [
		{
			"includes": ["**/*.vue"],

			"linter": {
				"rules": {
					"correctness": {
						"noUnusedVariables": "off",
						"noUnusedImports": "off"
					}
				}
			}
		},
		{
			"includes": ["apps/api/src/scripts/**/*.ts", "apps/api/src/tests/**/*.ts", "apps/api/test/**/*.ts"],
			"linter": {
				"rules": {
					"suspicious": {
						"useIterableCallbackReturn": "off",
						"noAssignInExpressions": "off"
					},
					"correctness": {
						"noUnusedVariables": "off",
						"noUnusedFunctionParameters": "off"
					}
				}
			}
		}
	],
	"assist": { "actions": { "source": { "organizeImports": "off" } } },
	"linter": {
		"enabled": true,
		"rules": {
			"recommended": true,
			"style": {
				"noNonNullAssertion": "off"
			},
			"suspicious": {
				"noExplicitAny": "off"
			}
		}
	},
	"formatter": {
		"enabled": true,
		"indentStyle": "tab",
		"lineWidth": 120
	},
	"files": {
		"includes": [
			"**",
			"!**/dist",
			"!**/node_modules",
			"!**/.output",
			"!**/.nuxt",
			"!**/coverage",
			"!**/public",
			"!**/*.d.ts",
			"!**/.agent"
		]
	}
}

```


---

### File: credential_analisis.example.json

```json
{
	"web": {
		"client_id": "YOUR_CLIENT_ID",
		"project_id": "YOUR_PROJECT_ID",
		"auth_uri": "https://accounts.google.com/o/oauth2/auth",
		"token_uri": "https://oauth2.googleapis.com/token",
		"auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
		"client_secret": "YOUR_CLIENT_SECRET",
		"redirect_uris": ["http://localhost:5173", "http://localhost:5173/auth/callback"],
		"javascript_origins": ["http://localhost:5173", "http://localhost:3000"]
	}
}

```


---

### File: dev.sh

```bash
#!/bin/bash

# ==============================================================================
# ANASYS - MODERN DEV SERVER MANAGEMENT
# Rust + Docker + Bun
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }

# ==============================================================================
# DOCKER DEV OPERATIONS
# ==============================================================================

start_dev() {
    print_header "🚀 STARTING ANASYS DEV STACK (DOCKER)"
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi

    # Start Infrastructure + Services
    docker compose -f docker-compose.dev.yml up -d --remove-orphans
    
    # Load .env for display
    if [ -f .env ]; then 
        # Export for bash usage
        set -a
        source .env
        set +a
    fi
    
    print_success "Infrastructure & Services are UP!"
    echo -e "  ${GREEN}●${NC} Performance Engine (Rust) : Docker Internal (Scraping active)"
    echo -e "  ${GREEN}●${NC} API Gateway (Bun)        : http://localhost:${ANASYS_BACKEND_PORT:-28081}"
    echo -e "  ${GREEN}●${NC} PostgreSQL (Relational)  : localhost:${ANASYS_POSTGRES_PORT:-25432}"
    echo -e "  ${GREEN}●${NC} QuestDB (Time-series)    : http://localhost:${ANASYS_QUESTDB_PORT:-29010}"
    echo -e "  ${GREEN}●${NC} Redis (Broadcaster)      : localhost:${ANASYS_REDIS_PORT:-26380}"
    echo ""
    print_info "To start Frontend (Vue/Vite):"
    echo -e "  ${YELLOW}bun run --filter @apps/frontend dev${NC}"
    echo ""
    print_info "Use './dev.sh logs' to follow logs"
    print_info "Use './dev.sh stop' to shut down"
}

stop_dev() {
    print_header "🛑 STOPPING DEV STACK"
    docker compose -f docker-compose.dev.yml down
    print_success "Stack stopped."
}

show_logs() {
    print_header "📜 FOLLOWING LOGS"
    # Follow both engine and api logs
    docker compose -f docker-compose.dev.yml logs -f engine api
}

show_status() {
    print_header "📊 SYSTEM STATUS"
    docker compose -f docker-compose.dev.yml ps
}

# ==============================================================================
# MAIN ROUTING
# ==============================================================================

case "$1" in
    start)
        start_dev
        ;;
    stop)
        stop_dev
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
    restart)
        stop_dev
        start_dev
        ;;
    *)
        echo "Usage: ./dev.sh {start|stop|restart|logs|status}"
        exit 1
        ;;
esac

```


---

### File: docker-compose.dev.yml

```yaml
name: anasys-dev

services:
  # ---------------------------------------------------------------------------
  # Performance Engine (Rust) - High-speed ingestion & scraping
  # ---------------------------------------------------------------------------
  engine:
    build:
      context: .
      dockerfile: apps/engine/Dockerfile.dev
    container_name: anasys-dev-engine
    restart: unless-stopped
    environment:
      - REDIS_URL=redis://redis:6379
      - QUESTDB_URL=http://questdb:9000
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/finance_db
      - ANASYS_SCRAPE_SYMBOLS=${ANASYS_SCRAPE_SYMBOLS:-BINANCE:BTCUSDT,BINANCE:ETHUSDT,FX:EURUSD,COMEX:GC1!}
      - RUST_LOG=info
    volumes:
      - .:/app
      - engine_target:/app/apps/engine/target # Preserve target folder in container
      - cargo_registry:/usr/local/cargo/registry # Cache cargo registry
    depends_on:
      redis:
        condition: service_healthy
      questdb:
        condition: service_healthy
      postgres:
        condition: service_healthy
    networks:
      - anasys-dev-net

  # ---------------------------------------------------------------------------
  # API Gateway (Bun) - Logic, Auth, & Relational Data
  # ---------------------------------------------------------------------------
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile.dev
    container_name: anasys-dev-api
    ports:
      - "${ANASYS_BACKEND_PORT:-28081}:3000" # Mapped to original backend port for compatibility
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/finance_db
      - REDIS_URL=redis://redis:6379
      - QUESTDB_URL=http://questdb:9000
      - JWT_SECRET=${JWT_SECRET:-dev_secret_key_123}
    command: ["bun", "run", "--watch", "src/index.ts"]
    volumes:
      - .:/app
    depends_on:
      postgres:
        condition: service_healthy
      questdb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - anasys-dev-net

  # ---------------------------------------------------------------------------
  # Infrastructure
  # ---------------------------------------------------------------------------
  postgres:
    image: postgres:16-alpine
    container_name: anasys-dev-postgres
    ports:
      - "25432:5432" # Relational Source of Truth
    environment:
      - POSTGRES_USER=${DB_USER:-postgres}
      - POSTGRES_PASSWORD=${DB_PASSWORD:-postgres}
      - POSTGRES_DB=${DB_NAME:-finance_db}
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres} -d ${DB_NAME:-finance_db}"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - anasys-dev-net

  questdb:
    image: questdb/questdb:9.3.5
    container_name: anasys-dev-questdb
    ports:
      - "29010:9000"  # Web Console & REST
      - "29011:9009"  # ILP (Influx Line Protocol)
      - "28813:8812"  # Postgres Wire
    volumes:
      - questdb_dev_data:/root/.questdb
    healthcheck:
      test: ["CMD-SHELL", "curl -fL http://localhost:9000/ || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - anasys-dev-net

  redis:
    image: redis:7.2.7-alpine
    container_name: anasys-dev-redis
    ports:
      - "26380:6379"
    volumes:
      - redis_dev_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - anasys-dev-net

networks:
  anasys-dev-net:
    driver: bridge

volumes:
  postgres_dev_data:
  questdb_dev_data:
  redis_dev_data:
  engine_target:
  cargo_registry:

```


---

### File: docker-compose.yml

```yaml
name: anasys-prod

services:
  # ---------------------------------------------------------------------------
  # Performance Engine (Rust)
  # ---------------------------------------------------------------------------
  engine:
    build:
      context: .
      dockerfile: apps/engine/Dockerfile.prod
    restart: always
    environment:
      - REDIS_URL=redis://redis:6379
      - QUESTDB_URL=http://questdb:9000
      - DATABASE_URL=postgres://${DB_USER:-postgres}:${DB_PASSWORD:-postgres}@postgres:5432/${DB_NAME:-finance_db}
      - ANASYS_SCRAPE_SYMBOLS=${ANASYS_SCRAPE_SYMBOLS:-BINANCE:BTCUSDT,BINANCE:ETHUSDT,FX:EURUSD}
    depends_on:
      redis:
        condition: service_healthy
      questdb:
        condition: service_healthy
      postgres:
        condition: service_healthy
    networks:
      - anasys-net

  # ---------------------------------------------------------------------------
  # API Gateway (Bun)
  # ---------------------------------------------------------------------------
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile.prod
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://${DB_USER:-postgres}:${DB_PASSWORD:-postgres}@postgres:5432/${DB_NAME:-finance_db}
      - REDIS_URL=redis://redis:6379
      - QUESTDB_URL=http://questdb:9000
      - JWT_SECRET=${JWT_SECRET} # Required in prod
    depends_on:
      postgres:
        condition: service_healthy
      questdb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - anasys-net

  # ---------------------------------------------------------------------------
  # Infrastructure
  # ---------------------------------------------------------------------------
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
      POSTGRES_DB: ${DB_NAME:-finance_db}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - anasys-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres} -d ${DB_NAME:-finance_db}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s

  questdb:
    image: questdb/questdb:9.3.5
    restart: always
    environment:
      - QDB_CAIRO_COMMIT_LAG=5000
      - QDB_CAIRO_MAX_UNCOMMITTED_ROWS=10000
    volumes:
      - questdb_data:/root/.questdb
    networks:
      - anasys-net
    healthcheck:
      test: ["CMD-SHELL", "curl -fL http://localhost:9000/ || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s

  redis:
    image: redis:7.2.7-alpine
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - anasys-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s

networks:
  anasys-net:
    driver: bridge

volumes:
  postgres_data:
  questdb_data:
  redis_data:

```


---

### File: .dockerignore

```text
# Build artifacts
**/target/
**/node_modules/
**/dist/
**/build/

# IDE and environment
.env
.venv/
.idea/
.vscode/
*.log
.DS_Store

# Git
.git/
.gitignore

# Scratch files
scratch/
temp/

# Secrets and Credentials
credential_analisis.json
*.json.secret
*.key
*.pem

# Root testing and junk scripts
test*.ts
test_output.txt
get-pip.py
sample.json
export/

```


---

### File: .env.example

```text
GS_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
# Database Credentials (Production)
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=finance_db

# Connection URLs
# Database URLs
# For host access (scripts, local dev):
# DATABASE_URL=postgres://postgres:postgres@127.0.0.1:25432/finance_db
# For Docker internal access (used inside containers):
# DATABASE_URL=postgres://postgres:postgres@postgres:5432/finance_db
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:25432/finance_db
REDIS_URL=redis://127.0.0.1:26380
QUESTDB_URL=http://127.0.0.1:29010

# Engine Configuration
ANASYS_SCRAPE_SYMBOLS=BINANCE:BTCUSDT,BINANCE:ETHUSDT,FX:EURUSD,NASDAQ:AAPL,NASDAQ:TSLA
JWT_SECRET=your_jwt_secret_key
LOG_LEVEL=INFO
LOG_MODULES=*

```


---

### File: package.json

```json
{
	"name": "finance-app-monorepo",
	"version": "0.0.1",
	"type": "module",
	"workspaces": [
		"apps/*",
		"packages/*"
	],
	"scripts": {
		"setup": "bun run scripts/setup.ts",
		"dev": "bun --filter '*' dev",
		"dev:infra": "./dev.sh restart",
		"restart": "fuser -k 3000/tcp 5173/tcp || true && echo 'Stopped.' && sleep 1 && bun run dev",
		"build": "bun --filter '*' build",
		"test": "bun --filter anasys-api test",
		"test:consistency": "bun --filter anasys-api run test:consistency",
		"lint": "biome check .",
		"lint:fix": "biome check --write .",
		"db:push": "bun --filter @packages/db push",
		"db:studio": "bun --filter @packages/db studio",
		"db:seed": "bun --filter anasys-api seed",
		"db:audit": "bun --filter anasys-api audit",
		"db:repair": "bun --filter anasys-api repair",
		"db:repair:vip": "bun --filter anasys-api repair:vip",
		"db:clean": "bun --filter anasys-api clean-slate",
		"db:prune": "bun --filter anasys-api prune",
		"db:prune:dry": "bun --filter anasys-api prune:dry",
		"clean": "rm -rf node_modules apps/*/node_modules packages/*/node_modules dist apps/*/dist packages/*/dist",
		"prepare": "husky"
	},
	"devDependencies": {
		"@biomejs/biome": "2.3.12",
		"bun-types": "^1.3.6",
		"husky": "^9.1.7",
		"lint-staged": "^16.4.0",
		"typescript": "^5.9.3"
	},
	"dependencies": {
		"@elysiajs/jwt": "^1.4.2",
		"axios": "^1.15.2",
		"elysia": "^1.4.28"
	}
}

```


---

### File: packages/analysis/package.json

```json
{
	"name": "@packages/analysis",
	"module": "index.ts",
	"type": "module",
	"private": true,
	"devDependencies": {
		"@types/bun": "^1.1.14"
	},
	"peerDependencies": {
		"typescript": "^5"
	},
	"dependencies": {
		"@ixjb94/indicators": "^1.2.4",
		"danfojs-node": "^1.2.0"
	}
}

```


---

### File: packages/db/package.json

```json
{
	"name": "@packages/db",
	"version": "1.0.0",
	"type": "module",
	"scripts": {
		"generate": "drizzle-kit generate",
		"push": "drizzle-kit push",
		"seed": "bun run seeds/main.ts",
		"studio": "drizzle-kit studio"
	},
	"dependencies": {
		"drizzle-orm": "^0.39.3",
		"postgres": "^3.4.4"
	},
	"devDependencies": {
		"drizzle-kit": "^0.30.4",
		"drizzle-seed": "^0.3.0",
		"@types/node": "^20.0.0"
	}
}

```


---

### File: packages/shared/package.json

```json
{
  "name": "@packages/shared",
  "version": "1.0.0",
  "type": "module",
  "main": "src/types.ts",
  "devDependencies": {
    "typescript": "^5.0.0",
    "bun-types": "^1.3.0"
  }
}

```

