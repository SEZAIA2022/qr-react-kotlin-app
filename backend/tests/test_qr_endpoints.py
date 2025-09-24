import importlib
import types
import pytest


# -----------------------------
# Fakes DB
# -----------------------------
class FakeCursor:
    def __init__(self, rowcount=0, rows=None, first_fetchone=None, dict_mode=False, raise_on_execute=False):
        self.rowcount = rowcount
        self.rows = rows or []
        self._first_fetchone = first_fetchone
        self._fetchone_calls = 0
        self.dict_mode = dict_mode
        self.raise_on_execute = raise_on_execute
        self.last_sql = None
        self.last_params = None
        self.closed = False

    # supporte "with conn.cursor(dictionary=True) as cursor:"
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")
        self.last_sql = sql
        self.last_params = params

    def fetchone(self):
        # si une valeur spéciale est prévue pour le 1er fetchone()
        if self._first_fetchone is not None and self._fetchone_calls == 0:
            self._fetchone_calls += 1
            return self._first_fetchone
        self._fetchone_calls += 1
        if self.rows:
            # si dict_mode: renvoyer dicts, sinon tuples
            item = self.rows.pop(0)
            return item
        return None

    def fetchall(self):
        out = self.rows
        self.rows = []
        return out

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor
        self.did_commit = False
        self.did_rollback = False
        self.closed = False
        # simule comportement mysql.connector.connect().is_connected()
        self._is_connected = True

    def cursor(self, **kwargs):
        # kwargs: dictionary=True (pour exist_qr)
        self._cursor.dict_mode = kwargs.get("dictionary", False)
        return self._cursor

    def commit(self):
        self.did_commit = True

    def rollback(self):
        self.did_rollback = True

    def close(self):
        self.closed = True

    # compat avec code .is_connected()
    def is_connected(self):
        return self._is_connected


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


# -----------------------------
# /add_qr
# -----------------------------

def test_add_qr_missing_fields_returns_400(client):
    body = {
        "username": "u",
        "qr_code": "QR1",
        # manque country, city, zone, street, exact_location
    }
    rv = client.post("/api/add_qr", json=body)
    assert rv.status_code == 400
    assert rv.get_json()["message"] == "All fields are required"


def test_add_qr_not_found_returns_404(monkeypatch, client, routes_module):
    cur = FakeCursor(rowcount=0)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "username": "alice",
        "qr_code": "QRX",
        "country": "FR",
        "city": "Paris",
        "zone": "Z1",
        "street": "rue X",
        "exact_location": "3e"
    }
    rv = client.post("/api/add_qr", json=body)
    assert rv.status_code == 404
    assert rv.get_json()["message"] == "QR code not found."
    assert "UPDATE qr_codes" in cur.last_sql
    # WHERE qr_code = %s dernier param
    assert cur.last_params[-1] == "QRX"


def test_add_qr_success(monkeypatch, client, routes_module):
    cur = FakeCursor(rowcount=1)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "username": "bob",
        "qr_code": "QRA",
        "country": "FR",
        "city": "Lyon",
        "zone": "Z2",
        "street": "av. Y",
        "exact_location": "Bat B"
    }
    rv = client.post("/api/add_qr", json=body)
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"
    assert "successfully added and activated" in data["message"].lower()
    assert conn.did_commit is True


def test_add_qr_db_error_returns_500(monkeypatch, client, routes_module):
    # On veut que l'exception soit attrapée comme mysql.connector.Error
    # On remplace routes_module.mysql par un stub où connector.Error == Exception
    fake_mysql = types.SimpleNamespace(connector=types.SimpleNamespace(Error=Exception))
    monkeypatch.setattr(routes_module, "mysql", fake_mysql, raising=True)

    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "username": "eve",
        "qr_code": "QRZ",
        "country": "FR",
        "city": "Nice",
        "zone": "Z9",
        "street": "bd Z",
        "exact_location": "Etg 2"
    }
    rv = client.post("/api/add_qr", json=body)
    assert rv.status_code == 500
    assert "Database error" in rv.get_json()["message"]


# -----------------------------
# /exist_qr
# -----------------------------

def test_exist_qr_no_data_returns_400(client):
    rv = client.post("/api/exist_qr", json={})
    assert rv.status_code == 400
    assert rv.get_json()["message"] == "No data received."


