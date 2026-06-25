#!/usr/bin/env bash
# Start backend and/or frontend.
#   ./start.sh            -> both
#   ./start.sh backend    -> backend only
#   ./start.sh frontend   -> frontend only
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

TARGET="${1:-all}"

start_backend() {
  if is_running "$BACKEND_PID"; then
    echo "  backend: already running (pid $(cat "$BACKEND_PID")) on $BACKEND_HOST:$BACKEND_PORT"
    return 0
  fi
  if [[ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ]]; then
    echo "  backend: ERROR — venv not found. Run:"
    echo "    cd \"$BACKEND_DIR\" && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
    return 1
  fi
  echo "  backend: starting on http://$BACKEND_HOST:$BACKEND_PORT …"
  (
    cd "$BACKEND_DIR"
    nohup .venv/bin/uvicorn main:app \
      --host "$BACKEND_HOST" --port "$BACKEND_PORT" --reload \
      >"$BACKEND_LOG" 2>&1 &
    echo $! >"$BACKEND_PID"
  )
  sleep 1
  if is_running "$BACKEND_PID"; then
    echo "  backend: started (pid $(cat "$BACKEND_PID")), logs -> $BACKEND_LOG"
  else
    echo "  backend: FAILED to start — see $BACKEND_LOG"; tail -n 15 "$BACKEND_LOG" || true
    return 1
  fi
}

start_frontend() {
  if is_running "$FRONTEND_PID"; then
    echo "  frontend: already running (pid $(cat "$FRONTEND_PID")) on :$FRONTEND_PORT"
    return 0
  fi
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "  frontend: ERROR — node_modules not found. Run:"
    echo "    cd \"$FRONTEND_DIR\" && npm install"
    return 1
  fi
  echo "  frontend: starting on http://localhost:$FRONTEND_PORT …"
  (
    cd "$FRONTEND_DIR"
    nohup npm run dev -- --port "$FRONTEND_PORT" \
      >"$FRONTEND_LOG" 2>&1 &
    echo $! >"$FRONTEND_PID"
  )
  sleep 1
  if is_running "$FRONTEND_PID"; then
    echo "  frontend: started (pid $(cat "$FRONTEND_PID")), logs -> $FRONTEND_LOG"
  else
    echo "  frontend: FAILED to start — see $FRONTEND_LOG"; tail -n 15 "$FRONTEND_LOG" || true
    return 1
  fi
}

echo "Starting ($TARGET):"
case "$TARGET" in
  all)      start_backend; start_frontend ;;
  backend)  start_backend ;;
  frontend) start_frontend ;;
  *) echo "Usage: $0 [all|backend|frontend]"; exit 2 ;;
esac
