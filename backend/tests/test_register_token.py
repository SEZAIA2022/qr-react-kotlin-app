import importlib
from types import SimpleNamespace

import pytest


# ---------------------------------------------------------------------
# Faux objets DB pour contrôler le comportement
# ---------------------------------------------------------------------

class FakeCursor:
    def __init__(self, raise_on_execute=False):
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

    def cursor(self):
        return self._cursor

    def commit(self):
        if self.raise_on_commit:
            raise Exception("commit_failed")
        self.did_commit = True

    def rollback(self):
        self.did_rollback = True

    def close(self):
        self.closed = True


# ---------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------

@pytest.fixture()
def routes_module():
    # on importe le vrai module routes
    return importlib.import_module("app.routes")   # adapte si ton module est ailleurs


def test_no_body_returns_400(client):
    rv = client.post("/api/register_token", json={})  # <-- ajoute json={}
    assert rv.status_code == 400
    assert rv.get_json()["error"] == "Data is required"



def test_missing_fields_returns_400(client):
    body = {"username": "alice", "token": "tok123"}  # application_name manquant
    rv = client.post("/api/register_token", json=body)
    assert rv.status_code == 400
    assert "required" in rv.get_json()["error"]


def test_update_ok(monkeypatch, client, routes_module):
    cursor = FakeCursor()
    conn = FakeConn(cursor)

    # chaque appel get_db_connection renvoie ce fake
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "username": "alice",
        "application_name": "myapp",
        "token": "tok123"
    }
    rv = client.post("/api/register_token", json=body)

    data = rv.get_json()
    assert rv.status_code == 200
    assert data["message"] == "Token enregistré"
    # vérifie l'UPDATE et les paramètres
    assert "UPDATE users" in cursor.last_sql
    assert cursor.last_params == ("tok123", "alice", "myapp")
    assert conn.did_commit is True


def test_execute_error_returns_500(monkeypatch, client, routes_module):
    bad_cursor = FakeCursor(raise_on_execute=True)
    conn = FakeConn(bad_cursor)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "username": "bob",
        "application_name": "appX",
        "token": "tok456"
    }
    rv = client.post("/api/register_token", json=body)

    assert rv.status_code == 500
    assert "error" in rv.get_json()
    assert conn.did_rollback is True
