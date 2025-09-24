import importlib
import types
import pytest


class FakeCursor:
    def __init__(self, rowcount=1, raise_on_execute=False):
        self._rowcount = rowcount
        self.raise_on_execute = raise_on_execute

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")

    def close(self): pass

    @property
    def rowcount(self):
        return self._rowcount


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.closed = False

    def cursor(self, **k): return self._cursor
    def commit(self): pass
    def close(self): self.closed = True


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_add_description_missing_fields(client):
    rv = client.post("/api/add_description", json={"id": 1})
    assert rv.status_code == 400


def test_add_description_not_found(monkeypatch, client, routes_module):
    cur = FakeCursor(rowcount=0)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.post("/api/add_description", json={"id": 9, "description_probleme": "done"})
    assert rv.status_code == 404


def test_add_description_success(monkeypatch, client, routes_module):
    cur = FakeCursor(rowcount=1)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.post("/api/add_description", json={"id": 9, "description_probleme": "ok"})
    assert rv.status_code == 200


def test_add_description_db_error(monkeypatch, client, routes_module):
    fake_mysql = types.SimpleNamespace(connector=types.SimpleNamespace(Error=Exception))
    monkeypatch.setattr(routes_module, "mysql", fake_mysql, raising=True)

    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.post("/api/add_description", json={"id": 9, "description_probleme": "x"})
    assert rv.status_code == 500
