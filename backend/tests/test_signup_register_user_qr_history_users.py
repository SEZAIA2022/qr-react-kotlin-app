import importlib
import pytest
import json
from datetime import datetime, timedelta


# ------------ Fakes génériques ------------
class FakeCursor:
    def __init__(self, fetchone_seq=None, fetchall_rows=None, dict_mode=False, lastrowid=0):
        self.fetchone_seq = list(fetchone_seq or [])
        self.fetchall_rows = list(fetchall_rows or [])
        self.dict_mode = dict_mode
        self.exec_log = []
        self.lastrowid = lastrowid

    def execute(self, sql, params=None):
        self.exec_log.append(("EXEC", sql, params))

    def fetchone(self):
        if self.fetchone_seq:
            return self.fetchone_seq.pop(0)
        return None

    def fetchall(self):
        if self.fetchall_rows:
            return self.fetchall_rows.pop(0)
        return []

    def close(self): pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.did_commit = False
        self._is_connected = True

    def cursor(self, **kwargs):
        self._cursor.dict_mode = kwargs.get("dictionary", False)
        return self._cursor

    def commit(self):
        self.did_commit = True

    def close(self): pass

    def is_connected(self):
        return self._is_connected


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


# ------------ /signup ------------
def valid_signup(**over):
    base = {
        "email": "a@test.io",
        "city": "Paris",
        "country": "FR",
        "password": "Xx#12345",
        "confirm_password": "Xx#12345"
    }
    base.update(over)
    return base


def test_signup_validation_errors(monkeypatch, client, routes_module):
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: False)
    rv = client.post("/api/signup", json=valid_signup())
    assert rv.status_code == 400
    assert rv.get_json()["status"] == "error"


def test_signup_email_registered(monkeypatch, client, routes_module):
    # SELECT users_web -> row with is_activated True
    cur1 = FakeCursor(fetchone_seq=[(True, "role", "app")])
    conn1 = FakeConn(cur1)

    calls = {"n": 0}
    def conn_seq():
        calls["n"] += 1
        return conn1
    monkeypatch.setattr(routes_module, "get_db_connection", conn_seq)
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: True)

    rv = client.post("/api/signup", json=valid_signup())
    assert rv.status_code == 400
    assert "already registered" in rv.get_json()["message"]


def test_signup_success(monkeypatch, client, routes_module, app):
    # 1) SELECT users_web -> None (ou inactif)
    cur1 = FakeCursor(fetchone_seq=[None])
    conn1 = FakeConn(cur1)
    # 2) UPDATE/DELETE + INSERT email_verifications
    cur2 = FakeCursor()
    conn2 = FakeConn(cur2)
    calls = {"n": 0}
    def conn_seq():
        calls["n"] += 1
        return conn1 if calls["n"] == 1 else conn2
    monkeypatch.setattr(routes_module, "get_db_connection", conn_seq)

    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: True)
    monkeypatch.setattr(routes_module, "hash_password", lambda p: b"HP")
    monkeypatch.setattr(routes_module, "gen_reset_token_opaque", lambda n: "TOK")
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASH")

    sent = {}
    def fake_send(to_email, verify_url, **kw):
        sent["url"] = verify_url
    monkeypatch.setattr(routes_module, "send_verification_email_link", fake_send)

    with app.app_context():
        rv = client.post("/api/signup", json=valid_signup())
    assert rv.status_code == 200
    assert "verify?token=TOK" in sent["url"]


# ------------ /register_user ------------
def test_register_user_missing_fields(client):
    rv = client.post("/api/register_user", json={"email":"a@b.c"})
    assert rv.status_code == 400


def test_register_user_conflicts(monkeypatch, client, routes_module):
    # email existe -> 400
    cur = FakeCursor(fetchone_seq=[{"id":1}, None, {"next_id": 2}], dict_mode=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    body = {"email":"a@b.c","username":"u","role":"user","application":"app"}
    rv = client.post("/api/register_user", json=body)
    assert rv.status_code == 400
    assert "already registered" in rv.get_json()["message"]


def test_register_user_ok(monkeypatch, client, routes_module):
    # email n'existe pas, username/application n'existe pas, next_id -> 5
    cur = FakeCursor(fetchone_seq=[None, None, {"next_id":5}], dict_mode=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    body = {"email":"a@b.c","username":"u","role":"user","application":"app"}
    rv = client.post("/api/register_user", json=body)
    assert rv.status_code == 201
    assert rv.get_json()["id"] == 5


# ------------ /qr_history ------------
def test_qr_history_ok(monkeypatch, client, routes_module):
    rows = [[
        {"qr_code":"Q1","is_active":1,"image_path":"/p/1.png"},
        {"qr_code":"Q2","is_active":0,"image_path":"/p/2.png"}
    ]]
    cur = FakeCursor(fetchall_rows=rows, dict_mode=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/qr_history?application=app")
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"
    assert data["data"][0]["status"] == "active"


def test_qr_history_error(monkeypatch, client, routes_module):
    def boom(): raise Exception("db")
    monkeypatch.setattr(routes_module, "get_db_connection", boom)
    rv = client.get("/api/qr_history?application=app")
    assert rv.status_code == 500


# ------------ /get_users ------------
def test_get_users_missing_application(client):
    rv = client.get("/api/get_users")
    assert rv.status_code == 400


def test_get_users_ok(monkeypatch, client, routes_module):
    cur = FakeCursor(fetchall_rows=[[{"id":1,"email":"a@b.c","username":"u","role":"user"}]], dict_mode=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    rv = client.get("/api/get_users?application=app")
    assert rv.status_code == 200
    assert rv.get_json()["success"] is True


def test_get_users_error(monkeypatch, client, routes_module):
    def boom(): raise Exception("db")
    monkeypatch.setattr(routes_module, "get_db_connection", boom)
    rv = client.get("/api/get_users?application=app")
    assert rv.status_code == 500


# ------------ /delete_user ------------
def test_delete_user_missing_id(client):
    rv = client.post("/api/delete_user", json={})
    assert rv.status_code == 400


def test_delete_user_not_found(monkeypatch, client, routes_module):
    cur = FakeCursor()
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    # On simule rowcount=0 en patchant l'attribut dynamiquement
    cur.rowcount = 0  # type: ignore
    rv = client.post("/api/delete_user", json={"id": 9})
    assert rv.status_code == 404


def test_delete_user_ok(monkeypatch, client, routes_module):
    cur = FakeCursor()
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    # rowcount > 0
    cur.rowcount = 1  # type: ignore
    rv = client.post("/api/delete_user", json={"id": 9})
    assert rv.status_code == 200
