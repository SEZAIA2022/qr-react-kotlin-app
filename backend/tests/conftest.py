# tests/conftest.py
import os, sys, importlib, types
from pathlib import Path
import pytest
from flask import Flask

# --- Rendre importable "app.routes"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# --- Stub Firebase (éviter FileNotFoundError et appels réels)
# Crée un faux fichier d'identifiants
fake_creds_path = "/tmp/fake_firebase.json"
Path(fake_creds_path).write_text("{}")
os.environ.setdefault("FIREBASE_CREDENTIALS", fake_creds_path)

# Module firebase_admin factice
fb_mod = types.ModuleType("firebase_admin")
fb_mod.initialize_app = lambda cred: None

cred_mod = types.ModuleType("firebase_admin.credentials")
cred_mod.Certificate = lambda path: object()

# on capture le dernier message envoyé si besoin dans des tests
_last_multicast = {"message": None}
def _MulticastMessage(data=None, tokens=None, **kwargs):
    msg = types.SimpleNamespace(data=data or {}, tokens=tokens or [])
    _last_multicast["message"] = msg
    return msg

def _send_each_for_multicast(message):
    # Retourne un objet minimal compatible avec ce que ton code lit
    return types.SimpleNamespace(
        success_count=len(getattr(message, "tokens", []) or []),
        failure_count=0,
        responses=[]
    )

msg_mod = types.ModuleType("firebase_admin.messaging")
msg_mod.MulticastMessage = _MulticastMessage
msg_mod.send_each_for_multicast = _send_each_for_multicast

# Enregistre les stubs dans sys.modules
sys.modules.setdefault("firebase_admin", fb_mod)
sys.modules.setdefault("firebase_admin.credentials", cred_mod)
sys.modules.setdefault("firebase_admin.messaging", msg_mod)

# --- Import du module routes (après avoir injecté les stubs)
routes = importlib.import_module("app.routes")

@pytest.fixture()
def app():
    app = Flask(__name__)
    app.config.update(
        TESTING=True,
        # Clés mail requises par /register (pour éviter KeyError)
        EMAIL_SENDER="no-reply@test.local",
        EMAIL_PASSWORD="dummy",
        SMTP_HOST="localhost",
        SMTP_PORT=1025,
        SMTP_USE_SSL=False,
    )
    app.register_blueprint(routes.bp, url_prefix="/api")
    return app

@pytest.fixture()
def client(app):
    return app.test_client()
