import importlib
import pytest
from datetime import datetime

# Fakes DB pour insertions multiples
class FakeCursor:
    def __init__(self, tech_username="tech1", raise_on_execute=False, fail_on_second_insert=False):
        self.raise_on_execute = raise_on_execute
        self.fail_on_second_insert = fail_on_second_insert
        self._select_user_called = False
        self.lastrowid = 101  # id ask_repair simulé
        self.exec_log = []
        self.closed = False

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.exec_log.append(("EXEC", sql, params))
        # simulation: si on "INSERT INTO responses" et qu'on veut échouer sur le 2e, on lève ici
        if self.fail_on_second_insert and "INSERT INTO responses" in sql and len(
            [1 for (_, s, _) in self.exec_log if "INSERT INTO responses" in s]
        ) >= 2:
            raise Exception("insert_response_failed")

    def fetchone(self):
        # premier SELECT pour username du technicien
        if not self._select_user_called:
            self._select_user_called = True
            return ("tech1",)  # tuple (username,)
        return None

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor
        self.did_commit = False
        self.did_rollback = False
        self.closed = False

    def cursor(self, **kwargs):
        return self._cursor

    def commit(self):
        self.did_commit = True

    def rollback(self):
        self.did_rollback = True

    def close(self):
        self.closed = True


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_missing_data_returns_400(client):
    rv = client.post("/api/send_ask_and_response", json={})
    assert rv.status_code == 400
    assert rv.get_json()["message"] == "Missing data"


def test_bad_date_format_returns_400(client):
    body = {
        "username": "u",
        "date": "Bad-format",
        "comment": "c",
        "qr_code": "q",
        "responses": [{"question_id": 1, "response": "Yes"}],
        "technician_email": "t@x.y",
        "application_name": "app",
    }
    rv = client.post("/api/send_ask_and_response", json=body)
    assert rv.status_code == 400
    assert "Date format incorrect" in rv.get_json()["message"]


def test_success_inserts_all_and_commit(monkeypatch, client, routes_module):
    cur = FakeCursor()
    conn = FakeConn(cur)

    # reset_auto_increment ne doit pas faire d'effet réel
    monkeypatch.setattr(routes_module, "reset_auto_increment", lambda *a, **k: None)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "username": "u",
        "date": "Tuesday, 03 June 16:50",
        "comment": "c",
        "qr_code": "q",
        "responses": [{"question_id": 1, "response": "Yes"}, {"question_id": 2, "response": "No"}],
        "technician_email": "t@x.y",
        "application_name": "app",
    }
    rv = client.post("/api/send_ask_and_response", json=body)
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"
    assert data["ask_repair_id"] == 101
    assert conn.did_commit is True

    # Vérifie les INSERT attendus
    exec_sqls = " ".join(sql for (_, sql, _) in cur.exec_log)
    assert "INSERT INTO ask_repair" in exec_sqls
    assert exec_sqls.count("INSERT INTO responses") == 2


def test_missing_question_or_response_rolls_back(monkeypatch, client, routes_module):
    cur = FakeCursor()
    conn = FakeConn(cur)

    monkeypatch.setattr(routes_module, "reset_auto_increment", lambda *a, **k: None)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    # responses contient un élément incomplet -> doit rollback + 400
    body = {
        "username": "u",
        "date": "Tuesday, 03 June 16:50",
        "comment": "c",
        "qr_code": "q",
        "responses": [{"question_id": 1, "response": "Yes"}, {"question_id": None, "response": "No"}],
        "technician_email": "t@x.y",
        "application_name": "app",
    }
    rv = client.post("/api/send_ask_and_response", json=body)
    assert rv.status_code == 400
    assert conn.did_rollback is True


def test_db_error_500_triggers_rollback(monkeypatch, client, routes_module):
    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)

    monkeypatch.setattr(routes_module, "reset_auto_increment", lambda *a, **k: None)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "username": "u",
        "date": "Tuesday, 03 June 16:50",
        "comment": "c",
        "qr_code": "q",
        "responses": [{"question_id": 1, "response": "Yes"}],
        "technician_email": "t@x.y",
        "application_name": "app",
    }
    rv = client.post("/api/send_ask_and_response", json=body)
    assert rv.status_code == 500
    assert conn.did_rollback is True
