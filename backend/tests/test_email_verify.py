import importlib
from datetime import datetime, timedelta
import json
import types
import pytest


# ------------------------------
# Fakes DB
# ------------------------------
class FakeCursor:
    def __init__(self, script=None, dict_mode=False, raise_on_execute=False):
        """
        script: liste d'étapes de retour pour fetchone()/fetchall() par ordre d'utilisation.
                Chaque élément peut être:
                - {"fetchone": {...}}   -> renvoyé par le prochain fetchone()
                - {"fetchall": [{...}, {...}]} -> renvoyé par le prochain fetchall()
        """
        self.script = list(script or [])
        self.dict_mode = dict_mode
        self.raise_on_execute = raise_on_execute
        self.last_sql = None
        self.last_params = None
        self.closed = False
        self.exec_log = []

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.last_sql = sql
        self.last_params = params
        self.exec_log.append(("EXEC", sql, params))

    def fetchone(self):
        # Cherche le prochain élément de type fetchone
        while self.script:
            step = self.script.pop(0)
            if "fetchone" in step:
                return step["fetchone"]
        return None

    def fetchall(self):
        while self.script:
            step = self.script.pop(0)
            if "fetchall" in step:
                return step["fetchall"]
        return []

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
        self._cursor.dict_mode = kwargs.get("dictionary", False)
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


def _future(minutes=5):
    return datetime.utcnow() + timedelta(minutes=minutes)


def _past(minutes=5):
    return datetime.utcnow() - timedelta(minutes=minutes)


# ------------------------------
# TESTS _consume_email_verification (appel direct)
# ------------------------------

def test_consume_missing_token(routes_module):
    body, status = routes_module._consume_email_verification("")
    assert status == 400
    assert body["message"] == "missing token"


def test_consume_invalid_or_used_token(monkeypatch, routes_module):
    # SELECT email_verifications renvoie None -> invalid
    cur = FakeCursor(script=[
        {"fetchone": None}
    ])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASHED")

    body, status = routes_module._consume_email_verification("t")
    assert status == 401
    assert "Invalid or used token." in body["message"]


def test_consume_expired_token_sets_expired(monkeypatch, routes_module):
    row = {
        "id": 10,
        "email": "a@b.c",
        "payload_json": json.dumps({"flow": "register_user", "email": "a@b.c"}),
        "status": "PENDING",
        "expires_at": _past(1),
    }
    cur = FakeCursor(script=[
        {"fetchone": row}
    ])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASHED")

    body, status = routes_module._consume_email_verification("t")
    assert status == 410
    assert body["message"] == "Token expired."
    # a exécuté un UPDATE status='EXPIRED' puis commit
    assert conn.did_commit is True
    assert any("UPDATE email_verifications SET status='EXPIRED'" in sql for (_, sql, _) in cur.exec_log)


def test_consume_register_user_creates_user_and_uses_token(monkeypatch, routes_module):
    payload = {
        "flow": "register_user",
        "email": "alice@test.io",
        "username": "alice",
        "password_hash": "PH",
        "number": "+3312345678",
        "country_code": "+33",
        "address": "1 rue",
        "role": "user",
        "city": "Paris",
        "postal_code": "75000",
        "application": "app",
    }
    row = {
        "id": 11,
        "email": "alice@test.io",
        "payload_json": json.dumps(payload),
        "status": "PENDING",
        "expires_at": _future(5),
    }
    # Script:
    # 1) SELECT email_verifications -> row
    # 2) SELECT users (exists?) -> None
    cur = FakeCursor(script=[
        {"fetchone": row},
        {"fetchone": None},  # users.exists
    ])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASHED")
    monkeypatch.setattr(routes_module, "format_number_simple", lambda n, c: "0123456789")

    body, status = routes_module._consume_email_verification("t")
    assert status == 200
    assert body["status"] == "success"
    assert body["flow"] == "register_user"
    # a inséré users si pas existant, update registred_users, et marqué USED
    exec_sqls = " ".join(sql for (_, sql, _) in cur.exec_log)
    assert "INSERT INTO users" in exec_sqls
    assert "UPDATE registred_users" in exec_sqls
    assert "UPDATE email_verifications" in exec_sqls
    assert conn.did_commit is True


