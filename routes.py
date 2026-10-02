from flask import render_template, request, jsonify
import yt_dlp


def artists_text(item):
    names = [a['name'] for a in item.get('artists') or [] if a.get('name')]
    return ", ".join(names) or 'Unknown Artist'


def last_thumb(item):
    thumbs = item.get('thumbnails') or item.get('thumbnail') or []
    return thumbs[-1]['url'] if thumbs else ''


def register_routes(app, ytmusic):

    @app.route('/')
    def index():
        return render_template('index.html')

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