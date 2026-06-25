"""FastAPI app exposing schema/row comparison endpoints for two data sources."""
from __future__ import annotations

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


class CompareRequest(BaseModel):
    connection_a: str
    connection_b: str
    table_a: str
    table_b: str


class RowCompareRequest(CompareRequest):
    key_columns: list[str] = Field(default_factory=list)
    limit: int = 5000


def _engine(conn: str):
    try:
        return comparator.make_engine(conn)
    except Exception as exc:  # invalid URL, missing driver, etc.
        raise HTTPException(status_code=400, detail=f"Invalid connection: {exc}")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/tables")
def tables(req: ConnectionRequest):
    engine = _engine(req.connection_string)
    try:
        return {"tables": comparator.list_tables(engine)}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=400, detail=f"Could not list tables: {exc}")


@app.post("/api/schema-diff")
def schema_diff(req: CompareRequest):
    engine_a = _engine(req.connection_a)
    engine_b = _engine(req.connection_b)
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


@app.post("/api/row-diff")
def row_diff(req: RowCompareRequest):
    engine_a = _engine(req.connection_a)
    engine_b = _engine(req.connection_b)

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
            engine_a, engine_b, req.table_a, req.table_b, key_columns, req.limit
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=400, detail=f"Row comparison failed: {exc}")
