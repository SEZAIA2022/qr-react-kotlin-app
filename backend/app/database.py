from flask import current_app
import mysql.connector

def get_db_connection():
    config = current_app.config.get('DB_CONFIG')
    return mysql.connector.connect(**config)