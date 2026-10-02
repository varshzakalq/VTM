from ytmusicapi import YTMusic

from flask import Flask
ytmusic = YTMusic()




def create_app():
    app = Flask(__name__ , template_folder='templates')
   


    from routes import register_routes
    register_routes(app,ytmusic)

    return app


