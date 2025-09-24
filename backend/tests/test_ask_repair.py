import importlib
import pytest
from datetime import date, timedelta


class FakeCursor:
    def __init__(self, rows=None, raise_on_execute=False):
        self.rows = rows or []
        self.raise_on_execute = raise_on_execute
        self.exec_log = []
        self.closed = False

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.exec_log.append(("EXEC", sql, params))

    def fetchall(self):
        return self.rows

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.closed = False
        self._is_connected = True  # <-- ajouté

    def cursor(self, **kwargs):
        return self._cursor

    def close(self):
        self.closed = True

    def is_connected(self):       # <-- ajouté
        return self._is_connected



@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def _row(id=1, username="u", d=date(2025, 6, 3), comment="c", qr="Q1", hour=timedelta(hours=1, minutes=2, seconds=3), status="processing", user_tech="t1"):
    return (id, username, d, comment, qr, hour, status, user_tech)


def test_ask_repair_all_ok(monkeypatch, client, routes_module):
    cur = FakeCursor(rows=[_row(), _row(id=2, username="v")])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/ask_repair?application=app")
    assert rv.status_code == 200
    data = rv.get_json()
    assert isinstance(data, list) and len(data) == 2
    assert data[0]["hour_slot"] == "01:02:03"
    assert "username" in data[0]


def test_ask_repair_filtered_ok(monkeypatch, client, routes_module):
    cur = FakeCursor(rows=[_row(username="alice")])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/ask_repair?username=alice&application=app")
    assert rv.status_code == 200
    assert rv.get_json()[0]["username"] == "alice"


def test_ask_repair_db_error(monkeypatch, client, routes_module):
    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)

    # stub mysql.connector.Error pour capturer Exception
    import types
    fake_mysql = types.SimpleNamespace(connector=types.SimpleNamespace(Error=Exception))
    monkeypatch.setattr(routes_module, "mysql", fake_mysql, raising=True)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/ask_repair?application=app")
    assert rv.status_code == 500
    assert "Database error" in rv.get_json()["message"]
