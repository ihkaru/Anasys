#!/bin/bash

# =============================================================================
# Anasys — Remote Production Check (dari Laptop)
# Mensimulasikan apa yang browser rasakan: apakah Traefik routing berfungsi?
#
# Usage  : ./check-prod-remote.sh
# Prereq : curl, openssl (sudah ada di semua Linux/macOS)
# =============================================================================

# --- Domain production (baca dari .env.example atau hardcode) ---
FRONTEND_URL="https://anasys.dvlpid.my.id"
API_URL="https://anasys-api.dvlpid.my.id"
FRONTEND_HOST="anasys.dvlpid.my.id"
API_HOST="anasys-api.dvlpid.my.id"

# Override dari env jika ada
if [ -f ".env.example" ]; then
    CORS=$(grep "^CORS_ORIGIN=" .env.example | cut -d'=' -f2)
    VITE=$(grep "^VITE_API_URL=" .env.example | cut -d'=' -f2)
    [ -n "$CORS" ] && FRONTEND_URL="$CORS" && FRONTEND_HOST=$(echo "$CORS" | sed 's|https://||')
    [ -n "$VITE" ] && API_URL="$VITE" && API_HOST=$(echo "$VITE" | sed 's|https://||')
fi

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0; FAIL=0; WARN=0

print_header() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
ok()   { echo -e "  ${GREEN}✔  $1${NC}"; ((PASS++)); }
fail() { echo -e "  ${RED}✗  $1${NC}"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠  $1${NC}"; ((WARN++)); }
info() { echo -e "  ${BLUE}ℹ  $1${NC}"; }

echo -e "${CYAN}${BOLD}=============================================${NC}"
echo -e "${CYAN}${BOLD}  Anasys Remote Production Check           ${NC}"
echo -e "${CYAN}${BOLD}  (jalankan dari laptop — no SSH needed)   ${NC}"
echo -e "${CYAN}${BOLD}=============================================${NC}"
info "Frontend : $FRONTEND_URL"
info "API      : $API_URL"
echo ""

# =============================================================================
# 1. TLS Certificate
# =============================================================================
print_header "1. TLS Certificate"

check_tls() {
    local HOST=$1
    local LABEL=$2
    local EXPIRY
    EXPIRY=$(echo | openssl s_client -servername "$HOST" -connect "${HOST}:443" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d'=' -f2)

    if [ -z "$EXPIRY" ]; then
        fail "$LABEL: Tidak bisa connect ke port 443 — domain unreachable atau TLS error!"
        return
    fi

    EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null)
    NOW_EPOCH=$(date +%s)
    DAYS=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

    if [ "$DAYS" -gt 14 ]; then
        ok "$LABEL: Valid — $DAYS hari lagi (expires: $EXPIRY)"
    elif [ "$DAYS" -gt 0 ]; then
        warn "$LABEL: Expires dalam $DAYS hari! Traefik Let's Encrypt perlu renewal"
    else
        fail "$LABEL: EXPIRED! Browser akan block semua request"
    fi
}

check_tls "$FRONTEND_HOST" "Frontend TLS"
check_tls "$API_HOST" "API TLS"

# =============================================================================
# 2. Frontend Reachability (Traefik → Nginx → index.html)
# =============================================================================
print_header "2. Frontend Reachability"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${FRONTEND_URL}/" 2>/dev/null)
LATENCY=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "${FRONTEND_URL}/" 2>/dev/null)

case "$HTTP_CODE" in
    200)
        ok "GET ${FRONTEND_URL}/ → ${HTTP_CODE} OK (${LATENCY}s)"
        ;;
    301|302)
        LOCATION=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 10 "${FRONTEND_URL}/")
        ok "GET ${FRONTEND_URL}/ → ${HTTP_CODE} redirect ke $LOCATION (normal)"
        ;;
    000)
        fail "GET ${FRONTEND_URL}/ → CONNECTION TIMEOUT — Traefik tidak meneruskan ke frontend!"
        info "Kemungkinan: container frontend down, atau Coolify belum route domain ini"
        ;;
    502)
        fail "GET ${FRONTEND_URL}/ → 502 Bad Gateway — Traefik reach server tapi container crash!"
        ;;
    503)
        fail "GET ${FRONTEND_URL}/ → 503 Service Unavailable — container unhealthy/starting"
        ;;
    *)
        warn "GET ${FRONTEND_URL}/ → Unexpected HTTP $HTTP_CODE"
        ;;
esac

# =============================================================================
# 3. API Reachability (Traefik → API /ping)
# =============================================================================
print_header "3. API Reachability"

