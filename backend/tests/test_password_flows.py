import importlib
import types
import pytest
from datetime import datetime, timedelta


class FakeCursor:
    def __init__(self, fetchone_seq=None, dict_mode=False):
        self.fetchone_seq = list(fetchone_seq or [])
        self.dict_mode = dict_mode
        self.exec_log = []

    def execute(self, sql, params=None):
        self.exec_log.append(("EXEC", sql, params))

    def fetchone(self):
        if self.fetchone_seq:
            return self.fetchone_seq.pop(0)
        return None

    def close(self): pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.did_commit = False

    def cursor(self, **kwargs):
        self._cursor.dict_mode = kwargs.get("dictionary", False)
        return self._cursor

    def commit(self): self.did_commit = True
    def close(self): pass


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


# ----- /password/forgot -----
def test_password_forgot_neutral_no_email(client):
    rv = client.post("/api/password/forgot", json={})
    assert rv.status_code == 200


def test_password_forgot_ok(monkeypatch, client, routes_module, app):
    # 1er SELECT users_web exist ? -> True/False, neutre anyway
    cur1 = FakeCursor(fetchone_seq=[(1,)])
    conn1 = FakeConn(cur1)
    cur2 = FakeCursor()
    conn2 = FakeConn(cur2)
    calls = {"n": 0}
    def conn_seq():
        calls["n"] += 1
        return conn1 if calls["n"] == 1 else conn2
    monkeypatch.setattr(routes_module, "get_db_connection", conn_seq)
    monkeypatch.setattr(routes_module, "gen_reset_token_opaque", lambda n: "TOK")
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASH")
    sent = {}
    def fake_send(to_email, reset_url, **kw):
        sent["url"] = reset_url
    monkeypatch.setattr(routes_module, "send_reset_email_link", fake_send)

    with app.app_context():
        rv = client.post("/api/password/forgot", json={"email": "a@b.c"})
    assert rv.status_code == 200
    assert "create-new-password?token=TOK" in sent["url"]


# ----- /password/verify -----
def test_password_verify_missing_token(client):
    rv = client.post("/api/password/verify", json={})
    assert rv.status_code == 400


def test_password_verify_invalid_or_used(monkeypatch, client, routes_module):
    cur = FakeCursor(fetchone_seq=[None])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASH")
    rv = client.post("/api/password/verify", json={"token": "T"})
    assert rv.status_code == 401
    assert rv.get_json()["error"] == "invalid_or_used"


def test_password_verify_expired(monkeypatch, client, routes_module):
    now = datetime.utcnow()
    row = {"id": 7, "email": "a@b.c", "status": "PENDING", "expires_at": now - timedelta(seconds=1), "attempts": 0}
    # SELECT -> row ; puis update EXPIRED commit
    cur1 = FakeCursor(fetchone_seq=[row], dict_mode=True)
    conn1 = FakeConn(cur1)
    cur2 = FakeCursor()
    conn2 = FakeConn(cur2)
    calls = {"n": 0}
    def conn_seq():
        calls["n"] += 1
        return conn1 if calls["n"] == 1 else conn2
    monkeypatch.setattr(routes_module, "get_db_connection", conn_seq)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASH")

    rv = client.post("/api/password/verify", json={"token": "T"})
    assert rv.status_code == 410
    assert rv.get_json()["error"] == "expired"


def test_password_verify_ok(monkeypatch, client, routes_module):
    row = {"id": 7, "email": "a@b.c", "status": "PENDING", "expires_at": datetime.utcnow() + timedelta(minutes=5), "attempts": 0}
    cur1 = FakeCursor(fetchone_seq=[row], dict_mode=True)
    conn1 = FakeConn(cur1)
    cur2 = FakeCursor()
    conn2 = FakeConn(cur2)
    calls = {"n": 0}
    def conn_seq():
        calls["n"] += 1
        return conn1 if calls["n"] == 1 else conn2
    monkeypatch.setattr(routes_module, "get_db_connection", conn_seq)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASH")
    rv = client.post("/api/password/verify", json={"token": "T"})
    assert rv.status_code == 200
    assert rv.get_json()["ok"] is True


# ----- /password/reset -----
def test_password_reset_missing_fields(client):
    rv = client.post("/api/password/reset", json={"token":"T","new_password":"x"})
    assert rv.status_code == 400 and rv.get_json()["error"] == "missing_fields"


def test_password_reset_mismatch(client):
    rv = client.post("/api/password/reset", json={
        "token":"T","new_password":"Xx#12345","confirm_password":"no"
    })
    assert rv.status_code == 400 and rv.get_json()["error"] == "password_mismatch"


def test_password_reset_weak(monkeypatch, client, routes_module):
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: False)
    rv = client.post("/api/password/reset", json={
        "token":"T","new_password":"weak","confirm_password":"weak"
    })
    assert rv.status_code == 400 and rv.get_json()["error"] == "weak_password"


def test_password_reset_invalid_or_used(monkeypatch, client, routes_module):
    cur = FakeCursor(fetchone_seq=[None], dict_mode=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: True)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASH")
    rv = client.post("/api/password/reset", json={
        "token":"T","new_password":"Xx#12345","confirm_password":"Xx#12345"
    })
    assert rv.status_code == 401 and rv.get_json()["error"] == "invalid_or_used"


def test_password_reset_expired(monkeypatch, client, routes_module):
    row = {"id": 7, "email": "a@b.c", "status": "PENDING",
           "expires_at": datetime.utcnow() - timedelta(seconds=1)}
    cur = FakeCursor(fetchone_seq=[row], dict_mode=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: True)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASH")
    rv = client.post("/api/password/reset", json={
        "token":"T","new_password":"Xx#12345","confirm_password":"Xx#12345"
    })
    assert rv.status_code == 410 and rv.get_json()["error"] == "expired"


def test_password_reset_ok(monkeypatch, client, routes_module):
    row = {"id": 7, "email": "a@b.c", "status": "PENDING",
           "expires_at": datetime.utcnow() + timedelta(minutes=5)}
    cur = FakeCursor(fetchone_seq=[row], dict_mode=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: True)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASH")
    monkeypatch.setattr(routes_module, "hash_password", lambda p: b"H")
    rv = client.post("/api/password/reset", json={
        "token":"T","new_password":"Xx#12345","confirm_password":"Xx#12345"
    })
    assert rv.status_code == 200
    assert rv.get_json()["message"] == "Password updated"
