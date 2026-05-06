#!/bin/bash

# =============================================================================
# Anasys — Docker Production Check (dari Production Server via SSH)
# Cek internal Docker state: health, network, labels, logs
#
# Usage  : ./check-prod-docker.sh
# Prereq : Docker + docker compose tersedia di server
# Run    : SSH ke production server → jalankan script ini
# =============================================================================

COMPOSE_FILE="docker-compose.yml"
PROJECT_NAME="anasys-prod"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0; FAIL=0; WARN=0

print_header() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
ok()   { echo -e "  ${GREEN}✔  $1${NC}"; ((PASS++)); }
fail() { echo -e "  ${RED}✗  $1${NC}"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠  $1${NC}"; ((WARN++)); }
info() { echo -e "  ${BLUE}ℹ  $1${NC}"; }

echo -e "${CYAN}${BOLD}=============================================${NC}"
echo -e "${CYAN}${BOLD}  Anasys Docker Production Check           ${NC}"
echo -e "${CYAN}${BOLD}  (jalankan di server via SSH)             ${NC}"
echo -e "${CYAN}${BOLD}=============================================${NC}"

# Pastikan Docker bisa diakses
if ! docker info &>/dev/null 2>&1; then
    echo -e "${RED}${BOLD}✗ Docker daemon tidak bisa diakses!${NC}"
    echo "  Jalankan script ini di production server, bukan laptop."
    exit 1
fi

# Pastikan compose file ada
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}✗ $COMPOSE_FILE tidak ditemukan.${NC}"
    echo "  Jalankan dari root project: /path/to/Anasys/"
    exit 1
fi

CONTAINERS=$(docker compose -f $COMPOSE_FILE ps -q 2>/dev/null)
if [ -z "$CONTAINERS" ]; then
    echo -e "${RED}${BOLD}✗ Tidak ada container yang running untuk $COMPOSE_FILE!${NC}"
    echo "  Coba: docker compose -f docker-compose.yml up -d"
    exit 1
fi

# Snapshot restart counts awal
declare -A INITIAL_RESTARTS
declare -A CONTAINER_NAMES
for ID in $CONTAINERS; do
    NAME=$(docker inspect --format='{{.Name}}' $ID | sed 's/\///')
    RESTARTS=$(docker inspect --format='{{.RestartCount}}' $ID)
    INITIAL_RESTARTS[$ID]=$RESTARTS
    CONTAINER_NAMES[$ID]=$NAME
done

# =============================================================================
# 1. CONTAINER HEALTH & STATE
# =============================================================================
print_header "1. Container Health (Traefik-Sensitive)"
info "Rule: ONLY 'healthy' → Traefik routing aktif. starting/unhealthy = BLOCKED."
echo ""

printf "${BOLD}  %-35s %-12s %-22s %-10s %-8s${NC}\n" "CONTAINER" "STATE" "HEALTH" "RESTARTS" "OOM"
echo "  ─────────────────────────────────────────────────────────────────────"

for ID in $CONTAINERS; do
    NAME=${CONTAINER_NAMES[$ID]}
    STATE=$(docker inspect --format='{{.State.Status}}' $ID)
    HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}NO_CHECK{{end}}' $ID)
    RESTARTS=$(docker inspect --format='{{.RestartCount}}' $ID)
    OOM=$(docker inspect --format='{{.State.OOMKilled}}' $ID)

    # STATE
    [ "$STATE" == "running" ] && STATE_STR="${GREEN}running${NC}" || STATE_STR="${RED}$STATE${NC}"

    # HEALTH
    case "$HEALTH" in
        healthy)   HEALTH_STR="${GREEN}healthy ✔${NC}"; ((PASS++)) ;;
        unhealthy) HEALTH_STR="${RED}✗ unhealthy (BLOCKED)${NC}"; ((FAIL++)) ;;
        starting)  HEALTH_STR="${YELLOW}⏳ starting (BLOCKED)${NC}"; ((WARN++)) ;;
        NO_CHECK)  HEALTH_STR="${YELLOW}⚠ NO_CHECK${NC}"; ((WARN++)) ;;
        *)         HEALTH_STR="${GRAY}$HEALTH${NC}" ;;
    esac

    # OOM
    [ "$OOM" == "true" ] && OOM_STR="${RED}☠ YES${NC}" || OOM_STR="${GREEN}ok${NC}"

    # Restarts
    DELTA=$((RESTARTS - INITIAL_RESTARTS[$ID]))
    [ $DELTA -gt 0 ] && RESTARTS_STR="${RED}$RESTARTS (+$DELTA)${NC}" || RESTARTS_STR="${GREEN}$RESTARTS${NC}"

    printf "  %-35s %-24b %-34b %-22b %-20b\n" \
        "$NAME" "$STATE_STR" "$HEALTH_STR" "$RESTARTS_STR" "$OOM_STR"
done

# =============================================================================
# 2. COOLIFY LABELS (apakah Traefik akan baca routing ini?)
# =============================================================================
print_header "2. Coolify/Traefik Label Validation"

for ID in $CONTAINERS; do
    NAME=${CONTAINER_NAMES[$ID]}
    MANAGED=$(docker inspect --format='{{index .Config.Labels "coolify.managed"}}' $ID 2>/dev/null)
    PROXY_PORT=$(docker inspect --format='{{index .Config.Labels "coolify.proxy.port"}}' $ID 2>/dev/null)

    if [ "$MANAGED" == "true" ] && [ -n "$PROXY_PORT" ]; then
        ok "$NAME: coolify.managed=true | proxy.port=${PROXY_PORT}"
    elif [ -n "$MANAGED" ]; then
        warn "$NAME: coolify.managed='$MANAGED' tapi proxy.port kosong — Traefik mungkin tidak route"
    else
        info "$NAME: Tidak ada coolify label (infra container, dilewati Traefik — normal)"
    fi
