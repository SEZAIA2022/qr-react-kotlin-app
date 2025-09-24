import importlib
import pytest

# Fakes DB
class FakeCursor:
    def __init__(self, rowcount=0, raise_on_execute=False):
        self.rowcount = rowcount
        self.raise_on_execute = raise_on_execute
        self.last_sql = None
        self.last_params = None
        self.closed = False

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.last_sql = sql
        self.last_params = params

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self, cursor: FakeCursor, raise_on_commit=False):
        self._cursor = cursor
        self.raise_on_commit = raise_on_commit
        self.did_commit = False
        self.did_rollback = False
        self.closed = False

    def cursor(self, **kwargs):
        return self._cursor

    def commit(self):
        if self.raise_on_commit:
            raise Exception("commit_failed")
        self.did_commit = True

    def rollback(self):
        self.did_rollback = True

    def close(self):
        self.closed = True


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_no_json_returns_400(client):
    # Sans body → 415, donc on envoie un JSON vide pour déclencher ton 400
    rv = client.post("/api/logout", json={})
    assert rv.status_code == 400
    assert rv.get_json()["message"] == "No data received."


def test_missing_fields_returns_400(client):
    rv = client.post("/api/logout", json={"username": "alice"})  # application_name manquant
    assert rv.status_code == 400
    assert "required" in rv.get_json()["message"]


def test_user_not_found_returns_404(monkeypatch, client, routes_module):
    cur = FakeCursor(rowcount=0)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {"username": "ghost", "application_name": "myapp"}
    rv = client.post("/api/logout", json=body)

    assert rv.status_code == 404
    assert rv.get_json()["message"] == "User not found."
    assert "UPDATE users SET is_logged = FALSE" in cur.last_sql
    assert cur.last_params == ("ghost", "ghost", "myapp")


def test_logout_success(monkeypatch, client, routes_module):
    cur = FakeCursor(rowcount=1)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {"username": "john", "application_name": "myapp"}
    rv = client.post("/api/logout", json=body)

    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"
    assert data["message"] == "Logout successful."
    assert conn.did_commit is True
    assert cur.last_params == ("john", "john", "myapp")


def test_db_error_returns_500(monkeypatch, client, routes_module):
    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {"username": "john", "application_name": "myapp"}
    rv = client.post("/api/logout", json=body)

    assert rv.status_code == 500
    assert "Database error" in rv.get_json()["message"]


