import os
import json
import threading
from flask import Flask, render_template, jsonify, send_file, request
from dotenv import load_dotenv
import yt_dlp

load_dotenv()

app = Flask(__name__)
PORT = int(os.getenv("PORT", 8000))
CACHE_DIR = "music_cache"
os.makedirs(CACHE_DIR, exist_ok=True)
LIB_FILE = os.path.join(CACHE_DIR, "library.json")

library_data = []
is_syncing = False

if os.path.exists(LIB_FILE):
    with open(LIB_FILE, 'r') as f:
        try:
            library_data = json.load(f)
        except:
            library_data = []

def download_video(video_id):
    video_path = os.path.join(CACHE_DIR, f'{video_id}.mp4')
    if os.path.exists(video_path):
        return

    video_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
        'outtmpl': video_path,
        'merge_output_format': 'mp4',
        'quiet': True,
        'no_warnings': True
    }
    with yt_dlp.YoutubeDL(video_opts) as ydl_video:
        ydl_video.download([video_id])

def sync_playlist_task(playlist_url):
    global library_data, is_syncing
    is_syncing = True
    print(f"Fetching playlist metadata from: {playlist_url}")
    
    ydl_opts_flat = {'extract_flat': True, 'quiet': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts_flat) as ydl:
            info = ydl.extract_info(playlist_url, download=False)
            entries = info.get('entries', [])
    except Exception as e:
        print(f"Error fetching playlist: {e}")
        is_syncing = False
        return

    print(f"Found {len(entries)} tracks. Starting background download...")
    
    for entry in entries:
        if not entry: continue
        vid = entry.get('id')
        
        if any(item.get('id') == vid for item in library_data):
            try:
                download_video(vid)
            except Exception as e:
                print(f"Failed to download video {vid}: {e}")
            continue

        print(f"Downloading: {entry.get('title')}...")
        dl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(CACHE_DIR, f'{vid}.%(ext)s'),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'quiet': True,
            'no_warnings': True
        }
        try:
            with yt_dlp.YoutubeDL(dl_opts) as ydl_dl:
                dl_info = ydl_dl.extract_info(vid, download=True)
                item_data = {
                    'id': vid,
                    'title': dl_info.get('title'),
                    'artist': dl_info.get('uploader'),
                    'thumbnail': dl_info.get('thumbnail'),
                    'duration': dl_info.get('duration')
                }
                
                library_data.append(item_data)
                with open(LIB_FILE, 'w') as f:
                    json.dump(library_data, f, indent=4)

            download_video(vid)
                    
        except Exception as e:
            print(f"Failed to download {vid}: {e}")

    is_syncing = False
    print("Playlist sync complete!")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/library')
def get_library():
    if os.path.exists(LIB_FILE):
        with open(LIB_FILE, 'r') as f:
            try: return jsonify(json.load(f))
            except: pass
    return jsonify(library_data)

@app.route('/api/import', methods=['POST'])
def import_playlist():
    global is_syncing
    url = request.json.get('url')
    if not url: return jsonify({"error": "No URL provided"}), 400
    
    if not is_syncing:
        threading.Thread(target=sync_playlist_task, args=(url,), daemon=True).start()
        return jsonify({"message": "Import started in background."})
    return jsonify({"message": "Already syncing."})

@app.route('/audio/<video_id>')
def get_audio(video_id):
    path = os.path.join(CACHE_DIR, f"{video_id}.mp3")
    if os.path.exists(path):
        return send_file(path, mimetype="audio/mpeg")
    return "Not found", 404

@app.route('/video/<video_id>')
def get_video(video_id):
    path = os.path.join(CACHE_DIR, f"{video_id}.mp4")
    if os.path.exists(path):
        return send_file(path, mimetype="video/mp4")
    return "Not found", 404

if __name__ == '__main__':
    print("Server ready! Listening on http://localhost:8000")
    
    env_url = os.getenv("YOUTUBE_PLAYLIST_URL")
    if env_url:
        threading.Thread(target=sync_playlist_task, args=(env_url,), daemon=True).start()
        
    app.run(host='0.0.0.0', port=PORT, debug=True, use_reloader=False)
