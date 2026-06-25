"""Unit tests for the comparison logic using in-memory SQLite databases."""
from __future__ import annotations

import pytest
from sqlalchemy import text

import comparator


def _make_db(ddl_and_data: list[str]):
    """Create an in-memory SQLite engine and run the given statements."""
    engine = comparator.make_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        for stmt in ddl_and_data:
            conn.execute(text(stmt))
    return engine


# --------------------------------------------------------------------------- #
# Schema introspection / diff
# --------------------------------------------------------------------------- #


def test_get_schema_reports_columns_and_pk():
    engine = _make_db([
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER)",
    ])
    schema = comparator.get_schema(engine, "users")

    assert schema["table"] == "users"
    assert set(schema["columns"]) == {"id", "name", "age"}
    assert schema["columns"]["name"]["nullable"] is False
    assert schema["columns"]["age"]["nullable"] is True
    assert schema["primary_key"] == ["id"]


def test_diff_schemas_identical():
    a = comparator.get_schema(
        _make_db(["CREATE TABLE t (id INTEGER PRIMARY KEY, x TEXT)"]), "t"
    )
    b = comparator.get_schema(
        _make_db(["CREATE TABLE t (id INTEGER PRIMARY KEY, x TEXT)"]), "t"
    )
    diff = comparator.diff_schemas(a, b)

    assert diff["identical"] is True
    assert diff["columns_only_in_a"] == []
    assert diff["columns_only_in_b"] == []
    assert diff["columns_changed"] == []
    assert diff["primary_key"]["match"] is True


def test_diff_schemas_added_and_removed_columns():
    a = comparator.get_schema(
        _make_db(["CREATE TABLE t (id INTEGER PRIMARY KEY, only_a TEXT)"]), "t"
    )
    b = comparator.get_schema(
        _make_db(["CREATE TABLE t (id INTEGER PRIMARY KEY, only_b TEXT)"]), "t"
    )
    diff = comparator.diff_schemas(a, b)

    assert diff["identical"] is False
    assert diff["columns_only_in_a"] == ["only_a"]
    assert diff["columns_only_in_b"] == ["only_b"]


def test_diff_schemas_changed_column_type_and_nullability():
    a = comparator.get_schema(
        _make_db(["CREATE TABLE t (id INTEGER PRIMARY KEY, val INTEGER NOT NULL)"]), "t"
    )
    b = comparator.get_schema(
        _make_db(["CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)"]), "t"
    )
    diff = comparator.diff_schemas(a, b)

    changed = {c["column"]: c["differences"] for c in diff["columns_changed"]}
    assert "val" in changed
    assert "type" in changed["val"]
    assert "nullable" in changed["val"]


def test_diff_schemas_primary_key_mismatch():
    a = comparator.get_schema(
        _make_db(["CREATE TABLE t (id INTEGER PRIMARY KEY, x TEXT)"]), "t"
    )
    b = comparator.get_schema(
        _make_db(["CREATE TABLE t (id INTEGER, x TEXT PRIMARY KEY)"]), "t"
    )
    diff = comparator.diff_schemas(a, b)

    assert diff["primary_key"]["match"] is False
    assert diff["identical"] is False


# --------------------------------------------------------------------------- #
# Row diff
# --------------------------------------------------------------------------- #


def _two_tables(rows_a: list[str], rows_b: list[str]):
    ddl = "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score INTEGER)"
    engine_a = _make_db([ddl, *rows_a])
    engine_b = _make_db([ddl, *rows_b])
    return engine_a, engine_b


def test_diff_rows_identical():
    rows = [
        "INSERT INTO t VALUES (1, 'alice', 10)",
        "INSERT INTO t VALUES (2, 'bob', 20)",
    ]
    engine_a, engine_b = _two_tables(rows, rows)
    res = comparator.diff_rows(engine_a, engine_b, "t", "t", ["id"])

    assert res["matched"] == 2
    assert res["summary"]["changed"] == 0
    assert res["summary"]["only_in_a"] == 0
    assert res["summary"]["only_in_b"] == 0
    assert res["summary"]["identical_matched"] == 2
    assert res["truncated"] is False


def test_diff_rows_detects_cell_changes():
    engine_a, engine_b = _two_tables(
        ["INSERT INTO t VALUES (1, 'alice', 10)"],
        ["INSERT INTO t VALUES (1, 'alice', 99)"],
    )
    res = comparator.diff_rows(engine_a, engine_b, "t", "t", ["id"])

    assert res["summary"]["changed"] == 1
    change = res["changed"][0]
    assert change["key"] == {"id": 1}
    assert change["differences"]["score"] == {"a": 10, "b": 99}


def test_diff_rows_only_in_each_side():
    engine_a, engine_b = _two_tables(
        ["INSERT INTO t VALUES (1, 'alice', 10)", "INSERT INTO t VALUES (2, 'bob', 20)"],
        ["INSERT INTO t VALUES (2, 'bob', 20)", "INSERT INTO t VALUES (3, 'carol', 30)"],
    )
    res = comparator.diff_rows(engine_a, engine_b, "t", "t", ["id"])

    assert res["summary"]["only_in_a"] == 1
    assert res["summary"]["only_in_b"] == 1
    assert res["only_in_a"][0]["id"] == 1
    assert res["only_in_b"][0]["id"] == 3
    assert res["matched"] == 1


