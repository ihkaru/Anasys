#!/bin/bash

# ==============================================================================
# ANASYS - MODERN DEV SERVER MANAGEMENT
# Rust + Docker + Bun
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Paths
FRONTEND_PID="logs/frontend.pid"
FRONTEND_LOG="logs/frontend.log"

# Ensure logs dir exists
mkdir -p logs

# Colors for output
# ... (lines 11-27)
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
# DEV OPERATIONS
# ==============================================================================

start_dev() {
    print_header "🚀 STARTING ANASYS DEV STACK"
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi

    # 1. Start Infrastructure + Services (Docker)
    print_info "Starting Docker services..."
    docker compose -f docker-compose.dev.yml up -d --remove-orphans
    
    # 2. Start Frontend (Hot Reload on Host)
    if [ -f "$FRONTEND_PID" ] && kill -0 $(cat "$FRONTEND_PID") 2>/dev/null; then
        print_info "Frontend is already running."
    else
        print_info "Starting Frontend (HMR active)..."
        # Using nohup to keep it running in background
        nohup bun run --filter @apps/frontend dev > "$FRONTEND_LOG" 2>&1 &
        echo $! > "$FRONTEND_PID"
        sleep 2 # Wait for Vite to initialize
    fi

    # Load .env for display
    if [ -f .env ]; then 
        set -a
        source .env
        set +a
    fi
    
    print_success "Full Stack is UP!"
    echo -e "  ${GREEN}●${NC} Performance Engine (Rust) : Docker Internal"
    echo -e "  ${GREEN}●${NC} API Gateway (Bun)        : http://localhost:${ANASYS_BACKEND_PORT:-28081}"
    echo -e "  ${GREEN}●${NC} Frontend (Vite/Vue)      : ${YELLOW}http://localhost:5173${NC}"
    echo -e "  ${GREEN}●${NC} PostgreSQL (Relational)  : localhost:${ANASYS_POSTGRES_PORT:-25432}"
    echo -e "  ${GREEN}●${NC} QuestDB (Time-series)    : http://localhost:${ANASYS_QUESTDB_PORT:-29010}"
    echo -e "  ${GREEN}●${NC} Redis (Broadcaster)      : localhost:${ANASYS_REDIS_PORT:-26380}"
    echo ""
    print_info "Use './dev.sh logs' to follow all logs"
    print_info "Use './dev.sh stop' to shut down everything"
}

stop_dev() {
    print_header "🛑 STOPPING DEV STACK"
    
    # Stop Docker
    docker compose -f docker-compose.dev.yml down
    
    # Stop Frontend
    if [ -f "$FRONTEND_PID" ]; then
        PID=$(cat "$FRONTEND_PID")
        if kill -0 $PID 2>/dev/null; then
            print_info "Stopping Frontend (PID: $PID)..."
            kill $PID
        fi
        rm "$FRONTEND_PID"
    fi
    
    print_success "Stack stopped."
}

run_monitor() {
    local DURATION=${1:-30}
    if [ ! -f "./monitor_docker.sh" ]; then
        print_error "monitor_docker.sh not found in project root."
        exit 1
    fi
    ./monitor_docker.sh "$DURATION" dev
}

show_logs() {
    print_header "📜 FOLLOWING LOGS (Docker + Frontend)"
    print_info "Press Ctrl+C to stop following"
    
    # Follow Docker logs and Frontend logs simultaneously
    # We use trap to handle Ctrl+C cleanly
    trap 'kill %1; exit' SIGINT
    
    tail -f "$FRONTEND_LOG" &
    docker compose -f docker-compose.dev.yml logs -f engine api
}

show_status() {
    print_header "📊 SYSTEM STATUS"
    docker compose -f docker-compose.dev.yml ps
    if [ -f "$FRONTEND_PID" ] && kill -0 $(cat "$FRONTEND_PID") 2>/dev/null; then
        echo -e "Frontend: ${GREEN}Running${NC} (PID: $(cat "$FRONTEND_PID"))"
    else
        echo -e "Frontend: ${RED}Stopped${NC}"
    fi
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
        echo ""
        print_header "🔍 POST-RESTART STABILITY CHECK"
        print_info "Waiting 25s for containers to stabilize before monitoring..."
        sleep 25
        run_monitor 60
        if [ $? -ne 0 ]; then
            print_error "Stack is UNSTABLE after restart. Check logs with: ./dev.sh logs"
            exit 1
        fi
        ;;
    monitor)
        DURATION=${2:-30}
        run_monitor "$DURATION"
        ;;
    *)
        echo "Usage: ./dev.sh {start|stop|restart|logs|status|monitor [seconds]}"
        echo ""
        echo "  start           Start the full dev stack"
        echo "  stop            Stop all services"
        echo "  restart         Restart + auto stability check"
        echo "  logs            Follow engine & api logs"
        echo "  status          Quick container status"
        echo "  monitor [N]     Run stability monitor for N seconds (default: 30)"
        exit 1
        ;;
esac
