#!/usr/bin/env bash
# Stop backend and/or frontend.
#   ./stop.sh            -> both
#   ./stop.sh backend    -> backend only
#   ./stop.sh frontend   -> frontend only
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

TARGET="${1:-all}"

echo "Stopping ($TARGET):"
case "$TARGET" in
  all)      stop_pidfile "$FRONTEND_PID" "frontend"; stop_pidfile "$BACKEND_PID" "backend" ;;
  backend)  stop_pidfile "$BACKEND_PID" "backend" ;;
  frontend) stop_pidfile "$FRONTEND_PID" "frontend" ;;
  *) echo "Usage: $0 [all|backend|frontend]"; exit 2 ;;
esac
