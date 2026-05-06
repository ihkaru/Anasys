#!/bin/bash

# =============================================================================
# Anasys Docker Stability Monitor v2.1
# Checks: State, Health (Traefik-sensitive), Restarts (delta), OOM Kill, Logs
# Health rules mirror Traefik: ONLY "healthy" gets traffic. starting/unhealthy = BLOCKED.
# Usage: ./monitor_docker.sh [duration_seconds] [prod|dev]
# =============================================================================

DURATION=${1:-30}
ENV=${2:-dev}

if [ "$ENV" == "prod" ]; then
    COMPOSE_FILE="docker-compose.yml"
else
    COMPOSE_FILE="docker-compose.dev.yml"
fi

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}=============================================${NC}"
echo -e "${BOLD}Anasys Docker Stability Monitor v2.1${NC}"
echo -e "Environment: ${YELLOW}$ENV${NC} | Observing for ${BOLD}${DURATION}s${NC}"
echo -e "${BOLD}Traefik rule: only \"healthy\" receives traffic. starting/unhealthy = BLOCKED.${NC}"
echo -e "${BOLD}=============================================${NC}"

# --- Detect running containers ---
CONTAINERS=$(docker compose -f $COMPOSE_FILE ps -q)

if [ -z "$CONTAINERS" ]; then
    echo -e "${YELLOW}⚠️  No containers running in $COMPOSE_FILE.${NC}"
    echo "Trying the other compose file..."
    if [ "$ENV" == "prod" ]; then
        COMPOSE_FILE="docker-compose.dev.yml"
    else
        COMPOSE_FILE="docker-compose.yml"
    fi
    CONTAINERS=$(docker compose -f $COMPOSE_FILE ps -q)
    if [ -z "$CONTAINERS" ]; then
        echo -e "${RED}❌ No containers found. Please start your environment first.${NC}"
        exit 1
    fi
fi

# --- Snapshot initial restart counts ---
declare -A INITIAL_RESTARTS
declare -A CONTAINER_NAMES
for ID in $CONTAINERS; do
    NAME=$(docker inspect --format='{{.Name}}' $ID | sed 's/\///')
    RESTARTS=$(docker inspect --format='{{.RestartCount}}' $ID)
    INITIAL_RESTARTS[$ID]=$RESTARTS
    CONTAINER_NAMES[$ID]=$NAME
done

# =============================================================================
# LIVE MONITOR LOOP
# =============================================================================
END_TIME=$((SECONDS + DURATION))
while [ $SECONDS -lt $END_TIME ]; do
    clear
    echo -e "${BOLD}=========================================================================${NC}"
    echo -e "${BOLD}📊 Live Health Status | Env: $ENV | Time left: $((END_TIME - SECONDS))s${NC}"
    echo -e "${BOLD}=========================================================================${NC}"
    printf "${BOLD}%-28s %-12s %-14s %-10s %-8s${NC}\n" "CONTAINER" "STATE" "HEALTH" "RESTARTS" "OOM"
    echo "-------------------------------------------------------------------------"

    for ID in $CONTAINERS; do
        NAME=${CONTAINER_NAMES[$ID]}
        STATE=$(docker inspect --format='{{.State.Status}}' $ID)
        HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}NO_CHECK{{end}}' $ID)
        RESTARTS=$(docker inspect --format='{{.RestartCount}}' $ID)
        OOM=$(docker inspect --format='{{.State.OOMKilled}}' $ID)

        # Colorize STATE
        if [ "$STATE" == "running" ]; then
            STATE_STR="${GREEN}$STATE${NC}"
        else
            STATE_STR="${RED}$STATE${NC}"
        fi

        # Colorize HEALTH — mirror Traefik routing rules exactly
        if [ "$HEALTH" == "healthy" ]; then
            HEALTH_STR="${GREEN}$HEALTH${NC}"
        elif [ "$HEALTH" == "unhealthy" ]; then
            HEALTH_STR="${RED}✗ $HEALTH (BLOCKED)${NC}"
        elif [ "$HEALTH" == "starting" ]; then
            HEALTH_STR="${YELLOW}⏳ $HEALTH (BLOCKED)${NC}"
        elif [ "$HEALTH" == "NO_CHECK" ]; then
            HEALTH_STR="${YELLOW}⚠ NO_CHECK (BLOCKED)${NC}"
        else
            HEALTH_STR="${GRAY}$HEALTH${NC}"
        fi

        # Colorize OOM
        if [ "$OOM" == "true" ]; then
            OOM_STR="${RED}☠ YES${NC}"
        else
            OOM_STR="${GREEN}ok${NC}"
        fi

        # Delta restart warning
        INITIAL=${INITIAL_RESTARTS[$ID]}
        DELTA=$((RESTARTS - INITIAL))
        if [ $DELTA -gt 0 ]; then
            RESTARTS_STR="${RED}$RESTARTS (+$DELTA)${NC}"
        else
            RESTARTS_STR="${GREEN}$RESTARTS${NC}"
        fi

        printf "%-28s %-24b %-26b %-22b %-20b\n" \
            "$NAME" "$STATE_STR" "$HEALTH_STR" "$RESTARTS_STR" "$OOM_STR"
    done

    sleep 2