def test_exist_qr_missing_qr_returns_400(client):
    rv = client.post("/api/exist_qr", json={"role": "user", "application_name": "app"})
    assert rv.status_code == 400
    assert rv.get_json()["message"] == "QR code is required."


def test_exist_qr_invalid_role_returns_400(client):
    rv = client.post("/api/exist_qr", json={"qr_code": "Q1", "role": "boss", "application_name": "app"})
    assert rv.status_code == 400
    assert rv.get_json()["message"] == "Invalid role"


def test_exist_qr_missing_application_returns_400(client):
    rv = client.post("/api/exist_qr", json={"qr_code": "Q1", "role": "user"})
    assert rv.status_code == 400
    assert rv.get_json()["message"] == "Application name is required."


def test_exist_qr_unknown_code_404(monkeypatch, client, routes_module):
    # 1er SELECT is_active -> None
    cur = FakeCursor(first_fetchone=None)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {"qr_code": "QX", "role": "user", "application_name": "app"}
    rv = client.post("/api/exist_qr", json=body)
    assert rv.status_code == 404
    assert rv.get_json()["message"] == "Unknown QR code"


def test_exist_qr_inactive_returns_success_not_active(monkeypatch, client, routes_module):
    # 1er SELECT is_active -> {"is_active": 0}
    cur = FakeCursor(first_fetchone={"is_active": 0})
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {"qr_code": "QX", "role": "user", "application_name": "app"}
    rv = client.post("/api/exist_qr", json=body)
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"
    assert data["is_active"] is False


def test_exist_qr_user_forbidden_if_not_owner(monkeypatch, client, routes_module):
    # 1) is_active -> 1
    # 2) SELECT * FROM qr_codes WHERE qr_code = %s AND user = %s  -> None (pas autorisé)
    cur = FakeCursor(first_fetchone={"is_active": 1}, rows=[None])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "qr_code": "Q1",
        "role": "user",
        "application_name": "app",
        "username": "alice"
    }
    rv = client.post("/api/exist_qr", json=body)
    assert rv.status_code == 403
    assert rv.get_json()["message"] == "QR code is not valid for this user."


def test_exist_qr_user_active_no_repair(monkeypatch, client, routes_module):
    # 1) is_active -> 1
    # 2) user check -> returns row (autorisé)
    # 3) check repair -> None
    cur = FakeCursor(first_fetchone={"is_active": 1}, rows=[("dummy_row",), None])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "qr_code": "Q1",
        "role": "user",
        "application_name": "app",
        "username": "alice"
    }
    rv = client.post("/api/exist_qr", json=body)
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"
    assert data["is_active"] is True
    assert data["message"] == "QR code is active"


def test_exist_qr_admin_with_processing_repair(monkeypatch, client, routes_module):
    # 1) is_active -> 1
    # 2) admin path ne vérifie pas ownership; on renvoie directement un repair en cours
    #    repair_status doit fournir dict-like avec clés 'status' et 'id'
    cur = FakeCursor(first_fetchone={"is_active": 1}, rows=[{"id": 42, "status": "Processing"}])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "qr_code": "Q1",
        "role": "admin",
        "application_name": "app",
        "username": "tech1"
    }
    rv = client.post("/api/exist_qr", json=body)
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"
    assert data["is_active"] is True
    assert data["status_repair"] == "Processing"
    assert data["id_ask_repair"] == 42


def test_exist_qr_admin_active_no_repair(monkeypatch, client, routes_module):
    # 1) is_active -> 1
    # 2) check repair -> None
    cur = FakeCursor(first_fetchone={"is_active": 1}, rows=[None])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {
        "qr_code": "Q1",
        "role": "admin",
        "application_name": "app",
        "username": "tech1"
    }
    rv = client.post("/api/exist_qr", json=body)
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["status"] == "success"
    assert data["is_active"] is True
    assert data["message"] == "QR code is active with no repair request"


def test_exist_qr_db_error_returns_500(monkeypatch, client, routes_module):
    # stub mysql.connector.Error pour catcher notre Exception
    fake_mysql = types.SimpleNamespace(connector=types.SimpleNamespace(Error=Exception))
    monkeypatch.setattr(routes_module, "mysql", fake_mysql, raising=True)

    cur = FakeCursor(raise_on_execute=True)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    body = {"qr_code": "Q1", "role": "user", "application_name": "app", "username": "u"}
    rv = client.post("/api/exist_qr", json=body)
    assert rv.status_code == 500
    assert "Database error" in rv.get_json()["message"]
