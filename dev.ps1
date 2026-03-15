# ==============================================================================
# DEV SERVER MANAGEMENT SCRIPT (PowerShell)
# Finance App - Analisis
# Companion to dev.sh - handles Docker from Windows, Node from WSL
# ==============================================================================

param(
    [Parameter(Position = 0)]
    [string]$Command = "help"
)

$WSL_PROJECT = "/home/dmin/projects/analisis"
$DOCKER_COMPOSE_DIR = "\\wsl.localhost\Ubuntu\home\dmin\projects\analisis"
$DOCKER_TIMEOUT_MS = 8000  # milliseconds

# Ensure Docker is in PATH (IDE shells often don't inherit full system PATH)
$DockerPaths = @(
    "$env:ProgramFiles\Docker\Docker\resources\bin",
    "$env:LOCALAPPDATA\Docker\wsl"
)
foreach ($dp in $DockerPaths) {
    if ((Test-Path "$dp\docker.exe") -and ($env:PATH -notlike "*$dp*")) {
        $env:PATH = "$dp;$env:PATH"
        break
    }
}

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

function Write-Header($text) {
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "=================================================================" -ForegroundColor Cyan
}

function Write-Ok($text) { Write-Host "[OK] $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "[WARN] $text" -ForegroundColor Yellow }
function Write-Err($text) { Write-Host "[FAIL] $text" -ForegroundColor Red }
function Write-Info($text) { Write-Host "[INFO] $text" -ForegroundColor Blue }

function Invoke-WSL {
    param([string]$Script)
    $output = wsl -d Ubuntu -- bash -c $Script 2>&1
    return $output
}

# Run a Docker command with a timeout. Returns hashtable with ExitCode and Output,
# or $null if timed out. Uses Process.WaitForExit(timeout) instead of Start-Job
# to avoid UNC-path and PowerShell-job compatibility issues.
function Invoke-DockerWithTimeout {
    param(
        [string]$DockerArgs,
        [int]$TimeoutMs = $DOCKER_TIMEOUT_MS
    )
    try {
        $pinfo = New-Object System.Diagnostics.ProcessStartInfo
        $pinfo.FileName = "docker"
        $pinfo.Arguments = $DockerArgs
        $pinfo.RedirectStandardOutput = $true
        $pinfo.RedirectStandardError = $true
        $pinfo.UseShellExecute = $false
        $pinfo.CreateNoWindow = $true

        $p = [System.Diagnostics.Process]::Start($pinfo)
        $stdout = $p.StandardOutput.ReadToEndAsync()
        $stderr = $p.StandardError.ReadToEndAsync()

        $exited = $p.WaitForExit($TimeoutMs)
        if ($exited) {
            [System.Threading.Tasks.Task]::WaitAll(@($stdout, $stderr))
            return @{ ExitCode = $p.ExitCode; Output = $stdout.Result }
        }
        else {
            # Timed out - kill the process
            try { $p.Kill() } catch {}
            return $null
        }
    }
    catch {
        # Docker not installed or not in PATH
        return $null
    }
}

function Test-DockerAvailable {
    $result = Invoke-DockerWithTimeout -DockerArgs "info" -TimeoutMs $DOCKER_TIMEOUT_MS
    if ($null -eq $result) {
        return $false  # timed out or docker not found
    }
    return ($result.ExitCode -eq 0)
}

# ==============================================================================
# START FUNCTIONS
# ==============================================================================

function Start-Postgres {
    Write-Info "Starting PostgreSQL via Docker..."
    $composeFile = "$DOCKER_COMPOSE_DIR\docker-compose.yml"
    $result = Invoke-DockerWithTimeout -DockerArgs "compose -f `"$composeFile`" up -d postgres" -TimeoutMs 30000
    if ($null -eq $result) {
        Write-Warn "Docker timed out - PostgreSQL may already be running or Docker is starting up"
        return $false
    }
    if ($result.ExitCode -eq 0) {
        Write-Ok "PostgreSQL started on port 5432"
        return $true
    }
    else {
        Write-Err "Failed to start PostgreSQL"
        return $false
    }
}

function Start-Backend {
    Write-Info "Starting Backend server..."

    # Kill any existing backend first
    Invoke-WSL 'PIDS=$(lsof -ti:3000 2>/dev/null); if [ -n "$PIDS" ]; then echo "$PIDS" | xargs kill -9 2>/dev/null; fi' | Out-Null

    $bashCmd = @"
export PATH=~/.bun/bin:/usr/local/bin:/usr/bin:/bin:`$PATH
cd $WSL_PROJECT/apps/backend
setsid nohup env NODE_ENV=development ~/.bun/bin/bun run dev > $WSL_PROJECT/apps/backend/server.log 2>&1 &
echo `$! > $WSL_PROJECT/.backend.pid
sleep 2
if kill -0 `$(cat $WSL_PROJECT/.backend.pid) 2>/dev/null; then echo OK; else echo FAIL; fi
"@

    $result = Invoke-WSL $bashCmd
    if ("$result" -match "OK") {
        Write-Ok "Backend started on port 3000"
        return $true
    }
    else {
        Write-Err "Failed to start backend"
        return $false
    }
}

function Start-Frontend {
    Write-Info "Starting Frontend server..."

    # Kill any existing frontend first
    Invoke-WSL 'PIDS=$(lsof -ti:5173 2>/dev/null); if [ -n "$PIDS" ]; then echo "$PIDS" | xargs kill -9 2>/dev/null; fi' | Out-Null

    $bashCmd = @"
export PATH=~/.bun/bin:/usr/local/bin:/usr/bin:/bin:`$PATH
cd $WSL_PROJECT/apps/frontend
setsid nohup ~/.bun/bin/bun run dev -- --host > $WSL_PROJECT/apps/frontend/server.log 2>&1 &
echo `$! > $WSL_PROJECT/.frontend.pid
sleep 2
if kill -0 `$(cat $WSL_PROJECT/.frontend.pid) 2>/dev/null; then echo OK; else echo FAIL; fi
"@

    $result = Invoke-WSL $bashCmd
    if ("$result" -match "OK") {
        Write-Ok "Frontend started on port 5173"
        return $true
    }
    else {
        Write-Err "Failed to start frontend"
        return $false
    }
}

function Start-AllServers {
    Write-Header "STARTING ALL SERVERS"

    # Check Docker (with timeout - won't hang)
    $dockerOk = Test-DockerAvailable
    if ($dockerOk) {
        Start-Postgres
        Start-Sleep -Seconds 2
    }
    else {
        Write-Warn "Docker is not available (timed out). Skipping PostgreSQL."
        Write-Info "Start Docker Desktop and run '.\dev.ps1 start:db' later."
    }

    Start-Backend
    Start-Frontend

    Write-Host ""
    Write-Header "SERVER STATUS"
    if ($dockerOk) {
        Write-Host "  [*] PostgreSQL  : http://localhost:5432" -ForegroundColor Green
    } else {
        Write-Host "  [-] PostgreSQL  : Skipped (Docker unavailable)" -ForegroundColor Yellow
    }
    Write-Host "  [*] Backend     : http://localhost:3000" -ForegroundColor Green
    Write-Host "  [*] Frontend    : http://localhost:5173" -ForegroundColor Green
    Write-Host "  [i] Swagger Docs: http://localhost:3000/swagger" -ForegroundColor Blue
    Write-Host ""
    Write-Info "Use '.\dev.ps1 stop' to stop all servers"
}

# ==============================================================================
# STOP FUNCTIONS
# ==============================================================================

function Stop-Backend {
    Write-Info "Killing backend server (port 3000)..."
    $bashCmd = @"
PIDS=`$(lsof -ti:3000 2>/dev/null)
if [ -n "`$PIDS" ]; then echo "`$PIDS" | xargs kill -9 2>/dev/null; echo "KILLED:`$PIDS"; fi
if [ -f $WSL_PROJECT/.backend.pid ]; then
  PID=`$(cat $WSL_PROJECT/.backend.pid)
  pkill -P `$PID 2>/dev/null
  kill -9 `$PID 2>/dev/null
  rm -f $WSL_PROJECT/.backend.pid
fi
"@

    $result = Invoke-WSL $bashCmd
    if ("$result" -match "KILLED:(.+)") {
        Write-Ok "Backend server killed"
    }
    else {
        Write-Warn "No backend server running on port 3000"
    }
}

function Stop-Frontend {
    Write-Info "Killing frontend server (port 5173)..."
    $bashCmd = @"
PIDS=`$(lsof -ti:5173 2>/dev/null)
if [ -n "`$PIDS" ]; then echo "`$PIDS" | xargs kill -9 2>/dev/null; echo "KILLED:`$PIDS"; fi
if [ -f $WSL_PROJECT/.frontend.pid ]; then
  PID=`$(cat $WSL_PROJECT/.frontend.pid)
  pkill -P `$PID 2>/dev/null
  kill -9 `$PID 2>/dev/null
  rm -f $WSL_PROJECT/.frontend.pid
fi
"@

    $result = Invoke-WSL $bashCmd
    if ("$result" -match "KILLED:(.+)") {
        Write-Ok "Frontend server killed"
    }
    else {
        Write-Warn "No frontend server running on port 5173"
    }
}

function Stop-Postgres {
    Write-Info "Stopping PostgreSQL Docker container..."
    $composeFile = "$DOCKER_COMPOSE_DIR\docker-compose.yml"
    $result = Invoke-DockerWithTimeout -DockerArgs "compose -f `"$composeFile`" stop postgres" -TimeoutMs 15000
    if ($null -eq $result) {
        Write-Warn "Docker timed out - skip PostgreSQL stop"
    }
    elseif ($result.ExitCode -eq 0) {
        Write-Ok "PostgreSQL container stopped"
    }
    else {
        Write-Warn "PostgreSQL container was not running"
    }
}

function Stop-AllServers {
    Write-Header "STOPPING ALL SERVERS"
    Stop-Frontend
    Stop-Backend
    Stop-Postgres
    Write-Host ""
    Write-Ok "All servers stopped!"
}

# ==============================================================================
# STATUS FUNCTION
# ==============================================================================

function Get-DevStatus {
    Write-Header "SERVER STATUS"

    # Check PostgreSQL via Docker (with timeout)
    $composeFile = "$DOCKER_COMPOSE_DIR\docker-compose.yml"
    $result = Invoke-DockerWithTimeout -DockerArgs "compose -f `"$composeFile`" ps postgres" -TimeoutMs $DOCKER_TIMEOUT_MS
    if ($null -eq $result) {
        Write-Host "  [?] PostgreSQL  : Docker unavailable" -ForegroundColor Yellow
    }
    elseif ($result.Output -match "running|Up") {
        Write-Host "  [*] PostgreSQL  : Running (port 5432)" -ForegroundColor Green
    }
    else {
        Write-Host "  [-] PostgreSQL  : Stopped" -ForegroundColor Red
    }

    # Check Backend and Frontend via WSL lsof
    $bashCmd = 'B=$(lsof -ti:3000 2>/dev/null | head -1); F=$(lsof -ti:5173 2>/dev/null | head -1); echo "B=${B:-none} F=${F:-none}"'
    $result = Invoke-WSL $bashCmd

    if ("$result" -match 'B=(\d+)') {
        Write-Host "  [*] Backend     : Running (port 3000)" -ForegroundColor Green
    }
    else {
        Write-Host "  [-] Backend     : Stopped" -ForegroundColor Red
    }

    if ("$result" -match 'F=(\d+)') {
        Write-Host "  [*] Frontend    : Running (port 5173)" -ForegroundColor Green
    }
    else {
        Write-Host "  [-] Frontend    : Stopped" -ForegroundColor Red
    }
    Write-Host ""
}

# ==============================================================================
# HELP
# ==============================================================================

function Show-DevHelp {
    Write-Header "DEV SERVER MANAGEMENT (PowerShell)"
    Write-Host ""
    Write-Host "  Usage: .\dev.ps1 <command>"
    Write-Host ""
    Write-Host "  Commands:"
    Write-Host "    start          Start all servers (postgres, backend, frontend)"
    Write-Host "    stop           Stop all servers"
    Write-Host "    restart        Restart all servers"
    Write-Host "    status         Show server status"
    Write-Host "    logs           Show Docker logs (follow mode)"
    Write-Host ""
    Write-Host "  Individual Start:"
    Write-Host "    start:db       Start PostgreSQL only"
    Write-Host "    start:backend  Start Backend only"
    Write-Host "    start:frontend Start Frontend only"
    Write-Host ""
    Write-Host "  Individual Stop:"
    Write-Host "    stop:db        Stop PostgreSQL only"
    Write-Host "    stop:backend   Stop Backend only"
    Write-Host "    stop:frontend  Stop Frontend only"
    Write-Host ""
    Write-Host "  This script handles Docker from Windows and Node servers from WSL."
    Write-Host "  For interactive WSL use, run ./dev.sh instead."
    Write-Host ""
}

# ==============================================================================
# MAIN
# ==============================================================================

switch ($Command) {
    "start"          { Start-AllServers }
    "stop"           { Stop-AllServers }
    "restart"        { Stop-AllServers; Start-Sleep -Seconds 1; Start-AllServers }
    "status"         { Get-DevStatus }
    "logs"           { $f = "$DOCKER_COMPOSE_DIR\docker-compose.yml"; docker compose -f $f logs -f }
    "start:db"       { if (Test-DockerAvailable) { Start-Postgres } else { Write-Err "Docker unavailable" } }
    "start:backend"  { Start-Backend }
    "start:frontend" { Start-Frontend }
    "stop:db"        { Stop-Postgres }
    "stop:backend"   { Stop-Backend }
    "stop:frontend"  { Stop-Frontend }
    default          { Show-DevHelp }
}
