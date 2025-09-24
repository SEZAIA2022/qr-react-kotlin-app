import importlib
import pytest
from datetime import date, timedelta


class FakeCursor:
    def __init__(self, fetchone_seq=None, fetchall_rows=None, raise_on_execute=False):
        self.fetchone_seq = list(fetchone_seq or [])
        self.fetchall_rows = fetchall_rows or []
        self.raise_on_execute = raise_on_execute
        self.exec_log = []

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.exec_log.append(("EXEC", sql, params))

    def fetchone(self):
        return self.fetchone_seq.pop(0) if self.fetchone_seq else None

    def fetchall(self):
        return self.fetchall_rows

    def close(self): pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
    def cursor(self, **k): return self._cursor
    def close(self): pass


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_taken_slots_missing_params(client):
    rv = client.get("/api/taken_slots")
    assert rv.status_code == 400


def test_taken_slots_user_not_found(monkeypatch, client, routes_module):
    cur = FakeCursor(fetchone_seq=[None])  # city lookup -> None
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/taken_slots?user=u&application=app")
    assert rv.status_code == 404


def test_taken_slots_ok(monkeypatch, client, routes_module):
    # fetchone_seq:
    # 1) users.city -> ("Paris",)
    # 2) total_techs -> (3,)
    cur = FakeCursor(
        fetchone_seq=[("Paris",), (3,)],
        fetchall_rows=[
            (date(2025, 6, 3), timedelta(hours=10, minutes=30), 2),
            (date(2025, 6, 3), timedelta(hours=14), 1),
        ]
    )
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/taken_slots?user=alice&application=app")
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"
    assert data["total_techs"] == 3
    assert data["taken_slots"]["2025-06-03"]["10:30"] == 2
    assert data["taken_slots"]["2025-06-03"]["14:00"] == 1


def test_taken_slots_db_error(monkeypatch, client, routes_module):
    # stub mysql error
    import types
    fake_mysql = types.SimpleNamespace(connector=types.SimpleNamespace(Error=Exception))
    monkeypatch.setattr(routes_module, "mysql", fake_mysql, raising=True)

    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/taken_slots?user=u&application=app")
    assert rv.status_code == 500
