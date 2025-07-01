from flask import Flask
from flask_cors import CORS
from .config import Config
from .routes import bp

def create_app():
    app = Flask(__name__, static_url_path='/static')  # Gestion du dossier static
    app.config.from_object(Config)  # Chargement de la config
    CORS(app)  # Activation de CORS
    app.register_blueprint(bp)

    return app
