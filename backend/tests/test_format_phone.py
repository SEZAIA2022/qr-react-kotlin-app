import importlib
import pytest


@pytest.fixture()
def routes_module():
    return importlib.import_module("app.routes")


def test_format_phone_missing(client):
    rv = client.post("/api/format_phone", json={"number": "0612345678"})
    assert rv.status_code == 400


def test_format_phone_invalid(monkeypatch, client, routes_module):
    monkeypatch.setattr(routes_module, "format_number_simple", lambda n, c: "Invalid phone number")
    rv = client.post("/api/format_phone", json={"number": "0612", "country_code": "+33"})
    assert rv.status_code == 400


def test_format_phone_ok(monkeypatch, client, routes_module):
    monkeypatch.setattr(routes_module, "format_number_simple", lambda n, c: "+33612345678")
    rv = client.post("/api/format_phone", json={"number": "0612345678", "country_code": "+33"})
    assert rv.status_code == 200
    assert rv.get_json()["formatted_number"] == "+33612345678"
