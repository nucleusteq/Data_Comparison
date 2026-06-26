"""FastAPI app exposing schema/row comparison endpoints for two data sources."""
from __future__ import annotations

from contextlib import contextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

import comparator

app = FastAPI(title="Data Source Comparison Tool", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionRequest(BaseModel):
    connection_string: str = Field(..., description="SQLAlchemy URL")


class ColumnsRequest(ConnectionRequest):
    table: str


class CompareRequest(BaseModel):
    connection_a: str
    connection_b: str
    table_a: str
    table_b: str


class RowCompareRequest(CompareRequest):
    key_columns: list[str] = Field(default_factory=list)
    limit: int = 5000
    column_map: dict[str, str] = Field(default_factory=dict)
    ignore_columns: list[str] = Field(default_factory=list)
    where_a: str | None = None
    where_b: str | None = None


class QuickCountRequest(BaseModel):
    connection_a: str
    connection_b: str
    table_a: str
    table_b: str
    where_a: str | None = None
    where_b: str | None = None


class SyncRequest(BaseModel):
    row_diff: dict
    target_table: str


class CsvRequest(BaseModel):
    row_diff: dict


def _make(conn: str):
    try:
        return comparator.make_engine(conn)
    except Exception as exc:  # invalid URL, missing driver, etc.
        raise HTTPException(status_code=400, detail=f"Invalid connection: {exc}")


@contextmanager
def _engine(conn: str):
    """Yield one engine for a connection, disposing it when the request ends."""
    engine = _make(conn)
    try:
        yield engine
    finally:
        engine.dispose()


@contextmanager
def _engine_pair(conn_a: str, conn_b: str):
    """Yield engines for A and B, reusing a single engine when both connection
    strings are identical (same data source + database). Engines are disposed
    on exit so no server connections are left open."""
    engine_a = _make(conn_a)
    same = conn_a == conn_b
    engine_b = engine_a if same else _make(conn_b)
    try:
        yield engine_a, engine_b
    finally:
        engine_a.dispose()
        if not same:
            engine_b.dispose()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/tables")
def tables(req: ConnectionRequest):
    with _engine(req.connection_string) as engine:
        try:
            return {"tables": comparator.list_tables(engine)}
        except SQLAlchemyError as exc:
            raise HTTPException(status_code=400, detail=f"Could not list tables: {exc}")


@app.post("/api/columns")
def columns(req: ColumnsRequest):
    with _engine(req.connection_string) as engine:
        try:
            schema = comparator.get_schema(engine, req.table)
        except SQLAlchemyError as exc:
            raise HTTPException(status_code=400, detail=f"Could not read columns: {exc}")
    return {
        "columns": list(schema["columns"].keys()),
        "primary_key": schema["primary_key"],
    }


@app.post("/api/schema-diff")
def schema_diff(req: CompareRequest):
    with _engine_pair(req.connection_a, req.connection_b) as (engine_a, engine_b):
        try:
            schema_a = comparator.get_schema(engine_a, req.table_a)
            schema_b = comparator.get_schema(engine_b, req.table_b)
        except SQLAlchemyError as exc:
            raise HTTPException(status_code=400, detail=f"Schema introspection failed: {exc}")
    return {
        "schema_a": schema_a,
        "schema_b": schema_b,
        "diff": comparator.diff_schemas(schema_a, schema_b),
    }


@app.post("/api/quick-count")
def quick_count(req: QuickCountRequest):
    """Cheap row-count-only pre-flight before a full row diff."""
    with _engine_pair(req.connection_a, req.connection_b) as (engine_a, engine_b):
        try:
            return comparator.quick_count(
                engine_a,
                engine_b,
                req.table_a,
                req.table_b or req.table_a,
                where_a=req.where_a,
                where_b=req.where_b,
            )
        except SQLAlchemyError as exc:
            raise HTTPException(status_code=400, detail=f"Count failed: {exc}")


@app.post("/api/row-diff")
def row_diff(req: RowCompareRequest):
    with _engine_pair(req.connection_a, req.connection_b) as (engine_a, engine_b):
        key_columns = req.key_columns
        if not key_columns:
            # default to primary key of table A
            try:
                schema_a = comparator.get_schema(engine_a, req.table_a)
                key_columns = schema_a["primary_key"]
            except SQLAlchemyError as exc:
                raise HTTPException(status_code=400, detail=f"Could not read schema: {exc}")
            if not key_columns:
                raise HTTPException(
                    status_code=400,
                    detail="No key_columns provided and table A has no primary key.",
                )

        try:
            return comparator.diff_rows(
                engine_a,
                engine_b,
                req.table_a,
                req.table_b,
                key_columns,
                req.limit,
                column_map=req.column_map,
                ignore_columns=req.ignore_columns,
                where_a=req.where_a,
                where_b=req.where_b,
            )
        except SQLAlchemyError as exc:
            raise HTTPException(status_code=400, detail=f"Row comparison failed: {exc}")


@app.post("/api/sync-sql")
def sync_sql(req: SyncRequest):
    """Generate INSERT/UPDATE/DELETE SQL to make target B match source A."""
    try:
        sql = comparator.generate_sync_sql(req.row_diff, req.target_table)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not generate SQL: {exc}")
    return {"sql": sql}


@app.post("/api/export-csv")
def export_csv(req: CsvRequest):
    """Return the row diff flattened to CSV text."""
    from fastapi.responses import Response

    try:
        csv_text = comparator.row_diff_to_csv(req.row_diff)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not build CSV: {exc}")
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=row_diff.csv"},
    )