def test_consume_users_web_updates_existing(monkeypatch, routes_module):
    payload = {
        "flow": "users_web",
        "email": "web@test.io",
        "password_hash": "PWH",
        "city": "Lyon",
        "country": "FR",
        "application": "appweb",
        "role": "admin",
    }
    row = {
        "id": 12,
        "email": "web@test.io",
        "payload_json": json.dumps(payload),
        "status": "PENDING",
        "expires_at": _future(5),
    }
    # Script:
    # 1) SELECT email_verifications -> row
    # 2) SELECT users_web -> existing
    cur = FakeCursor(script=[
        {"fetchone": row},
        {"fetchone": {"id": 99, "is_activated": 0}},
    ])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASHED")

    body, status = routes_module._consume_email_verification("t")
    assert status == 200
    assert body["status"] == "success"
    assert body["flow"] == "users_web"
    exec_sqls = " ".join(sql for (_, sql, _) in cur.exec_log)
    assert "UPDATE users_web" in exec_sqls
    assert "UPDATE email_verifications SET status='USED'" in exec_sqls
    assert conn.did_commit is True


def test_consume_users_web_inserts_when_not_existing(monkeypatch, routes_module):
    payload = {
        "flow": "users_web",
        "email": "new@test.io",
        "password_hash": "PWH",
        "city": "Nice",
        "application": "appweb",
        "role": "admin",
    }
    row = {
        "id": 13,
        "email": "new@test.io",
        "payload_json": json.dumps(payload),
        "status": "PENDING",
        "expires_at": _future(5),
    }
    # 1) select email_verifications
    # 2) select users_web -> None (pas existant)
    cur = FakeCursor(script=[
        {"fetchone": row},
        {"fetchone": None},
    ])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASHED")

    body, status = routes_module._consume_email_verification("t")
    assert status == 200
    assert body["flow"] == "users_web"
    exec_sqls = " ".join(sql for (_, sql, _) in cur.exec_log)
    assert "INSERT INTO users_web" in exec_sqls
    assert "UPDATE email_verifications SET status='USED'" in exec_sqls
    assert conn.did_commit is True


# tests/test_email_verify.py

def test_consume_db_error_500(monkeypatch, routes_module, app):  # <-- ajoute "app"
    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASHED")

    with app.app_context():  # <-- contexte requis pour current_app
        body, status = routes_module._consume_email_verification("t")

    assert status == 500
    assert body["status"] == "error"
    assert "Database error" in body["message"]



# ------------------------------
# TESTS routes /email/verify & /email/verify_register
# ------------------------------

def test_email_verify_get_success(monkeypatch, client, routes_module):
    # On monkeypatch la fonction pour ne tester que le wiring GET
    def fake_consume(tok):
        return {"ok": True, "token": tok}, 200
    monkeypatch.setattr(routes_module, "_consume_email_verification", fake_consume)

    rv = client.get("/api/email/verify?token=ABC")
    assert rv.status_code == 200
    assert rv.get_json()["token"] == "ABC"


def test_email_verify_post_success(monkeypatch, client, routes_module):
    def fake_consume(tok):
        return {"ok": True, "token": tok}, 200
    monkeypatch.setattr(routes_module, "_consume_email_verification", fake_consume)

    rv = client.post("/api/email/verify", json={"token": "XYZ"})
    assert rv.status_code == 200
    assert rv.get_json()["token"] == "XYZ"


def test_email_verify_register_post_success(monkeypatch, client, routes_module):
    def fake_consume(tok):
        return {"ok": True, "token": tok}, 200
    monkeypatch.setattr(routes_module, "_consume_email_verification", fake_consume)

    rv = client.post("/api/email/verify_register", json={"token": "MNO"})
    assert rv.status_code == 200
    assert rv.get_json()["token"] == "MNO"
