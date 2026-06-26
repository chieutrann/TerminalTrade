#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# TradingView-Style Crypto Charting App — Setup & Run Script
# ──────────────────────────────────────────────────────────────
#
# Usage:
#   ./setup.sh            # full setup + run both services
#   ./setup.sh setup      # install dependencies only
#   ./setup.sh frontend   # run frontend only
#   ./setup.sh backend    # run backend only
#   ./setup.sh dev        # run both services (no reinstall)
#
# Environment:
#   BACKEND_PORT  — backend port (default: 8080)
#   FRONTEND_PORT — frontend port (default: 3000)
#   PYTHON        — Python executable path (auto-detected)
#   PIP           — pip executable path (auto-detected)
# ──────────────────────────────────────────────────────────────

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# ─── Helpers ─────────────────────────────────────────────────
log_info()  { echo "[INFO]  $*"; }
log_warn()  { echo "[WARN]  $*"; }
log_error() { echo "[ERROR] $*"; }

die() {
  log_error "$*"
  exit 1
}

check_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required but not found."
}

# ─── Prerequisites ───────────────────────────────────────────
check_prerequisites() {
  log_info "Checking prerequisites..."
  check_command node
  check_command pnpm
  check_command python3
  check_command pip3

  NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -lt 20 ]; then
    die "Node.js 20+ required. Found: $(node -v)"
  fi

  log_info "Prerequisites OK (node $(node -v), pnpm $(pnpm --version), python $(python3 --version))."
}

# ─── Detect Python / pip ───────────────────────────────
detect_python() {
  # Allow explicit override
  PYTHON="${PYTHON:-}"
  PIP="${PIP:-}"

  if [ -n "$PYTHON" ] && [ -n "$PIP" ]; then
    return
  fi

  # Replit-managed .pythonlibs
  if [ -d "$PROJECT_ROOT/.pythonlibs" ] && [ -x "$PROJECT_ROOT/.pythonlibs/bin/python3" ]; then
    PYTHON="$PROJECT_ROOT/.pythonlibs/bin/python3"
    PIP="$PROJECT_ROOT/.pythonlibs/bin/pip3"
    log_info "Using Replit .pythonlibs venv: $PYTHON"
    return
  fi

  # System Python
  PYTHON="$(command -v python3)"
  PIP="$(command -v pip3)"
  log_info "Using system Python: $PYTHON"
}

# ─── Frontend Setup ──────────────────────────────────────────
setup_frontend() {
  log_info "Installing frontend dependencies (pnpm install)..."
  cd "$PROJECT_ROOT"
  pnpm install
  log_info "Frontend dependencies installed."
}

# ─── Backend Setup ───────────────────────────────────────────
setup_backend() {
  log_info "Installing backend dependencies (pip install)..."
  cd "$PROJECT_ROOT"
  detect_python
  "$PIP" install -r backend/requirements.txt
  log_info "Backend dependencies installed."
}

# ─── API Codegen ─────────────────────────────────────────────
run_codegen() {
  log_info "Running OpenAPI client codegen..."
  cd "$PROJECT_ROOT"
  pnpm --filter @workspace/api-spec run codegen
  log_info "Codegen complete."
}

# ─── Typecheck ───────────────────────────────────────────────
run_typecheck() {
  log_info "Running TypeScript typecheck..."
  cd "$PROJECT_ROOT"
  pnpm run typecheck
  log_info "Typecheck passed."
}

# ─── Run Backend ─────────────────────────────────────────────
run_backend() {
  log_info "Starting backend (port $BACKEND_PORT)..."
  cd "$PROJECT_ROOT"
  detect_python
  export PORT="$BACKEND_PORT"
  "$PYTHON" backend/run.py
}

# ─── Run Frontend ────────────────────────────────────────────
run_frontend() {
  log_info "Starting frontend (port $FRONTEND_PORT)..."
  cd "$PROJECT_ROOT"
  export PORT="$FRONTEND_PORT"
  export BACKEND_PORT="$BACKEND_PORT"
  export BASE_PATH="${BASE_PATH:-/}"
  pnpm --filter @workspace/trading-app run dev
}

# ─── Run Both (with background backend) ──────────────────────
run_both() {
  log_info "Starting both services..."
  cd "$PROJECT_ROOT"
  detect_python

  export PORT="$BACKEND_PORT"
  "$PYTHON" backend/run.py &
  BACKEND_PID=$!
  log_info "Backend started (PID: $BACKEND_PID) on port $BACKEND_PORT"

  # Wait for backend health endpoint
  for i in $(seq 1 30); do
    if curl -s "http://localhost:$BACKEND_PORT/" >/dev/null 2>&1; then
      log_info "Backend is ready."
      break
    fi
    sleep 1
  done

  log_info "Starting frontend on port $FRONTEND_PORT..."
  export PORT="$FRONTEND_PORT"
  export BACKEND_PORT="$BACKEND_PORT"
  export BASE_PATH="${BASE_PATH:-/}"
  pnpm --filter @workspace/trading-app run dev &
  FRONTEND_PID=$!
  log_info "Frontend started (PID: $FRONTEND_PID) on port $FRONTEND_PORT"

  log_info ""
  log_info "========================================"
  log_info "  Backend API: http://localhost:$BACKEND_PORT"
  log_info "  Frontend:    http://localhost:$FRONTEND_PORT"
  log_info "========================================"
  log_info ""
  log_info "Press Ctrl+C to stop both services."

  wait
}

# ─── Cleanup ─────────────────────────────────────────────────
cleanup() {
  log_info "Shutting down..."
  if [ -n "${BACKEND_PID:-}" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
  if [ -n "${FRONTEND_PID:-}" ]; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
  exit 0
}
trap cleanup INT TERM

# ─── Main ────────────────────────────────────────────────────
main() {
  case "${1:-run}" in
    setup)
      check_prerequisites
      setup_frontend
      setup_backend
      run_codegen
      run_typecheck
      log_info "Setup complete!"
      ;;
    frontend)
      check_prerequisites
      run_frontend
      ;;
    backend)
      check_prerequisites
      run_backend
      ;;
    dev)
      check_prerequisites
      run_both
      ;;
    run|both|*)
      check_prerequisites
      setup_frontend
      setup_backend
      run_codegen
      run_typecheck
      run_both
      ;;
  esac
}

main "$@"
