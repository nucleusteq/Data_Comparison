"""Core comparison logic: schema introspection, schema diff, and row diff."""
from __future__ import annotations

from typing import Any

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine


def make_engine(connection_string: str) -> Engine:
    """Create a SQLAlchemy engine. Accepts any SQLAlchemy URL, e.g.:
    sqlite:////abs/path/to.db
    postgresql+psycopg2://user:pass@host:5432/dbname
    mysql+pymysql://user:pass@host:3306/dbname
    """
    return create_engine(connection_string, future=True)


def list_tables(engine: Engine) -> list[str]:
    return sorted(inspect(engine).get_table_names())


def get_schema(engine: Engine, table: str) -> dict[str, Any]:
    """Return a normalized schema description for a table."""
    insp = inspect(engine)
    columns = {}
    for col in insp.get_columns(table):
        columns[col["name"]] = {
            "type": str(col["type"]),
            "nullable": bool(col.get("nullable", True)),
            "default": None if col.get("default") is None else str(col.get("default")),
        }
    pk = insp.get_pk_constraint(table).get("constrained_columns") or []
    indexes = [
        {"name": ix.get("name"), "columns": list(ix.get("column_names") or []), "unique": bool(ix.get("unique"))}
        for ix in insp.get_indexes(table)
    ]
    return {"table": table, "columns": columns, "primary_key": list(pk), "indexes": indexes}


def diff_schemas(schema_a: dict[str, Any], schema_b: dict[str, Any]) -> dict[str, Any]:
    """Compare two schema descriptions. Returns added/removed/changed columns and PK diff."""
    cols_a = schema_a["columns"]
    cols_b = schema_b["columns"]
    names_a, names_b = set(cols_a), set(cols_b)

    only_in_a = sorted(names_a - names_b)
    only_in_b = sorted(names_b - names_a)

    changed = []
    for name in sorted(names_a & names_b):
        a, b = cols_a[name], cols_b[name]
        attr_diffs = {}
        for attr in ("type", "nullable", "default"):
            if a.get(attr) != b.get(attr):
                attr_diffs[attr] = {"a": a.get(attr), "b": b.get(attr)}
        if attr_diffs:
            changed.append({"column": name, "differences": attr_diffs})

    pk_a, pk_b = schema_a["primary_key"], schema_b["primary_key"]

    return {
        "columns_only_in_a": only_in_a,
        "columns_only_in_b": only_in_b,
        "columns_changed": changed,
        "primary_key": {"a": pk_a, "b": pk_b, "match": pk_a == pk_b},
        "identical": not only_in_a and not only_in_b and not changed and pk_a == pk_b,
    }


def _normalize(value: Any) -> Any:
    """Make values JSON-serializable and comparable across drivers."""
    if value is None:
        return None
    if isinstance(value, (int, float, bool, str)):
        return value
    return str(value)


def _fetch_rows(engine: Engine, table: str, key_columns: list[str], limit: int) -> dict[tuple, dict]:
    """Fetch rows keyed by the key columns. Returns {key_tuple: {col: value}}."""
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT * FROM {table}"))
        col_names = list(result.keys())
        rows: dict[tuple, dict] = {}
        for i, raw in enumerate(result):
            if i >= limit:
                break
            row = {col: _normalize(val) for col, val in zip(col_names, raw)}
            key = tuple(row.get(k) for k in key_columns)
            rows[key] = row
        return rows


def diff_rows(
    engine_a: Engine,
    engine_b: Engine,
    table_a: str,
    table_b: str,
    key_columns: list[str],
    limit: int = 5000,
) -> dict[str, Any]:
    """Compare rows of two tables matched by key_columns."""
    rows_a = _fetch_rows(engine_a, table_a, key_columns, limit)
    rows_b = _fetch_rows(engine_b, table_b, key_columns, limit)

    keys_a, keys_b = set(rows_a), set(rows_b)
    common_cols = sorted(set(next(iter(rows_a.values()), {})) & set(next(iter(rows_b.values()), {})))

    only_in_a = [rows_a[k] for k in sorted(keys_a - keys_b, key=lambda t: tuple(str(x) for x in t))]
    only_in_b = [rows_b[k] for k in sorted(keys_b - keys_a, key=lambda t: tuple(str(x) for x in t))]

    changed = []
    for key in sorted(keys_a & keys_b, key=lambda t: tuple(str(x) for x in t)):
        ra, rb = rows_a[key], rows_b[key]
        cell_diffs = {}
        for col in common_cols:
            if ra.get(col) != rb.get(col):
                cell_diffs[col] = {"a": ra.get(col), "b": rb.get(col)}
        if cell_diffs:
            changed.append({
                "key": dict(zip(key_columns, key)),
                "differences": cell_diffs,
            })

    return {
        "key_columns": key_columns,
        "row_counts": {"a": len(rows_a), "b": len(rows_b)},
        "matched": len(keys_a & keys_b),
        "only_in_a": only_in_a,
        "only_in_b": only_in_b,
        "changed": changed,
        "summary": {
            "only_in_a": len(only_in_a),
            "only_in_b": len(only_in_b),
            "changed": len(changed),
            "identical_matched": len(keys_a & keys_b) - len(changed),
        },
        "truncated": len(rows_a) >= limit or len(rows_b) >= limit,
    }
