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
