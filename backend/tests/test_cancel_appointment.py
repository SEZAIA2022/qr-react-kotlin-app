import importlib
import pytest


class FakeCursor:
    def __init__(self, sequence=None, rowcount_seq=None, raise_on_execute=False):
        """
        sequence: valeurs à renvoyer pour les fetchone successifs
            1) SELECT username, qr_code FROM ask_repair WHERE id = %s -> ("u","Q1") ou None
            2) SELECT MAX(id) FROM responses -> (n,)
            3) SELECT MAX(id) FROM ask_repair -> (m,)
        """
        self.sequence = list(sequence or [])
        self.rowcount_seq = list(rowcount_seq or [])
        self.raise_on_execute = raise_on_execute
        self.exec_log = []
        self.closed = False

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.exec_log.append(("EXEC", sql, params))

    def fetchone(self):
        return self.sequence.pop(0) if self.sequence else None

    @property
    def rowcount(self):
        return self.rowcount_seq[0] if self.rowcount_seq else 1

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.did_commit = False
        self.closed = False
        self._is_connected = True

    def cursor(self, **k): return self._cursor
    def commit(self): self.did_commit = True
    def is_connected(self): return self._is_connected
    def close(self): self.closed = True


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_cancel_missing_id(client):
    rv = client.post("/api/cancel_appointment", json={})
    assert rv.status_code == 400


def test_cancel_not_found(monkeypatch, client, routes_module):
    cur = FakeCursor(sequence=[None])  # SELECT ... WHERE id=%s -> None
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.post("/api/cancel_appointment", json={"id": 5})
    assert rv.status_code == 404


def test_cancel_success(monkeypatch, client, routes_module):
    # 1) fetchone -> ("u","Q1")
    # 2) fetchone -> (max_id_responses,)
    # 3) fetchone -> (max_id_ask_repair,)
    cur = FakeCursor(sequence=[("u", "Q1"), (7,), (10,)])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.post("/api/cancel_appointment", json={"id": 9})
    assert rv.status_code == 200
    assert conn.did_commit is True


def test_cancel_internal_error(monkeypatch, client, routes_module):
    cur = FakeCursor(sequence=[("u", "Q1")], raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.post("/api/cancel_appointment", json={"id": 9})
    assert rv.status_code == 500