def test_diff_rows_composite_key():
    ddl = "CREATE TABLE t (org INTEGER, id INTEGER, name TEXT, PRIMARY KEY (org, id))"
    engine_a = _make_db([ddl, "INSERT INTO t VALUES (1, 1, 'a')"])
    engine_b = _make_db([ddl, "INSERT INTO t VALUES (1, 1, 'b')"])
    res = comparator.diff_rows(engine_a, engine_b, "t", "t", ["org", "id"])

    assert res["summary"]["changed"] == 1
    assert res["changed"][0]["key"] == {"org": 1, "id": 1}


def test_diff_rows_truncates_at_limit():
    rows = [f"INSERT INTO t VALUES ({i}, 'n{i}', {i})" for i in range(5)]
    engine_a, engine_b = _two_tables(rows, rows)
    res = comparator.diff_rows(engine_a, engine_b, "t", "t", ["id"], limit=3)

    assert res["truncated"] is True
    # row_counts reports total rows *seen* so truncation is detected accurately.
    assert res["row_counts"]["a"] == 5
    # ...but only `limit` rows are materialized & compared.
    assert res["matched"] == 3


# --------------------------------------------------------------------------- #
# Deterministic ordering, dup-key detection, quick count
# --------------------------------------------------------------------------- #


def test_diff_rows_truncation_is_deterministic_by_key():
    # Inserted out of key order; the truncated subset should still be the
    # lowest-keyed rows because we ORDER BY the key.
    rows = ["INSERT INTO t VALUES (5,'e',5)", "INSERT INTO t VALUES (1,'a',1)",
            "INSERT INTO t VALUES (3,'c',3)", "INSERT INTO t VALUES (2,'b',2)"]
    engine_a, engine_b = _two_tables(rows, rows)
    res = comparator.diff_rows(engine_a, engine_b, "t", "t", ["id"], limit=2)
    # Lowest two keys (1, 2) are the ones kept and matched.
    assert res["matched"] == 2
    assert res["summary"]["only_in_a"] == 0


def test_diff_rows_warns_on_non_unique_key():
    ddl = "CREATE TABLE t (id INTEGER, name TEXT, score INTEGER)"
    rows = ["INSERT INTO t VALUES (1,'a',1)", "INSERT INTO t VALUES (1,'b',2)"]
    engine_a = _make_db([ddl, *rows])
    engine_b = _make_db([ddl, *rows])
    res = comparator.diff_rows(engine_a, engine_b, "t", "t", ["id"])
    assert res["warnings"]
    assert "not unique" in res["warnings"][0]


def test_quick_count_matches_and_delta():
    engine_a, engine_b = _two_tables(
        ["INSERT INTO t VALUES (1,'a',1)", "INSERT INTO t VALUES (2,'b',2)"],
        ["INSERT INTO t VALUES (1,'a',1)"],
    )
    res = comparator.quick_count(engine_a, engine_b, "t", "t")
    assert res["row_counts"] == {"a": 2, "b": 1}
    assert res["counts_match"] is False
    assert res["delta"] == 1


# --------------------------------------------------------------------------- #
# Safe identifier quoting / richer schema diff
# --------------------------------------------------------------------------- #


def test_reserved_word_table_name_is_quoted():
    # "order" is a reserved word; unquoted SELECT would be a syntax error.
    engine = _make_db([
        'CREATE TABLE "order" (id INTEGER PRIMARY KEY, qty INTEGER)',
        'INSERT INTO "order" VALUES (1, 10)',
    ])
    res = comparator.diff_rows(engine, engine, "order", "order", ["id"])
    assert res["matched"] == 1


def test_schema_diff_detects_index_differences():
    a = comparator.get_schema(
        _make_db([
            "CREATE TABLE t (id INTEGER PRIMARY KEY, email TEXT)",
            "CREATE INDEX ix_email ON t (email)",
        ]),
        "t",
    )
    b = comparator.get_schema(
        _make_db(["CREATE TABLE t (id INTEGER PRIMARY KEY, email TEXT)"]),
        "t",
    )
    diff = comparator.diff_schemas(a, b)
    assert diff["identical"] is False
    assert any(ix["columns"] == ["email"] for ix in diff["indexes"]["only_in_a"])
    assert diff["indexes"]["only_in_b"] == []


def test_schema_diff_detects_foreign_key_differences():
    a = comparator.get_schema(
        _make_db([
            "CREATE TABLE parent (id INTEGER PRIMARY KEY)",
            "CREATE TABLE t (id INTEGER PRIMARY KEY, pid INTEGER REFERENCES parent(id))",
        ]),
        "t",
    )
    b = comparator.get_schema(
        _make_db([
            "CREATE TABLE t (id INTEGER PRIMARY KEY, pid INTEGER)",
        ]),
        "t",
    )
    diff = comparator.diff_schemas(a, b)
    assert diff["foreign_keys"]["only_in_a"]
    assert diff["foreign_keys"]["only_in_b"] == []


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
