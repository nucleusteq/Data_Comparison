# Data Source Comparison Tool

Compare two database tables — both **schema** (columns, types, nullability, primary keys)
and **rows** (matched by key column(s), with cell-level diffs).

- **Backend:** Python + FastAPI + SQLAlchemy (works with PostgreSQL, MySQL, and any
  SQLAlchemy-supported database). The backend is **stateless** — it never stores your data.
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind. All inputs and the last
  comparison results are saved in your **browser's localStorage** only.

## Project layout

```
backend/    FastAPI app (main.py, comparator.py)
frontend/   Next.js app
```

## 1. Run the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt          # installs all DB drivers by default
uvicorn main:app --host 127.0.0.1 --port 8077 --reload
```

`requirements.txt` installs drivers for all supported databases out of the box:

- PostgreSQL: `psycopg[binary]` (psycopg3) → `postgresql+psycopg://…`
- MySQL / MariaDB: `PyMySQL` → `mysql+pymysql://…`
- Oracle: `oracledb` → `oracle+oracledb://…`
- Snowflake: `snowflake-sqlalchemy` → `snowflake://…`
- SQLite: built in, no driver needed
- SQL Server: `pyodbc` is installed, but **also needs a system ODBC library**
  that pip can't provide. On macOS: `brew install unixodbc` plus Microsoft's
  ODBC Driver 18.

## 2. Run the frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

If your backend runs somewhere other than `http://127.0.0.1:8077`, set:

```bash
NEXT_PUBLIC_API_BASE=http://your-host:port npm run dev
```

## 3. Use it

1. Enter a **connection string** for Source A and Source B (SQLAlchemy URL format):
   - `postgresql+psycopg://user:pass@host:5432/dbname`
   - `mysql+pymysql://user:pass@host:3306/dbname`
2. Enter the **table** name(s). Leave Table B blank to reuse Table A.
3. Enter **key column(s)** for row matching (comma-separated). Leave blank to use
   Table A's primary key.
4. Click **Compare schemas** and/or **Compare rows**.

Use **Clear saved data** to wipe everything from localStorage.

## API endpoints

| Method | Path                | Purpose                                              |
|--------|---------------------|------------------------------------------------------|
| GET    | `/api/health`       | Health check                                         |
| POST   | `/api/tables`       | List tables for a connection                         |
| POST   | `/api/columns`      | List columns + primary key for a table               |
| POST   | `/api/schema-diff`  | Compare schemas (columns, PK, indexes, FKs, constraints) |
| POST   | `/api/quick-count`  | Cheap row-count-only pre-flight (no rows loaded)     |
| POST   | `/api/row-diff`     | Compare two tables' rows (keyed match)               |
| POST   | `/api/sync-sql`     | Generate INSERT/UPDATE/DELETE to make B match A      |
| POST   | `/api/export-csv`   | Flatten a row diff to CSV                            |

The schema diff reports differences in **columns** (type / nullability / default /
autoincrement), **primary key**, **indexes**, **foreign keys**, **unique
constraints**, and **check constraints** (the last two degrade gracefully on
dialects that don't expose them).

Table names may be schema-qualified (e.g. `public.orders`) and reserved-word /
mixed-case names are quoted per the target dialect. Row comparison fetches rows
ordered by the key column(s) so a truncated result is deterministic, and flags
when the chosen key isn't unique.

## Notes

- No data is persisted server-side. Connection strings (which may contain
  credentials) are stored in **your browser's localStorage** — clear it on shared machines.
- Row comparison loads up to `limit` rows (default 5000) into memory per side; results
  flag when truncated.
