import os
import sys
import json
import uuid
import struct
import socket
import threading
import time
import mimetypes
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


def find_cached_file(video_id, extensions):
    for ext in extensions:
        path = os.path.join(CACHE_DIR, f"{video_id}.{ext}")
        if os.path.exists(path):
            return path
    return None


class MinimalDiscordIPC:
    def __init__(self, client_id):
        self.client_id = client_id
        self.sock = None

    def connect(self):
        if sys.platform == 'win32':
            for i in range(10):
                pipe_path = f'\\\\.\\pipe\\discord-ipc-{i}'
                try:
                    self.sock = open(pipe_path, 'r+b', buffering=0)
                    break
                except (FileNotFoundError, OSError):
                    pass
        else:
            base_path = os.environ.get('XDG_RUNTIME_DIR', os.environ.get('TMPDIR', os.environ.get('TMP', os.environ.get('TEMP', '/tmp'))))
            for i in range(10):
                pipe_path = os.path.join(base_path, f'discord-ipc-{i}')
                if os.path.exists(pipe_path):
                    try:
                        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                        self.sock.connect(pipe_path)
                        self.sock.setblocking(True)
                        break
                    except Exception:
                        self.sock = None
        if not self.sock:
            raise Exception("Discord IPC not found. Make sure the Discord desktop app is running.")
        self.handshake()

    def _write(self, data):
        if sys.platform == 'win32':
            self.sock.write(data)
        else:
            self.sock.sendall(data)

    def _read(self, size):
        if sys.platform == 'win32':
            return self.sock.read(size)
        else:
            return self.sock.recv(size)

    def handshake(self):
        self.send(0, {'v': 1, 'client_id': self.client_id})
        self._read(8)

    def send(self, op, payload):
        payload_bytes = json.dumps(payload).encode('utf-8')
        header = struct.pack('<II', op, len(payload_bytes))
        self._write(header + payload_bytes)

    def set_activity(self, activity):
        payload = {
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": os.getpid(),
                "activity": activity
            },
            "nonce": str(uuid.uuid4())
        }
        self.send(1, payload)

    def close(self):
        if self.sock:
            try: self.sock.close()
            except: pass
            self.sock = None

discord_ipc = None

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
        if not entry:
            continue
        vid = entry.get('id')

        if not vid or any(item.get('id') == vid for item in library_data):
            continue

        print(f"Downloading media for: {entry.get('title')}...")

        video_path = find_cached_file(vid, ['mp4', 'webm', 'mkv'])
        audio_path = find_cached_file(vid, ['mp3', 'm4a', 'aac'])

        if not video_path:
            video_opts = {
                'format': 'bestvideo[ext=mp4]/best[ext=mp4]/bestvideo',
                'outtmpl': os.path.join(CACHE_DIR, f'{vid}.%(ext)s'),
                'quiet': True,
                'no_warnings': True,
                'noplaylist': True,
            }
            try:
                with yt_dlp.YoutubeDL(video_opts) as ydl_video:
                    video_meta = ydl_video.extract_info(vid, download=True)
                    if video_meta and video_meta.get('requested_formats'):
                        video_path = find_cached_file(vid, ['mp4', 'webm', 'mkv'])
            except Exception as e:
                print(f"Failed to download video {vid}: {e}")

        if not audio_path:
            audio_opts = {
                'format': 'bestaudio/best',
                'outtmpl': os.path.join(CACHE_DIR, f'{vid}.%(ext)s'),
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
                'quiet': True,
                'no_warnings': True,
                'noplaylist': True,
            }
            try:
                with yt_dlp.YoutubeDL(audio_opts) as ydl_audio:
                    audio_meta = ydl_audio.extract_info(vid, download=True)
                    audio_path = find_cached_file(vid, ['mp3', 'm4a', 'aac'])
                    if audio_meta:
                        thumbnail = audio_meta.get('thumbnail')
                        title = audio_meta.get('title')
                        uploader = audio_meta.get('uploader')
                        duration = audio_meta.get('duration')
                    else:
                        thumbnail = entry.get('thumbnail')
                        title = entry.get('title')
                        uploader = entry.get('uploader')
                        duration = entry.get('duration')
            except Exception as e:
                print(f"Failed to download audio {vid}: {e}")
                thumbnail = entry.get('thumbnail')
                title = entry.get('title')
                uploader = entry.get('uploader')
                duration = entry.get('duration')
        else:
            thumbnail = entry.get('thumbnail')
            title = entry.get('title')
            uploader = entry.get('uploader')
            duration = entry.get('duration')

        item_data = {
            'id': vid,
            'title': title,
            'artist': uploader,
            'thumbnail': thumbnail,
            'duration': duration,
        }
        library_data.append(item_data)
        with open(LIB_FILE, 'w') as f:
            json.dump(library_data, f, indent=4)

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

@app.route('/api/rpc', methods=['POST'])
def update_rpc():
    global discord_ipc
    data = request.json
    enabled = data.get('enabled', False)
    
    if not enabled:
        if discord_ipc:
            discord_ipc.close()
            discord_ipc = None
        return jsonify({"status": "cleared"})
        
    try:
        if not discord_ipc:
            client_id = os.getenv("DISCORD_CLIENT_ID", "1314349313437597758")
            if not client_id:
                client_id = "1314349313437597758"
                
            discord_ipc = MinimalDiscordIPC(client_id)
            discord_ipc.connect()
            
        activity = {}
        if data.get('show_title') and data.get('title'):
            activity['details'] = data['title'][:128]
        
        if data.get('show_artist') and data.get('artist'):
            state_str = data['artist']
            if data.get('paused'):
                state_str = f"⏸ {state_str}"
            activity['state'] = state_str[:128]
        elif data.get('paused'):
            activity['state'] = "⏸ Paused"
            
        if data.get('show_time') and not data.get('paused'):
            start_ts = int(time.time() - data.get('current_time', 0))
            activity['timestamps'] = {'start': start_ts}
            
        if data.get('show_art') and data.get('thumbnail'):
            activity['assets'] = {
                'large_image': data['thumbnail'],
                'large_text': data.get('title', 'Katt-Music')[:128]
            }
            
        activity['buttons'] = [
            {"label": "View on GitHub", "url": "https://github.com/katt-dev/Katt-Music"}
        ]
            
        discord_ipc.set_activity(activity)
        return jsonify({"status": "updated"})
    except Exception as e:
        print(f"RPC Error: {e}")
        if discord_ipc:
            discord_ipc.close()
            discord_ipc = None
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/video/<video_id>')
def get_video(video_id):
    path = find_cached_file(video_id, ['mp4', 'webm', 'mkv'])
    if path:
        mimetype, _ = mimetypes.guess_type(path)
        return send_file(path, mimetype=mimetype or 'video/mp4')
    return "Not found", 404


@app.route('/audio/<video_id>')
def get_audio(video_id):
    path = find_cached_file(video_id, ['mp3', 'm4a', 'aac'])
    if path:
        mimetype, _ = mimetypes.guess_type(path)
        return send_file(path, mimetype=mimetype or 'audio/mpeg')
    return "Not found", 404

if __name__ == '__main__':
    print(f"Server ready! Listening on http://localhost:{PORT}")
    
    env_url = os.getenv("YOUTUBE_PLAYLIST_URL")
    if env_url:
        threading.Thread(target=sync_playlist_task, args=(env_url,), daemon=True).start()
        
    app.run(host='0.0.0.0', port=PORT, debug=True, use_reloader=False)
