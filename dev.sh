#!/bin/bash

# ==============================================================================
# DEV SERVER MANAGEMENT SCRIPT
# Finance App - Analisis
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# ==============================================================================
# KILL FUNCTIONS
# ==============================================================================

kill_postgres() {
    print_info "Stopping PostgreSQL Docker container..."
    docker compose down 2>/dev/null
    if [ $? -eq 0 ]; then
        print_success "PostgreSQL container stopped"
    else
        print_warning "PostgreSQL container was not running"
    fi
}

kill_backend() {
    print_info "Killing backend server (port 3000)..."
    # Kill by port
    PIDS=$(lsof -ti:3000 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo "$PIDS" | xargs kill -9 2>/dev/null
        print_success "Backend server killed (PIDs: $PIDS)"
    else
        print_warning "No backend server running on port 3000"
    fi
    
    # Kill the background process started by dev.sh using PID file
    if [ -f "$PROJECT_DIR/.backend.pid" ]; then
        PID=$(cat "$PROJECT_DIR/.backend.pid")
        if [ -n "$PID" ]; then
            # Kill child processes first
            pkill -P $PID 2>/dev/null
            # Kill main process
            kill -9 $PID 2>/dev/null
        fi
        rm -f "$PROJECT_DIR/.backend.pid"
    fi
}

kill_frontend() {
    print_info "Killing frontend server (port 5173)..."
    # Kill by port
    PIDS=$(lsof -ti:5173 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo "$PIDS" | xargs kill -9 2>/dev/null
        print_success "Frontend server killed (PIDs: $PIDS)"
    else
        print_warning "No frontend server running on port 5173"
    fi
    
    # Kill the background process started by dev.sh using PID file
    if [ -f "$PROJECT_DIR/.frontend.pid" ]; then
        PID=$(cat "$PROJECT_DIR/.frontend.pid")
        if [ -n "$PID" ]; then
            # Kill child processes first
            pkill -P $PID 2>/dev/null
            # Kill main process
            kill -9 $PID 2>/dev/null
        fi
        rm -f "$PROJECT_DIR/.frontend.pid"
    fi
}

kill_all() {
    print_header "🔪 KILLING ALL SERVERS"
    kill_frontend
    kill_backend
    kill_postgres
    echo ""
    print_success "All servers stopped!"
}

# ==============================================================================
# START FUNCTIONS
# ==============================================================================

start_postgres() {
    print_info "Starting PostgreSQL via Docker..."
    docker compose up -d postgres
    if [ $? -eq 0 ]; then
        print_success "PostgreSQL started on port 5432"
    else
        print_error "Failed to start PostgreSQL"
        return 1
    fi
}

start_backend() {
    print_info "Starting Backend server..."
    cd "$PROJECT_DIR/apps/backend"
    NODE_ENV=development bun run dev > "$PROJECT_DIR/apps/backend/server.log" 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > "$PROJECT_DIR/.backend.pid"
    cd "$PROJECT_DIR"
    sleep 2
    if kill -0 $BACKEND_PID 2>/dev/null; then
        print_success "Backend started on port 3000 (PID: $BACKEND_PID)"
    else
        print_error "Failed to start backend"
        return 1
    fi
}

start_frontend() {
    print_info "Starting Frontend server..."
    cd "$PROJECT_DIR/apps/frontend"
    bun run dev > "$PROJECT_DIR/apps/frontend/server.log" 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$PROJECT_DIR/.frontend.pid"
    cd "$PROJECT_DIR"
    sleep 2
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        print_success "Frontend started on port 5173 (PID: $FRONTEND_PID)"
    else
        print_error "Failed to start frontend"
        return 1
    fi
}

start_all() {
    print_header "🚀 STARTING ALL SERVERS"
    
    # Check if bun is installed
    if ! command -v bun &> /dev/null; then
        print_error "Bun is not installed. Please install it first."
        exit 1
    fi
    
    # Check if docker is running
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    start_postgres
    sleep 2  # Wait for postgres to be ready
    start_backend
    start_frontend
    
    echo ""
    print_header "📊 SERVER STATUS"
    echo -e "  ${GREEN}●${NC} PostgreSQL  : http://localhost:5432"
    echo -e "  ${GREEN}●${NC} Backend     : http://localhost:3000"
    echo -e "  ${GREEN}●${NC} Frontend    : http://localhost:5173"
    echo -e "  ${BLUE}ℹ${NC} Swagger Docs: http://localhost:3000/swagger"
    echo ""
    print_info "Use './dev.sh stop' to stop all servers"
    print_info "Use './dev.sh logs' to view Docker logs"
}

# ==============================================================================
# STATUS FUNCTION
# ==============================================================================

show_status() {
    print_header "📊 SERVER STATUS"
    
    # Check PostgreSQL
    if docker compose ps postgres 2>/dev/null | grep -q "Up"; then
        echo -e "  ${GREEN}●${NC} PostgreSQL  : Running (port 5432)"
    else
        echo -e "  ${RED}●${NC} PostgreSQL  : Stopped"
    fi
    
    # Check Backend
    if lsof -ti:3000 &>/dev/null; then
        echo -e "  ${GREEN}●${NC} Backend     : Running (port 3000)"
    else
        echo -e "  ${RED}●${NC} Backend     : Stopped"
    fi
    
    # Check Frontend
    if lsof -ti:5173 &>/dev/null; then
        echo -e "  ${GREEN}●${NC} Frontend    : Running (port 5173)"
    else
        echo -e "  ${RED}●${NC} Frontend    : Stopped"
    fi
    echo ""
}

# ==============================================================================
# RESTART FUNCTION
# ==============================================================================

restart_all() {
    print_header "🔄 RESTARTING ALL SERVERS"
    kill_all
    echo ""
    sleep 1
    start_all
}

# ==============================================================================
# LOGS FUNCTION
# ==============================================================================

show_logs() {
    print_header "📜 DOCKER LOGS"
    docker compose logs -f
}

# ==============================================================================
# HELP
# ==============================================================================

show_help() {
    print_header "🛠️  DEV SERVER MANAGEMENT"
    echo ""
    echo "  Usage: ./dev.sh [command]"
    echo ""
    echo "  Commands:"
    echo "    start     Start all servers (postgres, backend, frontend)"
    echo "    stop      Stop all servers"
    echo "    restart   Restart all servers"
    echo "    status    Show server status"
    echo "    logs      Show Docker logs (follow mode)"
    echo ""
    echo "  Individual Commands:"
    echo "    start:db       Start PostgreSQL only"
    echo "    start:backend  Start Backend only"
    echo "    start:frontend Start Frontend only"
    echo "    stop:db        Stop PostgreSQL only"
    echo "    stop:backend   Stop Backend only"
    echo "    stop:frontend  Stop Frontend only"
    echo ""
    echo "  Examples:"
    echo "    ./dev.sh start       # Start everything"
    echo "    ./dev.sh stop        # Stop everything"
    echo "    ./dev.sh restart     # Restart everything"
    echo ""
}

# ==============================================================================
# MAIN
# ==============================================================================

case "$1" in
    start)
        start_all
        ;;
    stop)
        kill_all
        ;;
    restart)
        restart_all
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    start:db)
        start_postgres
        ;;
    start:backend)
        start_backend
        ;;
    start:frontend)
        start_frontend
        ;;
    stop:db)
        kill_postgres
        ;;
    stop:backend)
        kill_backend
        ;;
    stop:frontend)
        kill_frontend
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        show_help
        ;;
esac
