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


def quote_table(engine: Engine, table: str) -> str:
    """Render a (possibly schema-qualified) table name as a safely quoted SQL identifier.

    Splits on the first dot into schema.table so 'myschema.orders' and reserved
    words like 'order' are quoted correctly for the engine's dialect. This is the
    only sanctioned way to interpolate a table name into raw SQL.
    """
    preparer = engine.dialect.identifier_preparer
    if "." in table:
        schema, _, name = table.partition(".")
        return f"{preparer.quote(schema)}.{preparer.quote(name)}"
    return preparer.quote(table)


def quote_column(engine: Engine, column: str) -> str:
    """Render a column name as a safely quoted SQL identifier for the dialect."""
    return engine.dialect.identifier_preparer.quote(column)


def list_tables(engine: Engine) -> list[str]:
    return sorted(inspect(engine).get_table_names())


def get_schema(engine: Engine, table: str) -> dict[str, Any]:
    """Return a normalized schema description for a table.

    Accepts an optional ``schema.table`` form; the schema part is passed to the
    inspector so introspection works outside the default schema.
    """
    insp = inspect(engine)
    schema_name: str | None = None
    name = table
    if "." in table:
        schema_name, _, name = table.partition(".")

    columns = {}
    for col in insp.get_columns(name, schema=schema_name):
        columns[col["name"]] = {
            "type": str(col["type"]),
            "nullable": bool(col.get("nullable", True)),
            "default": None if col.get("default") is None else str(col.get("default")),
            "autoincrement": bool(col.get("autoincrement", False)),
        }
    pk = insp.get_pk_constraint(name, schema=schema_name).get("constrained_columns") or []
    indexes = [
        {
            "name": ix.get("name"),
            "columns": list(ix.get("column_names") or []),
            "unique": bool(ix.get("unique")),
        }
        for ix in insp.get_indexes(name, schema=schema_name)
    ]
    indexes.sort(key=lambda ix: (ix["columns"], ix["name"] or ""))

    foreign_keys = [
        {
            "columns": list(fk.get("constrained_columns") or []),
            "referred_table": fk.get("referred_table"),
            "referred_columns": list(fk.get("referred_columns") or []),
        }
        for fk in insp.get_foreign_keys(name, schema=schema_name)
    ]
    foreign_keys.sort(key=lambda fk: (fk["columns"], fk["referred_table"] or ""))

    # unique constraints and check constraints aren't supported by every dialect;
    # degrade gracefully rather than failing the whole comparison.
    try:
        unique_constraints = [
            {"name": uc.get("name"), "columns": list(uc.get("column_names") or [])}
            for uc in insp.get_unique_constraints(name, schema=schema_name)
        ]
        unique_constraints.sort(key=lambda uc: uc["columns"])
    except Exception:
        # Not every dialect implements get_unique_constraints; degrade gracefully.
        unique_constraints = []

    try:
        check_constraints = [
            {"name": cc.get("name"), "sqltext": str(cc.get("sqltext", ""))}
            for cc in insp.get_check_constraints(name, schema=schema_name)
        ]
        check_constraints.sort(key=lambda cc: cc["sqltext"])
    except Exception:
        # Not every dialect implements get_check_constraints; degrade gracefully.
        check_constraints = []

    return {
        "table": table,
        "columns": columns,
        "primary_key": list(pk),
        "indexes": indexes,
        "foreign_keys": foreign_keys,
        "unique_constraints": unique_constraints,
        "check_constraints": check_constraints,
    }


def _diff_named_lists(
    a_items: list[dict[str, Any]],
    b_items: list[dict[str, Any]],
    signature,
) -> dict[str, list]:
    """Diff two lists of dict objects by a structural signature (added/removed)."""
    a_by_sig = {signature(x): x for x in a_items}
    b_by_sig = {signature(x): x for x in b_items}
    only_a = [a_by_sig[s] for s in a_by_sig.keys() - b_by_sig.keys()]
    only_b = [b_by_sig[s] for s in b_by_sig.keys() - a_by_sig.keys()]
    return {"only_in_a": only_a, "only_in_b": only_b}


