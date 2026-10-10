
import yt_dlp
from flask import render_template, request, jsonify, session, redirect, url_for
import yt_dlp
from auth_db import register_user, authenticate_user

import os
import psycopg2
from flask import Flask, request, jsonify, session, render_template, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from auth_db import register_user, authenticate_user, get_user_by_id

def artists_text(item):
    names = [a['name'] for a in item.get('artists') or [] if a.get('name')]
    return ", ".join(names) or 'Unknown Artist'


def last_thumb(item):
    thumbs = item.get('thumbnails') or item.get('thumbnail') or []
    return thumbs[-1]['url'] if thumbs else ''


# Connect using your Neon connection string
DATABASE_URL ="postgresql://neondb_owner:npg_cSE57DNiqPvz@ep-odd-sun-b4yfpz1q-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

# User Registration Endpoint

def register_routes(app, ytmusic):

    @app.route('/')
    def index():
        user_id = session.get('user_id')
        # Serves login page as base render if unauthenticated
        if not session.get('user_id'):
            return render_template('login.html')
        username = get_user_by_id(user_id) or session.get('username', '')
        return render_template('index.html', username=username)

    @app.route('/login')
    def login():
        if session.get('user_id'):
            return redirect(url_for('index'))
        return render_template('login.html')

    @app.route('/api/login', methods=['POST'])
    def api_login():
        data = request.get_json() or {}
        login_id = data.get('username', '').strip()  # can be username or email
        password = data.get('password', '')

        user_id, actual_username, error = authenticate_user(login_id, password)
        if error:
            return jsonify({'error': error}), 401

        session.permanent = True
        session['user_id'] = user_id
        session['username'] = actual_username
        return jsonify({'success': True, 'username': actual_username})

    @app.route('/api/register', methods=['POST'])
    def api_register():
        data = request.get_json() or {}
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')

        user_id, error = register_user(username, email, password)
        if error:
            return jsonify({'error': error}), 400

        session.permanent = True
        session['user_id'] = user_id
        session['username'] = username
        return jsonify({'success': True, 'username': username})
    @app.route('/logout')
    def logout():
        session.clear()
        return redirect(url_for('index'))

    @app.route('/api/search', methods=['GET'])
    def search():
        query = request.args.get('q', '').strip()
        if not query:
            return jsonify([])
        try:
            result = ytmusic.search(query, filter="songs")
            songs = []
            for item in result[:20]:
                if not item.get('videoId'):
                    continue
                songs.append({
                    'id': item['videoId'],
                    'title': item.get('title', 'Unknown Title'),
                    'artist': artists_text(item),
                    'thumbnail': last_thumb(item)
                })
            return jsonify(songs)
        except Exception as e:
            print(f"[SEARCH ERROR] {e}", flush=True)
            return jsonify({'error': str(e)}), 500

    @app.route('/api/stream/<video_id>', methods=['GET'])
    def get_stream(video_id):
        ydl_opts = {
            'format': 'bestaudio/best',
            'noplaylist': True,
            'quiet': True,
            'extractor_args': {
                'youtube': {
                    'player_client': ['mweb', 'android'],
                }
            }
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)

            stream_url = info.get('url', '')
            if not stream_url:
                return jsonify({'error': 'No audio stream found for this video'}), 400
            return jsonify({'stream_url': stream_url})

        except Exception as e:
            print(f"[STREAM ERROR] Failed to fetch stream for {video_id}: {e}", flush=True)
            return jsonify({'error': f"Failed to extract stream: {e}"}), 500

    @app.route('/api/related/<video_id>', methods=['GET'])
    def get_related_tracks(video_id):
        print(f"[RELATED ROUTE HIT] {video_id}", flush=True)
        try:
            watch_playlist = ytmusic.get_watch_playlist(videoId=video_id, limit=10)

            tracks = []
            for track in watch_playlist.get('tracks', []):
                vid = track.get('videoId')
                if not vid or vid == video_id:
                    continue
                tracks.append({
                    'id': vid,
                    'title': track.get('title', 'Unknown Title'),
                    'artist': artists_text(track),
                    'thumbnail': last_thumb(track)
                })

            print(f"[RELATED SUCCESS] {len(tracks)} songs", flush=True)
            return jsonify({'tracks': tracks})
        except Exception as e:
            print(f"[RELATED ERROR] {e}", flush=True)
            return jsonify({'error': str(e)}), 500
