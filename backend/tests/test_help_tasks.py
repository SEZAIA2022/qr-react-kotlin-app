import importlib
import pytest


class FakeCursor:
    def __init__(self, fetchall_rows=None, fetchone_seq=None, lastrowid=7, raise_on_execute=False):
        self.fetchall_rows = list(fetchall_rows or [])
        self.fetchone_seq = list(fetchone_seq or [])
        self.raise_on_execute = raise_on_execute
        self.lastrowid = lastrowid

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")

    def fetchall(self):
        if self.fetchall_rows:
            return self.fetchall_rows.pop(0)
        return []

    def fetchone(self):
        if self.fetchone_seq:
            return self.fetchone_seq.pop(0)
        return None

    def close(self): pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.did_commit = False

    def cursor(self, **kwargs): return self._cursor
    def commit(self): self.did_commit = True
    def close(self): pass


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_help_tasks_get_ok(monkeypatch, client, routes_module):
    cur = FakeCursor(fetchall_rows=[[{"id":1,"title_help":"T","help":"H"}]])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.get("/api/help_tasks?application=app")
    assert rv.status_code == 200
    assert rv.get_json()["tasks"][0]["title_help"] == "T"


def test_help_tasks_get_404(monkeypatch, client, routes_module):
    cur = FakeCursor(fetchall_rows=[[]])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.get("/api/help_tasks?application=app")
    assert rv.status_code == 404


def test_help_tasks_put_missing_fields(client):
    rv = client.put("/api/help_tasks/3", json={"title_help":" ", "help":"ok"})
    assert rv.status_code == 400


def test_help_tasks_put_not_found(monkeypatch, client, routes_module):
    cur = FakeCursor(fetchone_seq=[None])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.put("/api/help_tasks/9", json={"title_help":"T","help":"H"})
    assert rv.status_code == 404


def test_help_tasks_put_ok(monkeypatch, client, routes_module):
    cur = FakeCursor(fetchone_seq=[(9,)])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.put("/api/help_tasks/9", json={"title_help":"T","help":"H"})
    assert rv.status_code == 200
    assert "task" in rv.get_json()


def test_help_tasks_post_missing(client):
    rv = client.post("/api/help_tasks", json={"title_help":"", "help":"X", "application":"a"})
    assert rv.status_code == 400


def test_help_tasks_post_ok(monkeypatch, client, routes_module):
    cur = FakeCursor(lastrowid=42)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.post("/api/help_tasks", json={"title_help":"T","help":"H","application":"app"})
    assert rv.status_code == 201
    assert rv.get_json()["task"]["id"] == 42


def test_help_tasks_delete_ok(monkeypatch, client, routes_module):
    cur = FakeCursor(fetchone_seq=[(7,)])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.delete("/api/help_tasks/7")
    assert rv.status_code == 200
