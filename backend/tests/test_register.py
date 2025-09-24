import importlib
import json as pyjson
from datetime import datetime, timedelta
import pytest

# Fakes DB (séquentiels)
class ScriptedCursor:
    def __init__(self, fetchone_seq=None):
        self.fetchone_seq = list(fetchone_seq or [])
        self.exec_log = []
        self.closed = False

    def execute(self, sql, params=None):
        self.exec_log.append(("EXEC", sql, params))

    def fetchone(self):
        return self.fetchone_seq.pop(0) if self.fetchone_seq else None

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self, cursor: ScriptedCursor, raise_on_commit=False):
        self._cursor = cursor
        self.raise_on_commit = raise_on_commit
        self.did_commit = False
        self.closed = False

    def cursor(self, **kwargs):
        return self._cursor

    def commit(self):
        if self.raise_on_commit:
            raise Exception("commit_failed")
        self.did_commit = True

    def close(self):
        self.closed = True


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def valid_payload(**over):
    base = {
        "username": "alice",
        "email": "alice@test.io",
        "password": "Pass#1234",
        "confirm_password": "Pass#1234",
        "number": "+3312345678",
        "address": "1 rue",
        "country_code": "+33",
        "city": "Paris",
        "postal_code": "75000",
        "application_name": "myapp",
    }
    base.update(over)
    return base


def test_validation_missing_fields_400(client):
    rv = client.post("/api/register", json={})
    assert rv.status_code == 400
    data = rv.get_json()
    assert data["status"] == "error"
    assert "errors" in data
    assert len(data["errors"]) >= 1


def test_invalid_email_400(monkeypatch, client, routes_module):
    # on force password valide pour isoler email
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: True)
    rv = client.post("/api/register", json=valid_payload(email="bad"))
    assert rv.status_code == 400
    errors = rv.get_json()["errors"]
    assert any(e["field"] == "email" for e in errors)


def test_weak_password_400(monkeypatch, client, routes_module):
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: False)
    rv = client.post("/api/register", json=valid_payload())
    assert rv.status_code == 400
    errors = rv.get_json()["errors"]
    assert any(e["field"] == "password" for e in errors)


def test_password_mismatch_400(monkeypatch, client, routes_module):
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: True)
    rv = client.post("/api/register", json=valid_payload(confirm_password="Different#1"))
    assert rv.status_code == 400
    errors = rv.get_json()["errors"]
    assert any(e["field"] == "confirm_password" for e in errors)


def test_user_already_exists_400(monkeypatch, client, routes_module):
    # Connexion 1 : SELECT users → renvoie une ligne => existe déjà
    cur1 = ScriptedCursor(fetchone_seq=[(1,)])
    conn1 = FakeConn(cur1)

    # get_db_connection doit renvoyer conn1 pour le premier bloc try/finally
    calls = {"n": 0}
    def conn_seq():
        calls["n"] += 1
        return conn1

    monkeypatch.setattr(routes_module, "get_db_connection", conn_seq)
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: True)

    rv = client.post("/api/register", json=valid_payload())
    assert rv.status_code == 400
    assert rv.get_json()["message"] == "Username or email already exists."


def test_not_authorized_400(monkeypatch, client, routes_module):
    # Connexion 1 : SELECT users → None, puis SELECT registred_users → None
    cur1 = ScriptedCursor(fetchone_seq=[None, None])
    conn1 = FakeConn(cur1)

    calls = {"n": 0}
    def conn_seq():
        calls["n"] += 1
        return conn1

    monkeypatch.setattr(routes_module, "get_db_connection", conn_seq)
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: True)

    rv = client.post("/api/register", json=valid_payload())
    assert rv.status_code == 400
    assert rv.get_json()["message"] == "Username or email can't be used."


def test_register_success_200(monkeypatch, client, routes_module):
    # Connexion 1 : users -> None ; registred_users -> ru avec role en index 2
    cur1 = ScriptedCursor(fetchone_seq=[None, ("alice", "alice@test.io", "user", True)])
    conn1 = FakeConn(cur1)

    # Connexion 2 : enchaîne UPDATE, DELETE, INSERT + commit
    cur2 = ScriptedCursor()
    conn2 = FakeConn(cur2)

    calls = {"n": 0}
    def conn_seq():
        calls["n"] += 1
        return conn1 if calls["n"] == 1 else conn2

    monkeypatch.setattr(routes_module, "get_db_connection", conn_seq)

    # Stubs utilitaires
    monkeypatch.setattr(routes_module, "is_valid_password", lambda p: True)
    monkeypatch.setattr(routes_module, "gen_reset_token_opaque", lambda n: "FIXEDTOKEN")
    monkeypatch.setattr(routes_module, "hash_token", lambda t: "HASHEDTOKEN")
    monkeypatch.setattr(routes_module, "hash_password", lambda p: b"HASHPWD")
    sent = {"url": None}
    def fake_send_verif(to_email, verify_url, **kwargs):
        sent["url"] = verify_url
    monkeypatch.setattr(routes_module, "send_verification_email_link", fake_send_verif)

    rv = client.post("/api/register", json=valid_payload())
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"

    # Vérifie que l'INSERT a bien été tenté et le commit fait
    assert conn2.did_commit is True
    # on s'assure qu'une des exec a inséré dans email_verifications
    assert any("INSERT INTO email_verifications" in sql for (_, sql, _) in cur2.exec_log)

    # Vérifie l’URL de vérification contient le token et le flow
    assert sent["url"] is not None
    assert "FIXEDTOKEN" in sent["url"]
    assert "flow=register_user" in sent["url"]
