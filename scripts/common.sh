#!/usr/bin/env bash
# Shared config and helpers for start/stop/restart scripts.
set -euo pipefail

# Resolve project root (parent of this scripts/ dir), regardless of where invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

RUN_DIR="$ROOT_DIR/.run"     # pid + log files live here
mkdir -p "$RUN_DIR"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8077}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

BACKEND_PID="$RUN_DIR/backend.pid"
FRONTEND_PID="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"

# True if the PID in $1 names a running process.
is_running() {
  local pidfile="$1"
  [[ -f "$pidfile" ]] || return 1
  local pid
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

# Recursively collect a PID and all of its descendants (portable: macOS & Linux).
descendants() {
  local pid="$1" child
  echo "$pid"
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    descendants "$child"
  done
}

# Stop the process tracked by pidfile $1 (labelled $2). TERM the tree, wait, then KILL.
stop_pidfile() {
  local pidfile="$1" label="$2"
  if ! is_running "$pidfile"; then
    echo "  $label: not running"
    rm -f "$pidfile"
    return 0
  fi
  local pid pids
  pid="$(cat "$pidfile")"
  echo "  $label: stopping (pid $pid)…"
  pids="$(descendants "$pid")"
  # Graceful: TERM every process in the tree (children first via reverse order).
  for p in $(echo "$pids" | tail -r 2>/dev/null || echo "$pids"); do
    kill -TERM "$p" 2>/dev/null || true
  done
  for _ in $(seq 1 20); do
    is_running "$pidfile" || break
    sleep 0.25
  done
  if is_running "$pidfile"; then
    echo "  $label: forcing kill…"
    for p in $pids; do kill -KILL "$p" 2>/dev/null || true; done
  fi
  rm -f "$pidfile"
  echo "  $label: stopped"
}
