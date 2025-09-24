import importlib
import types
import pytest


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_send_email_missing_params(client):
    rv = client.post("/api/send_email", json={"to_email": "a@b.c"})  # pas de message
    assert rv.status_code == 400
    assert "Missing 'to_email' or 'message'" in rv.get_json()["error"]


def test_send_email_ok(monkeypatch, client, routes_module):
    sent = {}

    class FakeSMTP:
        def __init__(self, host, port):
            pass
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def starttls(self): pass
        def login(self, user, pwd): pass
        def sendmail(self, sender, to, body):
            sent["to"] = to
            sent["body"] = body

    fake_smtplib = types.SimpleNamespace(SMTP=FakeSMTP, SMTPException=Exception)
    monkeypatch.setattr(routes_module, "smtplib", fake_smtplib, raising=True)

    rv = client.post("/api/send_email", json={"to_email": "x@y.z", "message": "1234"})
    assert rv.status_code == 200
    assert sent["to"] == "x@y.z"
    assert "1234" in sent["body"]


def test_send_email_smtp_error(monkeypatch, client, routes_module):
    class FakeSMTP:
        def __init__(self, host, port): pass
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def starttls(self): pass
        def login(self, u, p): pass
        def sendmail(self, s, t, b): raise Exception("smtp fail")

    fake_smtplib = types.SimpleNamespace(SMTP=FakeSMTP, SMTPException=Exception)
    monkeypatch.setattr(routes_module, "smtplib", fake_smtplib, raising=True)

    rv = client.post("/api/send_email", json={"to_email": "x@y.z", "message": "1234"})
    assert rv.status_code == 500
