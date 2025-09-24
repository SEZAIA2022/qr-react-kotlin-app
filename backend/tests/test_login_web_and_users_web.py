import importlib
import types
import pytest


class FakeCursor:
    def __init__(self, fetchone_seq=None, fetchall_rows=None, rowcount=1, raise_on_execute=False):
        self.fetchone_seq = list(fetchone_seq or [])
        self.fetchall_rows = list(fetchall_rows or [])
        self._rowcount = rowcount
        self.raise_on_execute = raise_on_execute

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")

    def fetchone(self):
        if self.fetchone_seq:
            return self.fetchone_seq.pop(0)
        return None

    def fetchall(self):
        if self.fetchall_rows:
            return self.fetchall_rows.pop(0)
        return []

    @property
    def rowcount(self):
        return self._rowcount

    def close(self): pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.did_commit = False
        self._is_connected = True

    def cursor(self, **kwargs): return self._cursor
    def commit(self): self.did_commit = True
    def is_connected(self): return self._is_connected
    def close(self): pass


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


# -------- /login_web --------
def test_login_web_no_data(client):
    rv = client.post("/api/login_web", json={})
    assert rv.status_code == 400


def test_login_web_email_validation_error(monkeypatch, client, routes_module):
    # validate_email_format retourne (None, ["error"])
    monkeypatch.setattr(routes_module, "validate_email_format", lambda e: (None, ["bad"]))
    rv = client.post("/api/login_web", json={"email": "bad", "password": "x"})
    assert rv.status_code == 400
    assert "errors" in rv.get_json()


def test_login_web_user_not_found(monkeypatch, client, routes_module):
    monkeypatch.setattr(routes_module, "validate_email_format", lambda e: ("ok@test.io", []))
    cur = FakeCursor(fetchone_seq=[None])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.post("/api/login_web", json={"email":"ok@test.io","password":"p"})
    assert rv.status_code == 404


def test_login_web_wrong_password(monkeypatch, client, routes_module):
    monkeypatch.setattr(routes_module, "validate_email_format", lambda e: ("ok@test.io", []))
    # user tuple avec hashed pwd en index 2, role en 7, application en 5
    user = (0, "ok@test.io", b"HASH", None, None, "app", None, "admin")
    cur = FakeCursor(fetchone_seq=[user])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    # verify_password -> False
    monkeypatch.setattr(routes_module, "verify_password", lambda p, h: False)
    rv = client.post("/api/login_web", json={"email":"ok@test.io","password":"p"})
    assert rv.status_code == 401


def test_login_web_success(monkeypatch, client, routes_module):
    monkeypatch.setattr(routes_module, "validate_email_format", lambda e: ("ok@test.io", []))
    user = (0, "ok@test.io", b"HASH", None, None, "app", None, "admin")
    cur = FakeCursor(fetchone_seq=[user])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(routes_module, "verify_password", lambda p, h: True)
    rv = client.post("/api/login_web", json={"email":"ok@test.io","password":"p"})
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["role"] == "admin"
    assert data["application"] == "app"


# -------- /get_all_user_web --------
def test_get_all_user_web_ok(monkeypatch, client, routes_module):
    cur = FakeCursor(fetchall_rows=[[{"id":1,"email":"a@b.c","qrcode_count": 3}]])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.get("/api/get_all_user_web")
    assert rv.status_code == 200
    assert rv.get_json()["status"] == "success"


def test_get_all_user_web_db_error(monkeypatch, client, routes_module):
    def boom(): raise Exception("db")
    monkeypatch.setattr(routes_module, "get_db_connection", boom)
    rv = client.get("/api/get_all_user_web")
    assert rv.status_code == 500


# -------- /user_register_web --------
def test_user_register_web_missing(client):
    rv = client.post("/api/user_register_web", json={"email":"a@b.c"})
    assert rv.status_code == 400


def test_user_register_web_ok(monkeypatch, client, routes_module):
    # SELECT MAX(id) -> (None,) → new_id = 1
    cur = FakeCursor(fetchone_seq=[(None,)])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.post("/api/user_register_web", json={"email":"a@b.c","application":"app","role":"user"})
    assert rv.status_code == 201
    assert rv.get_json()["status"] == "success"


def test_user_register_web_db_error(monkeypatch, client, routes_module):
    def boom(): raise Exception("db")
    monkeypatch.setattr(routes_module, "get_db_connection", boom)
    rv = client.post("/api/user_register_web", json={"email":"a@b.c","application":"app","role":"user"})
    assert rv.status_code == 500


# -------- /delete_user_web/<id> --------
def test_delete_user_web_not_found(monkeypatch, client, routes_module):
    cur = FakeCursor(rowcount=0)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.delete("/api/delete_user_web/7")
    assert rv.status_code == 404


def test_delete_user_web_ok(monkeypatch, client, routes_module):
    cur = FakeCursor(rowcount=1)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.delete("/api/delete_user_web/7")
    assert rv.status_code == 200
