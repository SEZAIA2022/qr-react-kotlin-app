import importlib
from types import SimpleNamespace

# --- Test doubles for DB connection/cursor ---

class FakeCursor:
    def __init__(self, select_row=None, raise_on_execute=False):
        self._select_row = select_row
        self.raise_on_execute = raise_on_execute
        self.closed = False
        self.last_sql = None
        self.last_params = None

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.last_sql = sql
        self.last_params = params

    def fetchone(self):
        return self._select_row

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self, cursor: FakeCursor, raise_on_commit=False, raise_on_cursor=False):
        self._cursor = cursor
        self.raise_on_commit = raise_on_commit
        self.raise_on_cursor = raise_on_cursor
        self.did_commit = False
        self.did_rollback = False
        self.closed = False

    def cursor(self):
        if self.raise_on_cursor:
            raise Exception("cursor_failed")
        return self._cursor

    def commit(self):
        if self.raise_on_commit:
            raise Exception("commit_failed")
        self.did_commit = True

    def rollback(self):
        self.did_rollback = True

    def close(self):
        self.closed = True


def _user_row(username="john", hashed=b"hash", email="john@x.y", role="admin"):
    """
    Return a tuple shaped like routes.py expects:
      users[2] -> hashed_password
      users[7] -> role
      users[1] -> user (username)
      users[3] -> email
    We'll pad unused indexes with None.
    """
    # [0:id, 1:username, 2:hashed, 3:email, 4,5,6, 7:role]
    return (1, username, hashed, email, None, None, None, role)


# --- Tests ---

def test_no_json_returns_400(client):
    # Envoie {} avec Content-Type: application/json
    rv = client.post("/api/login", json={})
    assert rv.status_code == 400
    assert rv.get_json()["message"] in ("No data received.", "Username or email and password required.")


def test_missing_fields_returns_400(client):
    rv = client.post("/api/login", json={"username": "john", "application_name": "myapp"})
    assert rv.status_code == 400
    assert "Username or email and password required." in rv.get_json()["message"]


def test_db_error_on_select_returns_500(monkeypatch, client):
    routes = routes = importlib.import_module("app.routes")

    def failing_conn():
        # Raise when cursor() or execute() is called
        fake_cursor = FakeCursor(raise_on_execute=True)
        return FakeConn(fake_cursor)

    monkeypatch.setattr(routes, "get_db_connection", failing_conn)
    # verify_password should not be reached, but keep it defined
    monkeypatch.setattr(routes, "verify_password", lambda pw, h: False)

    body = {"username": "john", "password": "pwd", "application_name": "myapp"}
    rv = client.post("/api/login", json=body)
    assert rv.status_code == 500
    assert "Database error" in rv.get_json()["message"]


def test_user_not_found_returns_404(monkeypatch, client):
    routes = routes = importlib.import_module("app.routes")

    def conn_no_user():
        cur = FakeCursor(select_row=None)
        return FakeConn(cur)

    monkeypatch.setattr(routes, "get_db_connection", conn_no_user)
    monkeypatch.setattr(routes, "verify_password", lambda pw, h: False)

    body = {"username": "ghost", "password": "pwd", "application_name": "myapp"}
    rv = client.post("/api/login", json=body)
    assert rv.status_code == 404
    assert "Incorrect username or password." in rv.get_json()["message"]


def test_wrong_password_returns_401(monkeypatch, client):
    routes = routes = importlib.import_module("app.routes")

    def conn_with_user():
        cur = FakeCursor(select_row=_user_row(hashed=b"storedhash"))
        return FakeConn(cur)

    monkeypatch.setattr(routes, "get_db_connection", conn_with_user)
    monkeypatch.setattr(routes, "verify_password", lambda pw, h: False)

    body = {"username": "john", "password": "bad", "application_name": "myapp"}
    rv = client.post("/api/login", json=body)
    assert rv.status_code == 401
    assert "Incorrect username or password." in rv.get_json()["message"]


def test_success_without_token_updates_is_logged(monkeypatch, client):
    routes = routes = importlib.import_module("app.routes")

    # First connection -> SELECT user
    select_cursor = FakeCursor(select_row=_user_row(username="john", email="john@x.y", role="admin", hashed="hash"))
    select_conn = FakeConn(select_cursor)

    # Second connection -> UPDATE is_logged = TRUE
    update_cursor = FakeCursor()
    update_conn = FakeConn(update_cursor)

    # Alternate between the two conns (first call select, second call update)
    calls = SimpleNamespace(n=0)

    def conn_sequence():
        calls.n += 1
        return select_conn if calls.n == 1 else update_conn

    monkeypatch.setattr(routes, "get_db_connection", conn_sequence)
    monkeypatch.setattr(routes, "verify_password", lambda pw, h: True)

    body = {"username": "john", "password": "good", "application_name": "myapp"}
    rv = client.post("/api/login", json=body)
    data = rv.get_json()

    assert rv.status_code == 200
    assert data["status"] == "success"
    assert data["role"] == "admin"
    assert data["user"] == "john"
    assert data["email"] == "john@x.y"

    # Ensure UPDATE without token happened
    assert "UPDATE users" in update_cursor.last_sql
    assert "token" not in update_cursor.last_sql.lower()
    # params should align with: (username, username, application)
    assert update_cursor.last_params == ("john", "john", "myapp")


def test_success_with_token_updates_token_and_is_logged(monkeypatch, client):
    routes = routes = importlib.import_module("app.routes")

    select_cursor = FakeCursor(select_row=_user_row(username="ana", email="ana@x.y", role="user", hashed=b"hash"))
    select_conn = FakeConn(select_cursor)

    update_cursor = FakeCursor()
    update_conn = FakeConn(update_cursor)

    calls = SimpleNamespace(n=0)
    def conn_sequence():
        calls.n += 1
        return select_conn if calls.n == 1 else update_conn

    monkeypatch.setattr(routes, "get_db_connection", conn_sequence)
    monkeypatch.setattr(routes, "verify_password", lambda pw, h: True)

    body = {
        "username": "ana",
        "password": "good",
        "application_name": "shop",
        "token": "t-12345"
    }
    rv = client.post("/api/login", json=body)
    data = rv.get_json()

    assert rv.status_code == 200
    assert data["status"] == "success"
    assert data["user"] == "ana"
    # Ensure UPDATE with token happened
    assert "SET is_logged = TRUE, token = %s" in update_cursor.last_sql
    assert update_cursor.last_params == ("t-12345", "ana", "ana", "shop")


def test_update_error_rolls_back_and_returns_500(monkeypatch, client):
    routes = routes = importlib.import_module("app.routes")

    select_cursor = FakeCursor(select_row=_user_row())
    select_conn = FakeConn(select_cursor)

    # Update connection raises on commit -> triggers rollback path
    update_cursor = FakeCursor()
    update_conn = FakeConn(update_cursor, raise_on_commit=True)

    calls = SimpleNamespace(n=0)
    def conn_sequence():
        calls.n += 1
        return select_conn if calls.n == 1 else update_conn

    monkeypatch.setattr(routes, "get_db_connection", conn_sequence)
    monkeypatch.setattr(routes, "verify_password", lambda pw, h: True)

    body = {"username": "john", "password": "good", "application_name": "myapp"}
    rv = client.post("/api/login", json=body)
    assert rv.status_code == 500
    assert "Update error" in rv.get_json()["message"]
    assert update_conn.did_rollback is True
