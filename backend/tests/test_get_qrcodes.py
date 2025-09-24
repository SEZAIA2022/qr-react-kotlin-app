import importlib
import pytest


class FakeCursor:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.dict_mode = False

    def execute(self, sql, params=None): pass
    def fetchall(self): return self.rows
    def close(self): pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self._is_connected = True

    def cursor(self, **kwargs):
        self._cursor.dict_mode = kwargs.get("dictionary", False)
        return self._cursor

    def close(self): pass
    def is_connected(self): return self._is_connected


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_get_qrcodes_ok(monkeypatch, client, routes_module):
    cur = FakeCursor(rows=[{"qr_code": "Q1"}, {"qr_code": "Q2"}, {"qr_code": None}])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/get_qrcodes?application=app")
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"
    assert data["qrcodes"] == ["Q1", "Q2"]


def test_get_qrcodes_error(monkeypatch, client, routes_module):
    def boom():
        raise Exception("db down")
    monkeypatch.setattr(routes_module, "get_db_connection", boom)

    rv = client.get("/api/get_qrcodes?application=app")
    assert rv.status_code == 500