API_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/ping" 2>/dev/null)
API_BODY=$(curl -s --max-time 10 "${API_URL}/ping" 2>/dev/null)
API_LATENCY=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "${API_URL}/ping" 2>/dev/null)

case "$API_CODE" in
    200)
        ok "GET ${API_URL}/ping → 200 OK (${API_LATENCY}s) | body: ${API_BODY}"
        ;;
    000)
        fail "GET ${API_URL}/ping → CONNECTION TIMEOUT — API tidak reachable!"
        ;;
    502)
        fail "GET ${API_URL}/ping → 502 Bad Gateway — API container crash atau unhealthy"
        ;;
    503)
        fail "GET ${API_URL}/ping → 503 — API masih starting atau healthcheck fail"
        ;;
    401|403)
        ok "GET ${API_URL}/ping → ${API_CODE} (API hidup, endpoint butuh auth — wajar)"
        ;;
    *)
        warn "GET ${API_URL}/ping → HTTP $API_CODE"
        ;;
esac

# =============================================================================
# 4. Nginx → API Proxy Path (Gap paling sering: frontend OK tapi /api broken)
# =============================================================================
print_header "4. Nginx → API Proxy (via Frontend Domain)"

# Ini test paling penting: apakah Nginx di frontend bisa proxy ke api:3000?
# Jika /api/health return 502 dari domain frontend → Nginx proxy broken
PROXY_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    "${FRONTEND_URL}/api/health" 2>/dev/null)
PING_VIA_FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    "${FRONTEND_URL}/api/ping" 2>/dev/null)

case "$PROXY_CODE" in
    200|401|403|404)
        ok "Nginx→API proxy /api/health → HTTP $PROXY_CODE (proxy aktif)"
        ;;
    502)
        fail "Nginx→API proxy /api/health → 502 — Nginx GAGAL reach api:3000 secara internal!"
        info "Root cause: API container belum ready saat frontend start (depends_on race)"
        info "Fix: docker compose -f docker-compose.yml restart api"
        ;;
    000)
        fail "Nginx→API proxy → CONNECTION TIMEOUT"
        ;;
    *)
        warn "Nginx→API proxy → HTTP $PROXY_CODE"
        ;;
esac

case "$PING_VIA_FRONTEND" in
    200)
        ok "Nginx→API proxy /api/ping → 200 OK (proxy fully functional)"
        ;;
    502)
        fail "Nginx→API proxy /api/ping → 502 — Proxy broken!"
        ;;
    404)
        info "Nginx→API proxy /api/ping → 404 (route tidak ada, tapi proxy aktif)"
        ;;
    *)
        info "Nginx→API proxy /api/ping → HTTP $PING_VIA_FRONTEND"
        ;;
esac

# =============================================================================
# 5. WebSocket Endpoint
# =============================================================================
print_header "5. WebSocket Routing"

WS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    -H "Sec-WebSocket-Version: 13" \
    "${FRONTEND_URL}/ws/" 2>/dev/null)

case "$WS_CODE" in
    101)
        ok "WebSocket /ws/ → 101 Switching Protocols (fully operational)"
        ;;
    400)
        ok "WebSocket /ws/ → 400 (endpoint aktif, butuh auth/token yang valid)"
        ;;
    502)
        fail "WebSocket /ws/ → 502 — Traefik tidak bisa reach WebSocket backend!"
        ;;
    000)
        warn "WebSocket /ws/ → timeout (tidak bisa verify)"
        ;;
    *)
        warn "WebSocket /ws/ → HTTP $WS_CODE"
        ;;
esac

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo -e "${BOLD}=============================================${NC}"
echo -e "  ${GREEN}✔  Pass:${NC} $PASS  ${YELLOW}⚠  Warn:${NC} $WARN  ${RED}✗  Fail:${NC} $FAIL"
echo -e "${BOLD}=============================================${NC}"

if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}🎉 ALL CLEAR — Production routing fully operational.${NC}"
    exit 0
elif [ "$FAIL" -eq 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠  MOSTLY OK — Ada warning, tapi tidak blokir traffic.${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}❌ MASALAH DITEMUKAN — $FAIL issue memblokir production!${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "  1. SSH ke server: ${BLUE}ssh user@server${NC}"
    echo -e "  2. Jalankan    : ${BLUE}./check-prod-docker.sh${NC}"
    echo -e "  3. Quick fix   : ${BLUE}docker compose -f docker-compose.yml restart${NC}"
    exit 1
fi
