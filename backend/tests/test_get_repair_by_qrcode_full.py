import importlib
import pytest
from datetime import date, timedelta


class FakeCursor:
    def __init__(self, fetchall_seq=None, fetchone_seq=None, dict_mode=False, raise_on_execute=False):
        self.fetchall_seq = list(fetchall_seq or [])
        self.fetchone_seq = list(fetchone_seq or [])
        self.dict_mode = dict_mode
        self.raise_on_execute = raise_on_execute

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")

    def fetchall(self):
        return self.fetchall_seq.pop(0) if self.fetchall_seq else []

    def fetchone(self):
        return self.fetchone_seq.pop(0) if self.fetchone_seq else None

    def close(self): pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self._is_connected = True

    def cursor(self, **kwargs):
        self._cursor.dict_mode = kwargs.get("dictionary", False)
        return self._cursor

    def close(self): pass

    def is_connected(self):
        return self._is_connected


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_get_full_missing_params(client):
    rv = client.get("/api/get_repair_by_qrcode_full")
    assert rv.status_code == 400


def test_get_full_not_found(monkeypatch, client, routes_module):
    cur = FakeCursor(fetchall_seq=[[]])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/get_repair_by_qrcode_full?qr_code=Q1&user_tech=t1")
    assert rv.status_code == 404


def test_get_full_ok(monkeypatch, client, routes_module):
    # 1) fetchall -> réparations (dicts)
    repairs = [
        {"id": 5, "username": "alice", "application": "app", "date": date(2025, 6, 3), "comment": "c",
         "qr_code": "Q1", "hour_slot": timedelta(hours=1, minutes=2, seconds=3), "status": "repaired",
         "description_problem": "none", "user_tech": "t1"},
        {"id": 6, "username": "bob", "application": "app", "date": date(2025, 6, 4), "comment": "d",
         "qr_code": "Q1", "hour_slot": None, "status": "processing",
         "description_problem": None, "user_tech": "t1"},
    ]
    # 2) fetchone -> user address/city pour alice, puis pour bob
    user_addr = [{"address": "1 rue", "city": "Paris"}, {"address": "2 av", "city": "Lyon"}]

    cur = FakeCursor(fetchall_seq=[repairs], fetchone_seq=user_addr)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    rv = client.get("/api/get_repair_by_qrcode_full?qr_code=Q1&user_tech=t1")
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"
    assert len(data["data"]) == 2
    assert data["data"][0]["hour_slot"] == "01:02:03"
    assert "address" in data["data"][0]
