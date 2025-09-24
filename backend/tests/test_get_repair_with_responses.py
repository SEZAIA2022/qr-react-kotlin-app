import importlib
import pytest
from datetime import date, timedelta


class FakeCursor:
    def __init__(self, script=None, raise_on_execute=False):
        self.script = list(script or [])
        self.raise_on_execute = raise_on_execute
        self.exec_log = []

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.exec_log.append(("EXEC", sql, params))

    def fetchone(self):
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

    def close(self): pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self._is_connected = True

    def cursor(self, **kwargs): return self._cursor
    def close(self): pass
    def is_connected(self): return self._is_connected


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_details_not_found(monkeypatch, client, routes_module):
    cur = FakeCursor(script=[{"fetchone": None}])  # 1er SELECT -> None
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/ask_repair/details/99")
    assert rv.status_code == 404


def test_details_ok(monkeypatch, client, routes_module):
    repair_row = (5, "alice", date(2025, 6, 3), "c", "Q1", timedelta(hours=1, minutes=2, seconds=3), "processing")
    responses = [("Yes", 1), ("No", 2)]
    questions = [(1, "Is it on?"), (2, "Plugged in?")]

    cur = FakeCursor(script=[
        {"fetchone": repair_row},             # SELECT repair
        {"fetchall": responses},              # SELECT responses
        {"fetchall": questions},              # SELECT questions IN (...)
    ])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/ask_repair/details/5")
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["repair"]["hour_slot"] == "01:02:03"
    assert len(data["responses"]) == 2
    assert data["responses"][0]["question_text"] == "Is it on?"
