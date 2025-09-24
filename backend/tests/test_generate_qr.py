import importlib
import types
import pytest


class FakeCursor:
    def __init__(self, fetchone_seq=None, raise_on_execute=False, integrity_err=None):
        """
        fetchone_seq:
          1) SELECT MAX(id) FROM qr_codes -> (max_id,)
          2) SELECT COUNT(*) FROM qr_codes WHERE application = %s -> (existing_count,)
        """
        self.fetchone_seq = list(fetchone_seq or [])
        self.raise_on_execute = raise_on_execute
        self.exec_log = []
        self.closed = False
        self.integrity_err = integrity_err  # si non None, levée lors du 1er INSERT

        self.insert_calls = 0

    def execute(self, sql, params=None):
        if self.raise_on_execute:
            raise Exception("execute_failed")

        # Simuler IntegrityError au premier INSERT
        if "INSERT INTO qr_codes" in sql:
            self.insert_calls += 1
            if self.integrity_err and self.insert_calls == 1:
                raise self.integrity_err

        self.exec_log.append(("EXEC", sql, params))

    def fetchone(self):
        return self.fetchone_seq.pop(0) if self.fetchone_seq else (0,)

    def close(self): self.closed = True


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.closed = False

    def cursor(self, **k): return self._cursor
    def commit(self): pass
    def close(self): self.closed = True


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_generate_qr_success(monkeypatch, client, routes_module, app):
    # max id = 10 ; existing_count = 3
    cur = FakeCursor(fetchone_seq=[(10,), (3,)])
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    # stub generator (path non utilisé par la route pour le JSON)
    monkeypatch.setattr(routes_module, "generate_qr_code", lambda out, app, idx: (f"CODE{idx}", f"/p/{idx}.png"))

    with app.app_context():
        rv = client.post("/api/generate_qr", json={"count": 2, "application": "myapp"})
    assert rv.status_code == 201
    data = rv.get_json()
    assert len(data) == 2
    assert data[0]["code"] == "CODE4"  # existing_count=3 -> first is index 4
    assert data[0]["image_path"].endswith("myapp4.png")


def test_generate_qr_duplicate_then_ok(monkeypatch, client, routes_module, app):
    # max id = 0 ; existing_count = 0
    # 1er INSERT -> IntegrityError errno 1062 (duplicate), 2e INSERT OK
    class IntegrityErr(Exception):
        def __init__(self, errno): self.errno = errno

    cur = FakeCursor(fetchone_seq=[(0,), (0,)], integrity_err=IntegrityErr(1062))
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    monkeypatch.setattr(routes_module, "generate_qr_code", lambda out, appname, idx: (f"C{idx}", f"/p/{idx}.png"))

    # stub mysql.connector.IntegrityError
    fake_mysql = types.SimpleNamespace(connector=types.SimpleNamespace(IntegrityError=IntegrityErr))
    monkeypatch.setattr(routes_module, "mysql", fake_mysql, raising=True)

    with app.app_context():
        rv = client.post("/api/generate_qr", json={"count": 1, "application": "app"})
    assert rv.status_code == 201
    assert len(rv.get_json()) == 1


def test_generate_qr_db_error(monkeypatch, client, routes_module, app):
    class IntegrityErr(Exception):
        def __init__(self, errno): self.errno = errno

    # Ici on lève une IntegrityError avec un errno != 1062 -> doit retourner 500
    bad_err = IntegrityErr(999)
    cur = FakeCursor(fetchone_seq=[(0,), (0,)], integrity_err=bad_err)
    conn = FakeConn(cur)
    monkeypatch.setattr(routes_module, "get_db_connection", lambda: conn)

    monkeypatch.setattr(routes_module, "generate_qr_code", lambda out, appname, idx: (f"C{idx}", f"/p/{idx}.png"))

    fake_mysql = types.SimpleNamespace(connector=types.SimpleNamespace(IntegrityError=IntegrityErr))
    monkeypatch.setattr(routes_module, "mysql", fake_mysql, raising=True)

    with app.app_context():
        rv = client.post("/api/generate_qr", json={"count": 1, "application": "app"})
    assert rv.status_code == 500