def diff_schemas(schema_a: dict[str, Any], schema_b: dict[str, Any]) -> dict[str, Any]:
    """Compare two schema descriptions.

    Returns added/removed/changed columns, PK diff, and structural diffs for
    indexes, foreign keys, unique constraints, and check constraints.
    """
    cols_a = schema_a["columns"]
    cols_b = schema_b["columns"]
    names_a, names_b = set(cols_a), set(cols_b)

    only_in_a = sorted(names_a - names_b)
    only_in_b = sorted(names_b - names_a)

    changed = []
    for name in sorted(names_a & names_b):
        a, b = cols_a[name], cols_b[name]
        attr_diffs = {}
        for attr in ("type", "nullable", "default", "autoincrement"):
            if a.get(attr) != b.get(attr):
                attr_diffs[attr] = {"a": a.get(attr), "b": b.get(attr)}
        if attr_diffs:
            changed.append({"column": name, "differences": attr_diffs})

    pk_a, pk_b = schema_a["primary_key"], schema_b["primary_key"]

    # Structural diffs for the richer schema objects (added/removed by signature).
    indexes = _diff_named_lists(
        schema_a.get("indexes", []),
        schema_b.get("indexes", []),
        lambda ix: (tuple(ix["columns"]), ix["unique"]),
    )
    foreign_keys = _diff_named_lists(
        schema_a.get("foreign_keys", []),
        schema_b.get("foreign_keys", []),
        lambda fk: (tuple(fk["columns"]), fk["referred_table"], tuple(fk["referred_columns"])),
    )
    unique_constraints = _diff_named_lists(
        schema_a.get("unique_constraints", []),
        schema_b.get("unique_constraints", []),
        lambda uc: tuple(uc["columns"]),
    )
    check_constraints = _diff_named_lists(
        schema_a.get("check_constraints", []),
        schema_b.get("check_constraints", []),
        lambda cc: cc["sqltext"],
    )

    structural_match = all(
        not d["only_in_a"] and not d["only_in_b"]
        for d in (indexes, foreign_keys, unique_constraints, check_constraints)
    )

    return {
        "columns_only_in_a": only_in_a,
        "columns_only_in_b": only_in_b,
        "columns_changed": changed,
        "primary_key": {"a": pk_a, "b": pk_b, "match": pk_a == pk_b},
        "indexes": indexes,
        "foreign_keys": foreign_keys,
        "unique_constraints": unique_constraints,
        "check_constraints": check_constraints,
        "identical": (
            not only_in_a
            and not only_in_b
            and not changed
            and pk_a == pk_b
            and structural_match
        ),
    }


import datetime
import decimal


