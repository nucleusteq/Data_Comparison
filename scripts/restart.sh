#!/usr/bin/env bash
# Restart backend and/or frontend.
#   ./restart.sh            -> both
#   ./restart.sh backend    -> backend only
#   ./restart.sh frontend   -> frontend only
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-all}"

"$SCRIPT_DIR/stop.sh" "$TARGET"
sleep 1
"$SCRIPT_DIR/start.sh" "$TARGET"
