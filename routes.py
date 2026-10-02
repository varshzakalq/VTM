from flask import render_template , request,session,jsonify
import yt_dlp

def register_routes(app,ytmusic):
    @app.route('/')
    def index():
        return render_template('index.html')
    @app.route('/api/search',methods=["GET"])
    def search():
        query = request.args.get('q','')
        if not query:
            return jsonify([])
        result = ytmusic.search(query,filter="songs")
        songs = []
        for item in result[:20]:
            artists = item.get('artists', [])
            artist_name = artists[0]['name'] if artists else 'Unknown Artist'

            thumbnails = item.get('thumbnails', [])
            thumbnail_url = thumbnails[-1]['url'] if thumbnails else ''
            songs.append({
                'id':item['videoId'],
                'title':item['title'],
                'artist':artist_name,
                'thumbnail':thumbnail_url
            })
        return jsonify(songs)
  
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
            print(f"\n[STREAM ERROR] Failed to fetch stream for {video_id}: {e}\n")
            return jsonify({'error': f"Failed to extract stream: {str(e)}"}), 500