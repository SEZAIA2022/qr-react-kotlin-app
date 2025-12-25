import os
from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS
from .config import Config

# ✅ Charger le .env AVANT tout
load_dotenv("/opt/myapp/qr-react-kotlin-app/backend/.env")

def create_app():
    app = Flask(__name__)

    # ✅ Charger la config de base
    app.config.from_object(Config)

    app.config["UPLOAD_FOLDER_HELP_VIDEOS"] = os.environ.get(
        "UPLOAD_FOLDER_HELP_VIDEOS",
        os.path.join(app.root_path, "static", "help_videos")  # => backend/app/static/help_videos
    )

    app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024 

    # ✅ CORS
    CORS(app)

    # ✅ Import blueprint APRÈS création app
    from .routes import bp
    app.register_blueprint(bp)

    return app
