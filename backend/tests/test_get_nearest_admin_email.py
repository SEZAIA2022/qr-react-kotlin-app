import importlib
import pytest

# Cursor scripté pour enchaîner fetchone/fetchall
class ScriptedCursor:
    def __init__(self, fetchone_seq=None, fetchall_seq=None, raise_on_execute=False):
        self.fetchone_seq = list(fetchone_seq or [])
        self.fetchall_seq = list(fetchall_seq or [])
        self.raise_on_execute = raise_on_execute
        self.last_sql = None
        self.last_params = None
        self.closed = False
        self.dict_mode = False

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.last_sql = sql
        self.last_params = params

    def fetchone(self):
        return self.fetchone_seq.pop(0) if self.fetchone_seq else None

    def fetchall(self):
        return self.fetchall_seq.pop(0) if self.fetchall_seq else []

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self, cursor: ScriptedCursor):
        self._cursor = cursor
        self.closed = False

    def cursor(self, **kwargs):
        # dictionary=True attendu par la route
        self._cursor.dict_mode = kwargs.get("dictionary", False)
        return self._cursor

    def close(self):
        self.closed = True


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_missing_params_returns_400(client):
    rv = client.post("/api/get_nearest_admin_email", json={})
    assert rv.status_code == 400
    assert rv.get_json()["message"] == "Missing parameters"


def test_user_not_found_404(monkeypatch, client, routes_module):
    # 1) fetchone() pour user_info → None
    cur = ScriptedCursor(fetchone_seq=[None])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {"email": "u@x.y", "application_name": "app", "date": "2025-10-01", "hour_slot": "10:00"}
    rv = client.post("/api/get_nearest_admin_email", json=body)
    assert rv.status_code == 404
    assert "Utilisateur non trouvé" in rv.get_json()["message"]


def test_no_technicians_404(monkeypatch, client, routes_module):
    # 1) user_info → {"city":"Paris"}
    # 2) technicians → []
    cur = ScriptedCursor(
        fetchone_seq=[{"city": "Paris"}],
        fetchall_seq=[[], []]  # second fetchall technicians = [], third unused
    )
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {"email": "u@x.y", "application_name": "app", "date": "2025-10-01", "hour_slot": "10:00"}
    rv = client.post("/api/get_nearest_admin_email", json=body)
    assert rv.status_code == 404
    assert rv.get_json()["message"] == "No technicians found"


def test_conflict_no_available_409(monkeypatch, client, routes_module):
    # 1) user_info → {"city":"Paris"}
    # 2) technicians → [{"username":"t1","email":"t1@x.y"}, {"username":"t2","email":"t2@x.y"}]
    # 3) taken_techs → [{"user_tech":"t1"}, {"user_tech":"t2"}]
    cur = ScriptedCursor(
        fetchone_seq=[{"city": "Paris"}],
        fetchall_seq=[
            [{"username": "t1", "email": "t1@x.y"}, {"username": "t2", "email": "t2@x.y"}],
            [{"user_tech": "t1"}, {"user_tech": "t2"}],
        ],
    )
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {"email": "u@x.y", "application_name": "app", "date": "2025-10-01", "hour_slot": "10:00"}
    rv = client.post("/api/get_nearest_admin_email", json=body)
    assert rv.status_code == 409
    assert rv.get_json()["message"] == "No available technicians at this slot"


def test_success_first_free_returned(monkeypatch, client, routes_module):
    # 1) user_info → {"city":"Paris"}
    # 2) technicians → t1, t2
    # 3) taken_techs → [{"user_tech":"t1"}] => t2 libre
    cur = ScriptedCursor(
        fetchone_seq=[{"city": "Paris"}],
        fetchall_seq=[
            [{"username": "t1", "email": "t1@x.y"}, {"username": "t2", "email": "t2@x.y"}],
            [{"user_tech": "t1"}],
        ],
    )
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {"email": "u@x.y", "application_name": "app", "date": "2025-10-01", "hour_slot": "10:00"}
    rv = client.post("/api/get_nearest_admin_email", json=body)
    assert rv.status_code == 200
    assert rv.get_json()["status"] == "success"
    assert rv.get_json()["email"] == "t2@x.y"


def test_db_error_500(monkeypatch, client, routes_module):
    cur = ScriptedCursor(raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {"email": "u@x.y", "application_name": "app", "date": "2025-10-01", "hour_slot": "10:00"}
    rv = client.post("/api/get_nearest_admin_email", json=body)
    assert rv.status_code == 500
    assert "status" in rv.get_json()