done

# =============================================================================
# 3. INTER-CONTAINER NETWORK
# =============================================================================
print_header "3. Inter-Container Network Connectivity"

NETWORK_NAME="${PROJECT_NAME}_anasys-net"

# Cek network exist dan container terhubung
NETWORK_CONTAINERS=$(docker network inspect "$NETWORK_NAME" \
    --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null)

if [ -n "$NETWORK_CONTAINERS" ]; then
    ok "Network '$NETWORK_NAME' aktif"
    info "Container terhubung: $NETWORK_CONTAINERS"
else
    fail "Network '$NETWORK_NAME' tidak ditemukan atau kosong!"
    info "Coba: docker compose -f docker-compose.yml up -d"
fi

# Cek konektivitas frontend → api (penyebab paling sering 502)
FRONTEND_ID=$(docker compose -f $COMPOSE_FILE ps -q frontend 2>/dev/null)
if [ -n "$FRONTEND_ID" ]; then
    INTERNAL_CHECK=$(docker exec "$FRONTEND_ID" \
        wget --no-verbose --tries=1 --spider --timeout=5 \
        "http://api:3000/ping" 2>&1)
    if echo "$INTERNAL_CHECK" | grep -qE "200 OK|Remote file exists"; then
        ok "Frontend → API internal: REACHABLE (api:3000/ping OK)"
    else
        fail "Frontend → API internal: TIDAK BISA REACH api:3000!"
        info "Ini penyebab 502 saat /api/* diakses dari browser"
        info "Fix: docker compose -f docker-compose.yml restart api frontend"
    fi
else
    warn "Container 'frontend' tidak ditemukan untuk internal network check"
fi

# Cek konektivitas api → postgres
API_ID=$(docker compose -f $COMPOSE_FILE ps -q api 2>/dev/null)
if [ -n "$API_ID" ]; then
    PG_CHECK=$(docker exec "$API_ID" \
        sh -c 'echo > /dev/tcp/postgres/5432' 2>/dev/null && echo "OK" || echo "FAIL")
    if [ "$PG_CHECK" == "OK" ]; then
        ok "API → Postgres internal: REACHABLE (postgres:5432)"
    else
        warn "API → Postgres: tidak bisa verify dengan /dev/tcp (shell mungkin terbatas)"
    fi
fi

# =============================================================================
# 4. LOG SCAN (Silent Errors)
# =============================================================================
print_header "4. Recent Log Scan (last 20 lines per container)"

EXCLUDE_PATTERN="onednn|round-off errors|429|too many requests|name resolution|symbol_error|series_error|unsupported resolution|failed to fetch tasks"
INCLUDE_PATTERN="error|panic|connection refused|fatal|stack backtrace|SIGTERM|OOM"

for ID in $CONTAINERS; do
    NAME=${CONTAINER_NAMES[$ID]}
    MATCHED=$(docker logs --tail 20 $ID 2>&1 \
        | grep -iE "$INCLUDE_PATTERN" \
        | grep -viE "$EXCLUDE_PATTERN")
    COUNT=$(echo "$MATCHED" | grep -c . 2>/dev/null || echo 0)

    if [ "$COUNT" -gt 0 ] && [ -n "$MATCHED" ]; then
        warn "$NAME: $COUNT error-level line(s) dalam 20 log terakhir"
        echo "$MATCHED" | head -5 | while IFS= read -r line; do
            echo -e "    ${GRAY}→ $line${NC}"
        done
    else
        ok "$NAME: Log bersih (tidak ada error kritis)"
    fi
done

# =============================================================================
# 5. HEALTHCHECK LAST FAILURE REASON (debug unhealthy container)
# =============================================================================
print_header "5. Healthcheck Detail (untuk container yang unhealthy)"

for ID in $CONTAINERS; do
    NAME=${CONTAINER_NAMES[$ID]}
    HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}NO_CHECK{{end}}' $ID)

    if [ "$HEALTH" == "unhealthy" ]; then
        LAST_LOG=$(docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' $ID 2>/dev/null | tail -1)
        fail "$NAME UNHEALTHY — last healthcheck output:"
        echo -e "    ${RED}→ $LAST_LOG${NC}"
        info "Manual check: docker exec $NAME <healthcheck-command>"
    fi
done

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo -e "${BOLD}=============================================${NC}"
echo -e "  ${GREEN}✔  Pass:${NC} $PASS  ${YELLOW}⚠  Warn:${NC} $WARN  ${RED}✗  Fail:${NC} $FAIL"
echo -e "${BOLD}=============================================${NC}"

if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}🎉 100% STABLE — Semua container healthy, Traefik routing normal.${NC}"
    exit 0
elif [ "$FAIL" -eq 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠  MOSTLY STABLE — Ada warning, cek detail di atas.${NC}"
    echo -e "${YELLOW}  Tip: Jika status 'starting', tunggu start_period lalu run ulang.${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}❌ UNSTABLE — $FAIL masalah kritis ditemukan!${NC}"
    echo ""
    echo -e "${YELLOW}Quick fixes:${NC}"
    echo -e "  docker compose -f docker-compose.yml restart"
    echo -e "  docker compose -f docker-compose.yml logs --tail=50 frontend api"
    echo -e "  docker compose -f docker-compose.yml down && docker compose -f docker-compose.yml up -d"
    exit 1
fi
