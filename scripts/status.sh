#!/usr/bin/env bash
# Show whether backend and frontend are running.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

report() {
  local pidfile="$1" label="$2" url="$3"
  if is_running "$pidfile"; then
    echo "  $label: RUNNING (pid $(cat "$pidfile"))  $url"
  else
    echo "  $label: stopped"
  fi
}

echo "Status:"
report "$BACKEND_PID"  "backend"  "http://$BACKEND_HOST:$BACKEND_PORT"
report "$FRONTEND_PID" "frontend" "http://localhost:$FRONTEND_PORT"
