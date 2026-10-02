from flask import Flask
from ytmusicapi import YTMusic
from routes import register_routes


def create_app():
    app = Flask(__name__)       
    ytmusic = YTMusic()
    register_routes(app, ytmusic)
    return app