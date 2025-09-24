import importlib
import types
import pytest


# ----------------- Fakes génériques -----------------
class FakeCursor:
    def __init__(self, fetchall_rows=None, fetchone_seq=None, rowcount=1, raise_on_execute=False):
        self.fetchall_rows = list(fetchall_rows or [])
        self.fetchone_seq = list(fetchone_seq or [])
        self._rowcount = rowcount
        self.raise_on_execute = raise_on_execute
        self.last_sql = None
        self.last_params = None

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.last_sql = sql
        self.last_params = params

    def fetchall(self):
        if self.fetchall_rows:
            return self.fetchall_rows.pop(0)
        return []

    def fetchone(self):
        if self.fetchone_seq:
            return self.fetchone_seq.pop(0)
        return None

    @property
    def rowcount(self):
        return self._rowcount

    def close(self): pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.did_commit = False

    def cursor(self, **kwargs):
        return self._cursor

    def commit(self):
        self.did_commit = True

    def close(self): pass


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


# ----------------- /questions -----------------
def test_get_questions_ok(monkeypatch, client, routes_module):
    rows = [
        [(1, "Q1"), (2, "Q2")]
    ]
    cur = FakeCursor(fetchall_rows=rows)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.get("/api/questions?application=app")
    assert rv.status_code == 200
    data = rv.get_json()
    assert data == [{"id": 1, "text": "Q1"}, {"id": 2, "text": "Q2"}]


def test_get_questions_db_error(monkeypatch, client, routes_module):
    fake_mysql = types.SimpleNamespace(connector=types.SimpleNamespace(Error=Exception))
    monkeypatch.setattr(routes_module, "mysql", fake_mysql, raising=True)
    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.get("/api/questions?application=app")
    assert rv.status_code == 500
    assert "Database error" in rv.get_json()["message"]


# ----------------- /delete_question/<id> -----------------
def test_delete_question_not_found(monkeypatch, client, routes_module):
    # SELECT COUNT(*) -> 0
    cur = FakeCursor(fetchone_seq=[(0,)], rowcount=1)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.delete("/api/delete_question/99")
    assert rv.status_code == 404


def test_delete_question_success(monkeypatch, client, routes_module):
    # SELECT COUNT(*) -> 1 ; puis DELETE ; SELECT MAX(id) -> (5,)
    cur = FakeCursor(fetchone_seq=[(1,), (5,)], rowcount=1)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.delete("/api/delete_question/2")
    assert rv.status_code == 200
    assert conn.did_commit is True
    data = rv.get_json()
    assert data["status"] == "success"
    assert "next_id" in data


def test_delete_question_db_error(monkeypatch, client, routes_module):
    fake_mysql = types.SimpleNamespace(connector=types.SimpleNamespace(Error=Exception))
    monkeypatch.setattr(routes_module, "mysql", fake_mysql, raising=True)
    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.delete("/api/delete_question/1")
    assert rv.status_code == 500


# ----------------- /update_question/<id> -----------------
def test_update_question_empty_text(client):
    rv = client.put("/api/update_question/1", json={"text": "   "})
    assert rv.status_code == 400


def test_update_question_ok(monkeypatch, client, routes_module):
    cur = FakeCursor()
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.put("/api/update_question/3", json={"text": "New txt"})
    assert rv.status_code == 200
    assert conn.did_commit is True


def test_update_question_db_error(monkeypatch, client, routes_module):
    fake_mysql = types.SimpleNamespace(connector=types.SimpleNamespace(Error=Exception))
    monkeypatch.setattr(routes_module, "mysql", fake_mysql, raising=True)
    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.put("/api/update_question/3", json={"text": "New"})
    assert rv.status_code == 500


# ----------------- static_pages GET/PUT : about_us / term_of_use / privacy_policy -----------------
def _static_get_ok(monkeypatch, client, routes_module, path, col):
    cur = FakeCursor(fetchone_seq=[{col: "Lorem"}])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.get(f"/api/{path}?application=app")
    assert rv.status_code == 200
    assert rv.get_json()[col] == "Lorem"


def _static_get_404(monkeypatch, client, routes_module, path):
    cur = FakeCursor(fetchone_seq=[None])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.get(f"/api/{path}?application=app")
    assert rv.status_code == 404


def _static_put_missing_text(client, path, field):
    rv = client.put(f"/api/{path}?application=app", json={field: "   "})
    assert rv.status_code == 400


def _static_put_ok(monkeypatch, client, routes_module, path, field):
    cur = FakeCursor()
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.put(f"/api/{path}?application=app", json={field: "New text"})
    assert rv.status_code == 200
    assert conn.did_commit is True


def test_about_us_get_ok(monkeypatch, client, routes_module):
    _static_get_ok(monkeypatch, client, routes_module, "about_us", "about_us")


def test_about_us_get_404(monkeypatch, client, routes_module):
    _static_get_404(monkeypatch, client, routes_module, "about_us")


def test_about_us_put_missing(client):
    _static_put_missing_text(client, "about_us", "about_us")


def test_about_us_put_ok(monkeypatch, client, routes_module):
    _static_put_ok(monkeypatch, client, routes_module, "about_us", "about_us")


def test_term_of_use_get_ok(monkeypatch, client, routes_module):
    _static_get_ok(monkeypatch, client, routes_module, "term_of_use", "term_of_use")


def test_term_of_use_get_404(monkeypatch, client, routes_module):
    _static_get_404(monkeypatch, client, routes_module, "term_of_use")


def test_term_of_use_put_missing(client):
    _static_put_missing_text(client, "term_of_use", "term_of_use")


def test_term_of_use_put_ok(monkeypatch, client, routes_module):
    _static_put_ok(monkeypatch, client, routes_module, "term_of_use", "term_of_use")


def test_privacy_policy_get_ok(monkeypatch, client, routes_module):
    _static_get_ok(monkeypatch, client, routes_module, "privacy_policy", "privacy_policy")


def test_privacy_policy_get_404(monkeypatch, client, routes_module):
    _static_get_404(monkeypatch, client, routes_module, "privacy_policy")


def test_privacy_policy_put_missing(client):
    _static_put_missing_text(client, "privacy_policy", "privacy_policy")


def test_privacy_policy_put_ok(monkeypatch, client, routes_module):
    _static_put_ok(monkeypatch, client, routes_module, "privacy_policy", "privacy_policy")
