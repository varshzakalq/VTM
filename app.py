import os
from datetime import timedelta
from flask import Flask
from ytmusicapi import YTMusic
from routes import register_routes
from auth_db import init_db


def create_app():
    app = Flask(__name__)
    app.secret_key = os.environ.get("SECRET_KEY", "vtm-music-app-secret-key")
    # Persistent session cookie for 60 days
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=60)
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    try:
        init_db()
    except Exception as e:
        print(f"[INIT DB ERROR] {e}", flush=True)

    ytmusic = YTMusic()
    register_routes(app, ytmusic)
    return app