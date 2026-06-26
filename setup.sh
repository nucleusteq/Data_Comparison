#!/usr/bin/env bash
#
# setup.sh — one-shot setup for the Data Source Comparison Tool on a fresh machine.
#
# What it does:
#   1. Checks prerequisites (python3, node, npm).
#   2. Creates the backend Python virtualenv and installs requirements.
#   3. Installs frontend npm dependencies.
#   4. Optionally installs DB drivers via flags (see below).
#
# Usage:
#   ./setup.sh                 # base setup (SQLite works with no extra driver)
#   ./setup.sh --postgres      # psycopg2-binary
#   ./setup.sh --mysql         # PyMySQL
#   ./setup.sh --mssql         # pyodbc (also needs a system ODBC driver)
#   ./setup.sh --oracle        # oracledb
#   ./setup.sh --snowflake     # snowflake-sqlalchemy
#   ./setup.sh --all-drivers   # install every driver above
#   ./setup.sh --start         # run setup, then start both services
#
# Flags combine, e.g.:  ./setup.sh --postgres --snowflake --start
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

WANT_PG=0
WANT_MYSQL=0
WANT_MSSQL=0
WANT_ORACLE=0
WANT_SNOWFLAKE=0
WANT_START=0
for arg in "$@"; do
  case "$arg" in
    --postgres|--pg) WANT_PG=1 ;;
    --mysql)         WANT_MYSQL=1 ;;
    --mssql|--sqlserver) WANT_MSSQL=1 ;;
    --oracle)        WANT_ORACLE=1 ;;
    --snowflake)     WANT_SNOWFLAKE=1 ;;
    --all-drivers)
      WANT_PG=1; WANT_MYSQL=1; WANT_MSSQL=1; WANT_ORACLE=1; WANT_SNOWFLAKE=1 ;;
    --start)         WANT_START=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

say()  { printf "\n\033[1;34m==>\033[0m %s\n" "$1"; }
ok()   { printf "    \033[1;32m✓\033[0m %s\n" "$1"; }
warn() { printf "    \033[1;33m!\033[0m %s\n" "$1"; }
die()  { printf "\n\033[1;31mERROR:\033[0m %s\n" "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
say "Checking prerequisites"
# ---------------------------------------------------------------------------
command -v python3 >/dev/null 2>&1 || die "python3 not found. Install Python 3.10+ and retry."
command -v node    >/dev/null 2>&1 || die "node not found. Install Node.js 18+ (https://nodejs.org) and retry."
command -v npm     >/dev/null 2>&1 || die "npm not found. It ships with Node.js; reinstall Node and retry."

PY_VER="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
NODE_VER="$(node --version)"
ok "python3 $PY_VER"
ok "node $NODE_VER"
ok "npm $(npm --version)"

# ---------------------------------------------------------------------------
say "Setting up backend (Python venv + dependencies)"
# ---------------------------------------------------------------------------
[[ -d "$BACKEND_DIR" ]] || die "backend/ directory not found at $BACKEND_DIR"
cd "$BACKEND_DIR"

if [[ ! -d ".venv" ]]; then
  python3 -m venv .venv
  ok "created virtualenv backend/.venv"
else
  ok "virtualenv already exists"
fi

# shellcheck disable=SC1091
./.venv/bin/python -m pip install --quiet --upgrade pip
if [[ -f requirements.txt ]]; then
  # requirements.txt now includes all DB drivers, so the base install gets
  # PostgreSQL/MySQL/Oracle/SQL Server/Snowflake support out of the box.
  ./.venv/bin/pip install --quiet -r requirements.txt
  ok "installed backend dependencies + DB drivers from requirements.txt"
else
  warn "requirements.txt missing — installed core deps only"
  ./.venv/bin/pip install --quiet fastapi "uvicorn[standard]" sqlalchemy pydantic
fi

# SQL Server's pyodbc needs a system ODBC library that pip can't provide.
if [[ "$WANT_MSSQL" == "1" || "$WANT_PG$WANT_MYSQL$WANT_ORACLE$WANT_SNOWFLAKE" != "0000" ]]; then
  warn "SQL Server (pyodbc) also needs a system ODBC driver. On macOS: 'brew install unixodbc' plus Microsoft's ODBC Driver 18."
fi

# ---------------------------------------------------------------------------
say "Setting up frontend (npm dependencies)"
# ---------------------------------------------------------------------------
[[ -d "$FRONTEND_DIR" ]] || die "frontend/ directory not found at $FRONTEND_DIR"
cd "$FRONTEND_DIR"

if [[ -f package-lock.json ]]; then
  npm ci || npm install
else
  npm install
fi
ok "installed frontend dependencies"

# ---------------------------------------------------------------------------
say "Setup complete 🎉"
# ---------------------------------------------------------------------------
cat <<EOF

Next steps:
  Start both services:   ./scripts/start.sh
  Check status:          ./scripts/status.sh
  Stop both:             ./scripts/stop.sh
  Restart both:          ./scripts/restart.sh

Then open: http://localhost:3000

Optional DB drivers (re-run setup with flags any time):
  ./setup.sh --postgres     # postgresql+psycopg2://...
  ./setup.sh --mysql        # mysql+pymysql://...
  ./setup.sh --mssql        # mssql+pyodbc://...  (+ system ODBC driver)
  ./setup.sh --oracle       # oracle+oracledb://...
  ./setup.sh --snowflake    # snowflake://...
  ./setup.sh --all-drivers  # everything above
  (SQLite needs no driver: sqlite:////path/to.db)
EOF

if [[ "$WANT_START" == "1" ]]; then
  say "Starting services (--start)"
  "$ROOT_DIR/scripts/start.sh"
fi