def _normalize(value: Any) -> Any:
    """Make values JSON-serializable and comparable across drivers/engines.

    Handles cross-engine quirks that would otherwise cause false diffs:
      - Decimal/float: compared as float, with integral floats collapsed to int
        (so 1, 1.0, Decimal('1.00') all compare equal).
      - datetime/date: ISO string, dropping a midnight time component so
        '2024-01-01' == '2024-01-01 00:00:00'.
      - bytes: hex string.
      - str: trailing whitespace stripped on the right (common export artifact).
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int,)):
        return value
    if isinstance(value, (float, decimal.Decimal)):
        f = float(value)
        return int(f) if f.is_integer() else f
    if isinstance(value, datetime.datetime):
        if value.time() == datetime.time(0, 0, 0, 0):
            return value.date().isoformat()
        return value.isoformat(sep=" ")
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).hex()
    if isinstance(value, str):
        return value.rstrip()
    return str(value)


def count_rows(engine: Engine, table: str, where: str | None = None) -> int:
    """Return the row count for a table (honoring an optional WHERE filter)."""
    sql = f"SELECT COUNT(*) FROM {quote_table(engine, table)}"
    if where:
        sql += f" WHERE {where}"
    with engine.connect() as conn:
        return int(conn.execute(text(sql)).scalar() or 0)


def _fetch_rows(
    engine: Engine,
    table: str,
    key_columns: list[str],
    limit: int,
    where: str | None = None,
) -> tuple[dict[tuple, dict], int, int]:
    """Fetch rows keyed by key_columns. Returns ({key_tuple: row}, total_seen, dup_keys).

    Rows are fetched ordered by the key columns so the truncated subset is
    deterministic across runs. total_seen counts rows actually iterated so
    callers can detect truncation; dup_keys counts collisions on the key tuple
    (a sign the chosen key isn't unique, which would silently corrupt results).
    """
    qtable = quote_table(engine, table)
    order_by = ", ".join(quote_column(engine, k) for k in key_columns)
    sql = f"SELECT * FROM {qtable}"
    if where:
        sql += f" WHERE {where}"
    if order_by:
        sql += f" ORDER BY {order_by}"
    with engine.connect() as conn:
        result = conn.execute(text(sql))
        col_names = list(result.keys())
        rows: dict[tuple, dict] = {}
        seen = 0
        dup_keys = 0
        for raw in result:
            seen += 1
            if len(rows) >= limit:
                continue  # keep counting to report accurate truncation
            row = {col: _normalize(val) for col, val in zip(col_names, raw)}
            key = tuple(row.get(k) for k in key_columns)
            if key in rows:
                dup_keys += 1
            rows[key] = row
        return rows, seen, dup_keys


def diff_rows(
    engine_a: Engine,
    engine_b: Engine,
    table_a: str,
    table_b: str,
    key_columns: list[str],
    limit: int = 5000,
    column_map: dict[str, str] | None = None,
    ignore_columns: list[str] | None = None,
    where_a: str | None = None,
    where_b: str | None = None,
) -> dict[str, Any]:
    """Compare rows of two tables matched by key_columns.

    column_map: {a_column: b_column} for renamed columns (A's name is canonical).
    ignore_columns: A-side column names to skip during cell comparison.
    where_a / where_b: optional SQL filter applied to each side.
    """
    column_map = column_map or {}
    ignore = set(ignore_columns or [])

    rows_a, seen_a, dup_a = _fetch_rows(engine_a, table_a, key_columns, limit, where_a)
    # B is keyed by A's key names too, after mapping; fetch then re-key.
    b_key_columns = [column_map.get(k, k) for k in key_columns]
    rows_b_raw, seen_b, dup_b = _fetch_rows(engine_b, table_b, b_key_columns, limit, where_b)
    # Re-key B rows by A's key tuple so the two sides align.
    rows_b: dict[tuple, dict] = {}
    for raw_key, row in rows_b_raw.items():
        rows_b[raw_key] = row

    keys_a, keys_b = set(rows_a), set(rows_b)

    sample_a = next(iter(rows_a.values()), {})
    # Columns to compare: A-side columns, excluding keys & ignored, that have a B counterpart.
    compare_cols = [
        c for c in sample_a
        if c not in key_columns and c not in ignore
    ]

    def b_val(row_b: dict, a_col: str) -> Any:
        return row_b.get(column_map.get(a_col, a_col))

    only_in_a = [rows_a[k] for k in sorted(keys_a - keys_b, key=lambda t: tuple(str(x) for x in t))]
    only_in_b = [rows_b[k] for k in sorted(keys_b - keys_a, key=lambda t: tuple(str(x) for x in t))]

    changed = []
    for key in sorted(keys_a & keys_b, key=lambda t: tuple(str(x) for x in t)):
        ra, rb = rows_a[key], rows_b[key]
        cell_diffs = {}
        for col in compare_cols:
            av = ra.get(col)
            bv = b_val(rb, col)
            if av != bv:
                cell_diffs[col] = {"a": av, "b": bv}
        if cell_diffs:
            changed.append({
                "key": dict(zip(key_columns, key)),
                "differences": cell_diffs,
            })

    warnings = []
    if dup_a:
        warnings.append(
            f"Table A has {dup_a} row(s) sharing a key value — key columns "
            f"{key_columns} are not unique, so results may be unreliable."
        )
    if dup_b:
        warnings.append(
            f"Table B has {dup_b} row(s) sharing a key value — mapped key columns "
            f"{b_key_columns} are not unique, so results may be unreliable."
        )

    return {
        "key_columns": key_columns,
        "column_map": column_map,
        "ignored_columns": sorted(ignore),
        "compared_columns": compare_cols,
        "row_counts": {"a": seen_a, "b": seen_b},
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
        "truncated": seen_a > limit or seen_b > limit,
        "warnings": warnings,
    }


def quick_count(
    engine_a: Engine,
    engine_b: Engine,
    table_a: str,
    table_b: str,
    where_a: str | None = None,
    where_b: str | None = None,
) -> dict[str, Any]:
    """Cheap pre-flight: compare row counts only, no rows loaded into memory.

    Lets callers detect whether two tables even have the same cardinality before
    paying for a full keyed row diff (the approach Datafold/data-diff take first).
    """
    count_a = count_rows(engine_a, table_a, where_a)
    count_b = count_rows(engine_b, table_b, where_b)
    return {
        "row_counts": {"a": count_a, "b": count_b},
        "counts_match": count_a == count_b,
        "delta": count_a - count_b,
    }


# ---------------------------------------------------------------------------
# Sync script generation: SQL to make target B match source A.
# ---------------------------------------------------------------------------

def _sql_literal(value: Any) -> str:
    """Render a normalized Python value as a SQL literal."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def generate_sync_sql(row_diff: dict[str, Any], target_table: str) -> str:
    """Produce INSERT/UPDATE/DELETE statements to make B match A.

    Uses the row_diff result (A is the source of truth):
      - only_in_a  -> INSERT into B
      - changed    -> UPDATE B
      - only_in_b  -> DELETE from B
    Column names use A's names mapped to B's via column_map.
    """
    key_cols: list[str] = row_diff["key_columns"]
    column_map: dict[str, str] = row_diff.get("column_map") or {}
    compared: list[str] = row_diff.get("compared_columns") or []

    def b_col(a_col: str) -> str:
        return column_map.get(a_col, a_col)

    lines: list[str] = [
        f"-- Sync script: make {target_table} (B) match source (A)",
        "-- Review carefully and run inside a transaction.",
        "BEGIN;",
        "",
    ]

    # INSERTs for rows only in A.
    inserts = row_diff.get("only_in_a") or []
    if inserts:
        lines.append(f"-- {len(inserts)} row(s) to INSERT (present in A, missing in B)")
    for row in inserts:
        cols = [c for c in row.keys()]
        b_cols = [b_col(c) for c in cols]
        vals = [_sql_literal(row[c]) for c in cols]
        lines.append(
            f"INSERT INTO {target_table} ({', '.join(b_cols)}) VALUES ({', '.join(vals)});"
        )
    if inserts:
        lines.append("")

    # UPDATEs for changed rows.
    changed = row_diff.get("changed") or []
    if changed:
        lines.append(f"-- {len(changed)} row(s) to UPDATE (differing values)")
    for item in changed:
        sets = [
            f"{b_col(col)} = {_sql_literal(d['a'])}"
            for col, d in item["differences"].items()
            if col in compared
        ]
        where = " AND ".join(
            f"{b_col(k)} = {_sql_literal(v)}" for k, v in item["key"].items()
        )
        if sets:
            lines.append(f"UPDATE {target_table} SET {', '.join(sets)} WHERE {where};")
    if changed:
        lines.append("")

    # DELETEs for rows only in B.
    deletes = row_diff.get("only_in_b") or []
    if deletes:
        lines.append(f"-- {len(deletes)} row(s) to DELETE (present in B, missing in A)")
    for row in deletes:
        where = " AND ".join(
            f"{b_col(k)} = {_sql_literal(row.get(b_col(k)))}" for k in key_cols
        )
        lines.append(f"DELETE FROM {target_table} WHERE {where};")
    if deletes:
        lines.append("")

    lines.append("COMMIT;")
    return "\n".join(lines)


def row_diff_to_csv(row_diff: dict[str, Any]) -> str:
    """Flatten a row diff into a single CSV (one row per difference)."""
    import csv
    import io

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["change_type", "key", "column", "value_a", "value_b"])

    for item in row_diff.get("changed", []):
        key = " | ".join(f"{k}={v}" for k, v in item["key"].items())
        for col, d in item["differences"].items():
            writer.writerow(["changed", key, col, d.get("a"), d.get("b")])

    for row in row_diff.get("only_in_a", []):
        key = " | ".join(f"{k}={row.get(k)}" for k in row_diff["key_columns"])
        writer.writerow(["only_in_a", key, "", "", ""])

    for row in row_diff.get("only_in_b", []):
        cmap = row_diff.get("column_map") or {}
        key = " | ".join(
            f"{k}={row.get(cmap.get(k, k))}" for k in row_diff["key_columns"]
        )
        writer.writerow(["only_in_b", key, "", "", ""])

    return buf.getvalue()
