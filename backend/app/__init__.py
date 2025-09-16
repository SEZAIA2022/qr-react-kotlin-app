import os
from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS
from .config import Config

# Charger le fichier .env AVANT d'importer routes
load_dotenv("/opt/myapp/qr-react-kotlin-app/backend/.env")

from .routes import bp   # <-- cet import doit venir APRÈS load_dotenv()

def create_app():
    app = Flask(__name__, static_url_path='/static')  # Gestion du dossier static
    app.config.from_object(Config)                    # Chargement de la config
    CORS(app)                                         # Activation de CORS
    app.register_blueprint(bp)

    return app
