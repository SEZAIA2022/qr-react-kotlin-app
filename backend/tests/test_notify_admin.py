import importlib
import types
import pytest

# Fakes DB
class FakeCursor:
    def __init__(self, rows=None, raise_on_execute=False, dict_mode=False):
        self.rows = rows or []
        self.raise_on_execute = raise_on_execute
        self.last_sql = None
        self.last_params = None
        self.closed = False
        self.dict_mode = dict_mode

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.last_sql = sql
        self.last_params = params

    def fetchall(self):
        return self.rows

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor
        self.closed = False

    def cursor(self, **kwargs):
        # kwargs peut contenir dictionary=True ; on ignore/stocke si besoin
        self._cursor.dict_mode = kwargs.get("dictionary", False)
        return self._cursor

    def close(self):
        self.closed = True


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_missing_json_returns_400(client):
    rv = client.post("/api/notify_admin", json={})
    assert rv.status_code == 400
    assert rv.get_json()["error"] == "Missing JSON data"


def test_missing_fields_returns_400(client):
    # Pas de role / email / application_name
    rv = client.post("/api/notify_admin", json={"message": "Hi"})
    assert rv.status_code == 400
    assert "required" in rv.get_json()["error"]


def test_no_tokens_returns_400(monkeypatch, client, routes_module):
    cur = FakeCursor(rows=[])  # Aucun token trouvé
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "message": "Ping",
        "role": "admin",
        "email": "a@b.c",
        "application_name": "myapp"
    }
    rv = client.post("/api/notify_admin", json=body)

    assert rv.status_code == 400
    assert rv.get_json()["error"] == "No admin tokens registered"


def test_db_error_returns_500(monkeypatch, client, routes_module):
    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "message": "Ping",
        "role": "admin",
        "email": "a@b.c",
        "application_name": "myapp"
    }
    rv = client.post("/api/notify_admin", json=body)
    assert rv.status_code == 500
    assert "error" in rv.get_json()


def test_success_user_role_sets_title_confirm(monkeypatch, client, routes_module):
    # On prépare un token côté DB
    cur = FakeCursor(rows=[{"token": "t-1"}, {"token": "t-2"}])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    # On espionne firebase_admin.messaging pour vérifier le contenu du message
    sent = {}

    class SpyMessaging(types.SimpleNamespace):
        def MulticastMessage(self, data=None, tokens=None, **kwargs):
            msg = types.SimpleNamespace(data=data or {}, tokens=tokens or [])
            sent["data"] = msg.data
            sent["tokens"] = msg.tokens
            return msg

        def send_each_for_multicast(self, message):
            # Simule un envoi OK
            return types.SimpleNamespace(success_count=len(getattr(message, "tokens", []) or []),
                                         failure_count=0,
                                         responses=[])

    spy = SpyMessaging()
    # monkeypatch directement les attributs du module routes
    monkeypatch.setattr(routes_module, "messaging", spy, raising=True)

    body = {
        "message": "Hello",
        "role": "user",  # => title = "Confirm"
        "email": "a@b.c",
        "application_name": "myapp"
    }
    rv = client.post("/api/notify_admin", json=body)
    data = rv.get_json()

    assert rv.status_code == 200
    assert data["success"] is True
    assert data["success_count"] == 2
    assert sent["tokens"] == ["t-1", "t-2"]
    assert sent["data"]["title"] == "Confirm"
    assert sent["data"]["body"] == "Hello"


def test_success_admin_role_sets_title_ask_repair(monkeypatch, client, routes_module):
    cur = FakeCursor(rows=[{"token": "t-9"}])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    sent = {}

    class SpyMessaging(types.SimpleNamespace):
        def MulticastMessage(self, data=None, tokens=None, **kwargs):
            msg = types.SimpleNamespace(data=data or {}, tokens=tokens or [])
            sent["data"] = msg.data
            sent["tokens"] = msg.tokens
            return msg

        def send_each_for_multicast(self, message):
            return types.SimpleNamespace(success_count=1, failure_count=0, responses=[])

    spy = SpyMessaging()
    monkeypatch.setattr(routes_module, "messaging", spy, raising=True)

    body = {
        "message": "Need help",
        "role": "admin",  # => title = "Ask repair"
        "email": "a@b.c",
        "application_name": "myapp"
    }
    rv = client.post("/api/notify_admin", json=body)
    data = rv.get_json()

    assert rv.status_code == 200
    assert data["success"] is True
    assert data["success_count"] == 1
    assert sent["tokens"] == ["t-9"]
    assert sent["data"]["title"] == "Ask repair"
    assert sent["data"]["body"] == "Need help"
