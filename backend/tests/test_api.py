"""Endpoint tests for the FastAPI app using a temp SQLite database file."""
from __future__ import annotations

import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import comparator
from main import app

client = TestClient(app)


@pytest.fixture()
def sqlite_url():
    """A throwaway SQLite file seeded with a small table."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    url = f"sqlite:///{path}"
    engine = comparator.make_engine(url)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)"))
        conn.execute(text("INSERT INTO t VALUES (1, 'alice'), (2, 'bob')"))
    engine.dispose()
    yield url
    os.unlink(path)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_tables(sqlite_url):
    res = client.post("/api/tables", json={"connection_string": sqlite_url})
    assert res.status_code == 200
    assert res.json()["tables"] == ["t"]


def test_columns(sqlite_url):
    res = client.post("/api/columns", json={"connection_string": sqlite_url, "table": "t"})
    assert res.status_code == 200
    body = res.json()
    assert body["columns"] == ["id", "name"]
    assert body["primary_key"] == ["id"]


def test_invalid_connection_returns_400():
    res = client.post("/api/tables", json={"connection_string": "not-a-valid-url"})
    assert res.status_code == 400


def test_schema_diff_identical(sqlite_url):
    res = client.post(
        "/api/schema-diff",
        json={
            "connection_a": sqlite_url,
            "connection_b": sqlite_url,
            "table_a": "t",
            "table_b": "t",
        },
    )
    assert res.status_code == 200
    assert res.json()["diff"]["identical"] is True


def test_row_diff_defaults_to_primary_key(sqlite_url):
    res = client.post(
        "/api/row-diff",
        json={
            "connection_a": sqlite_url,
            "connection_b": sqlite_url,
            "table_a": "t",
            "table_b": "t",
            "key_columns": [],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["key_columns"] == ["id"]
    assert body["summary"]["changed"] == 0
