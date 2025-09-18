import os
from dotenv import load_dotenv

# Charge le fichier .env (par défaut depuis la racine du projet)
load_dotenv("/opt/myapp/qr-react-kotlin-app/backend/.env")

class Config:
    # Clé secrète Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me")  # valeur par défaut si absent

    # Paramètres base de données
    DB_CONFIG = {
        "user":     os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "host":     os.getenv("DB_HOST", "127.0.0.1"),
        "database": os.getenv("DB_NAME"),
    }

    # Email (si tu veux les regrouper ici aussi)
    EMAIL_SENDER   = os.getenv("EMAIL_SENDER")
    EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
    SMTP_HOST      = os.getenv("SMTP_HOST", "smtp.ionos.com")
    SMTP_PORT      = int(os.getenv("SMTP_PORT", 587))
    SMTP_USE_SSL   = os.getenv("SMTP_USE_SSL", "False").lower() in ("true", "1")
    