done

# =============================================================================
# FINAL REPORT
# =============================================================================
echo ""
echo -e "${BOLD}=========================================================================${NC}"
echo -e "${BOLD}📋 Final Stability Report${NC}"
echo -e "${BOLD}=========================================================================${NC}"

STABLE=true
WARNINGS=()

for ID in $CONTAINERS; do
    NAME=${CONTAINER_NAMES[$ID]}
    FINAL_RESTARTS=$(docker inspect --format='{{.RestartCount}}' $ID)
    HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}NO_CHECK{{end}}' $ID)
    OOM=$(docker inspect --format='{{.State.OOMKilled}}' $ID)
    DELTA=$((FINAL_RESTARTS - INITIAL_RESTARTS[$ID]))

    echo -e "\n${BOLD}[$NAME]${NC}"

    # Restart check
    if [ $DELTA -gt 0 ]; then
        echo -e "  ${RED}❌ Crash Loop: restarted $DELTA time(s) during observation.${NC}"
        STABLE=false
    else
        echo -e "  ${GREEN}✔  Restarts: 0 (stable)${NC}"
    fi

    # OOM check
    if [ "$OOM" == "true" ]; then
        echo -e "  ${RED}☠  OOM Kill: Container was killed by Linux due to excessive RAM usage!${NC}"
        STABLE=false
    else
        echo -e "  ${GREEN}✔  OOM Kill: None${NC}"
    fi

    # Health check — mirror Traefik: ONLY "healthy" gets traffic
    if [ "$HEALTH" == "healthy" ]; then
        echo -e "  ${GREEN}✔  Health: healthy — Traefik is routing traffic here.${NC}"
    elif [ "$HEALTH" == "unhealthy" ]; then
        echo -e "  ${RED}❌ Health: unhealthy — Traefik is BLOCKING this container!${NC}"
        STABLE=false
    elif [ "$HEALTH" == "starting" ]; then
        echo -e "  ${YELLOW}⏳ Health: starting — Traefik is BLOCKING until healthy. Waiting for first probe to pass.${NC}"
        WARNINGS+=("$NAME is still in start_period — Traefik not routing yet.")
        STABLE=false
    elif [ "$HEALTH" == "NO_CHECK" ]; then
        echo -e "  ${YELLOW}⚠  Health: No healthcheck defined — Traefik routes blindly (no readiness gate).${NC}"
        WARNINGS+=("$NAME has no healthcheck — Traefik cannot validate readiness.")
    fi

    # Silent error scan from logs (last 30 lines)
    # Keywords: real errors + Rust panics ("stack backtrace") + connection failures
    # Exclusions (known transient/false positives):
    #   - "oneDNN" / "round-off errors": TensorFlow INFO log, not an actual error
    #   - "429" / "too many requests": Transient provider rate-limit, engine auto-reconnects
    #   - "name resolution": Transient DNS failure during Docker network initialization
    MATCHED_ERRORS=$(docker logs --tail 30 $ID 2>&1 \
        | grep -i "error\|panic\|connection refused\|fatal\|stack backtrace" \
        | grep -vi "onednn\|round-off errors\|429\|too many requests\|name resolution\|symbol_error\|series_error\|unsupported resolution\|failed to fetch tasks")
    ERROR_COUNT=$(echo "$MATCHED_ERRORS" | grep -c .)
    if [ $ERROR_COUNT -gt 0 ]; then
        echo -e "  ${RED}⚠  Silent Errors: Found $ERROR_COUNT error-level lines in recent logs!${NC}"
        echo -e "     Run: ${GRAY}docker logs --tail 50 $NAME | grep -i 'error\|fatal'${NC}"
        WARNINGS+=("$NAME has $ERROR_COUNT error lines in logs.")
    else
        echo -e "  ${GREEN}✔  Log Scan: No critical errors detected in last 30 lines.${NC}"
    fi
done

# Summary
echo ""
echo -e "${BOLD}=========================================================================${NC}"
echo -e "${BOLD}=========================================================================${NC}"
if [ "$STABLE" = true ] && [ ${#WARNINGS[@]} -eq 0 ]; then
    echo -e "${GREEN}${BOLD}🎉 RESULT: 100% STABLE. All containers healthy. Traefik is routing normally.${NC}"
    exit 0
elif [ "$STABLE" = true ] && [ ${#WARNINGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠  RESULT: MOSTLY STABLE — minor warnings (no traffic impact):${NC}"
    for W in "${WARNINGS[@]}"; do
        echo -e "  ${YELLOW}→ $W${NC}"
    done
    exit 0
else
    echo -e "${RED}${BOLD}❌ RESULT: UNSTABLE — Traefik is currently blocking one or more containers:${NC}"
    for W in "${WARNINGS[@]}"; do
        echo -e "  ${RED}→ $W${NC}"
    done
    echo -e "${YELLOW}  Tip: If status is 'starting', wait for start_period to expire then re-run monitor.${NC}"
    echo -e "${YELLOW}  Tip: If status is 'unhealthy', run: docker logs <container> | tail -20${NC}"
    exit 1
fi
echo -e "${BOLD}=========================================================================${NC}"
