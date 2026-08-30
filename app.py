import os
import sys
import json
import uuid
import struct
import socket
import threading
import time
import re
import glob
import requests
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
        if not entry: continue
        vid = entry.get('id')

        if any(item.get('id') == vid for item in library_data):
            continue

        print(f"Downloading audio: {entry.get('title')}...")
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

        audio_ok = False
        dl_info = None
        try:
            with yt_dlp.YoutubeDL(dl_opts) as ydl_dl:
                dl_info = ydl_dl.extract_info(vid, download=True)
            audio_ok = True
        except Exception as e:
            print(f"Failed to download audio for {vid}: {e}")
            continue

        # Also grab a (muted, low-weight) video file so the inline
        # video-wrapper / animated background has something real to play.
        # This is independent of the audio download above and best-effort:
        # if it fails, the song still stays in the library, just without video.
        has_video = False
        video_dl_opts = {
            'format': 'bestvideo[ext=mp4][height<=720]/best[ext=mp4]/best',
            'outtmpl': os.path.join(CACHE_DIR, f'{vid}_video.%(ext)s'),
            'merge_output_format': 'mp4',
            'quiet': True,
            'no_warnings': True
        }
        try:
            with yt_dlp.YoutubeDL(video_dl_opts) as ydl_vid:
                ydl_vid.extract_info(vid, download=True)
            video_path = os.path.join(CACHE_DIR, f'{vid}_video.mp4')
            has_video = os.path.exists(video_path)
        except Exception as e:
            print(f"Video download skipped for {vid}: {e}")

        item_data = {
            'id': vid,
            'title': dl_info.get('title'),
            'artist': dl_info.get('uploader'),
            'thumbnail': dl_info.get('thumbnail'),
            'duration': dl_info.get('duration'),
            'has_video': has_video
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
            {"label": "View on GitHub", "url": "https://github.com/your-username/your-repo"}
        ]

        discord_ipc.set_activity(activity)
        return jsonify({"status": "updated"})
    except Exception as e:
        print(f"RPC Error: {e}")
        if discord_ipc:
            discord_ipc.close()
            discord_ipc = None
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/audio/<video_id>')
def get_audio(video_id):
    path = os.path.join(CACHE_DIR, f"{video_id}.mp3")
    if os.path.exists(path):
        return send_file(path, mimetype="audio/mpeg")
    return "Not found", 404


@app.route('/video/<video_id>')
def get_video(video_id):
    path = os.path.join(CACHE_DIR, f"{video_id}_video.mp4")
    if os.path.exists(path):
        return send_file(path, mimetype="video/mp4")
    return "Not found", 404
CHANGELOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "changelog.txt")
CHANGELOG_RAW_URL = os.getenv(
    "CHANGELOG_URL",
    "https://raw.githubusercontent.com/katt-dev/Katt-Music/main/changelog.txt"
)
_changelog_cache = {"content": None, "fetched_at": 0}
CHANGELOG_CACHE_TTL = 300  # seconds

@app.route('/api/changelog')
def get_changelog():
    now = time.time()
    if _changelog_cache["content"] is not None and (now - _changelog_cache["fetched_at"]) < CHANGELOG_CACHE_TTL:
        return jsonify({"content": _changelog_cache["content"]})

    try:
        resp = requests.get(CHANGELOG_RAW_URL, timeout=5)
        resp.raise_for_status()
        content = resp.text
        _changelog_cache["content"] = content
        _changelog_cache["fetched_at"] = now
        return jsonify({"content": content})
    except Exception as e:
        print(f"Changelog fetch from GitHub failed: {e}")

    if os.path.exists(CHANGELOG_FILE):
        try:
            with open(CHANGELOG_FILE, 'r', encoding='utf-8') as f:
                return jsonify({"content": f.read()})
        except Exception as e:
            print(f"Changelog local read failed: {e}")

    if _changelog_cache["content"] is not None:
        return jsonify({"content": _changelog_cache["content"]})
    return jsonify({"content": "Changelog is currently unavailable."}), 200
VIDEO_MODE_CACHE_DIR = "video_mode_cache"
os.makedirs(VIDEO_MODE_CACHE_DIR, exist_ok=True)
VIDEO_MODE_STATE_FILE = os.path.join(VIDEO_MODE_CACHE_DIR, "current.json")
VIDEO_MODE_QUEUE_FILE = os.path.join(VIDEO_MODE_CACHE_DIR, "queue.json")

video_mode_state = {}
video_mode_queue = []
video_mode_status = {"state": "idle", "error": None}
video_mode_lock = threading.Lock()
video_mode_worker_running = False

if os.path.exists(VIDEO_MODE_STATE_FILE):
    try:
        with open(VIDEO_MODE_STATE_FILE, 'r') as f:
            _saved_state = json.load(f)
        _saved_path = os.path.join(VIDEO_MODE_CACHE_DIR, _saved_state.get('filename', ''))
        if _saved_state and os.path.exists(_saved_path):
            video_mode_state = _saved_state
    except Exception:
        video_mode_state = {}

if os.path.exists(VIDEO_MODE_QUEUE_FILE):
    try:
        with open(VIDEO_MODE_QUEUE_FILE, 'r') as f:
            video_mode_queue = json.load(f)
        video_mode_queue = [item for item in video_mode_queue if isinstance(item, dict)]
        for item in video_mode_queue:
            if item.get('status') == 'downloading':
                item['status'] = 'queued'
    except Exception:
        video_mode_queue = []

YOUTUBE_URL_RE = re.compile(
    r'^https?://(www\.)?(youtube\.com/(watch\?v=|shorts/)|youtu\.be/|m\.youtube\.com/watch\?v=)[\w-]+',
    re.IGNORECASE
)

VIDEO_ID_RE = re.compile(r'^[\w-]+$')


def is_valid_youtube_url(url):
    if not url or not isinstance(url, str) or len(url) > 500:
        return False
    return bool(YOUTUBE_URL_RE.match(url.strip()))


def save_video_mode_state():
    with open(VIDEO_MODE_STATE_FILE, 'w') as f:
        json.dump(video_mode_state, f, indent=4)


def save_video_mode_queue():
    with open(VIDEO_MODE_QUEUE_FILE, 'w') as f:
        json.dump(video_mode_queue, f, indent=4)


def remove_video_file(item):
    filename = item.get('filename') if item else None
    if filename:
        try:
            os.remove(os.path.join(VIDEO_MODE_CACHE_DIR, filename))
        except FileNotFoundError:
            pass
        except Exception as e:
            print(f"Video Mode cleanup: failed to remove {filename}: {e}")


def download_video_mode_queue():
    """Download queued videos one at a time without interrupting the current video."""
    global video_mode_state, video_mode_status, video_mode_worker_running
    ydl_opts = {
        'format': 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': os.path.join(VIDEO_MODE_CACHE_DIR, '%(id)s.%(ext)s'),
        'merge_output_format': 'mp4',
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        # No cookies / browser session data are read or required.
    }

    while True:
        with video_mode_lock:
            pending = next((item for item in video_mode_queue if item.get('status') == 'queued'), None)
            if not pending:
                video_mode_worker_running = False
                if video_mode_state:
                    video_mode_status = {"state": "ready", "error": None}
                else:
                    video_mode_status = {"state": "idle", "error": None}
                save_video_mode_queue()
                return
            pending['status'] = 'downloading'
            video_mode_status = {"state": "downloading", "error": None}
            save_video_mode_queue()

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(pending['url'], download=True)

            vid_id = info.get('id')
            if not vid_id or not VIDEO_ID_RE.match(vid_id):
                raise Exception("Unexpected video id from downloader.")

            final_path = os.path.join(VIDEO_MODE_CACHE_DIR, f"{vid_id}.mp4")
            if not os.path.exists(final_path):
                candidates = glob.glob(os.path.join(VIDEO_MODE_CACHE_DIR, f"{vid_id}.*"))
                if candidates:
                    final_path = candidates[0]
                else:
                    raise Exception("Download completed but no output file was found.")

            with video_mode_lock:
                pending.update({
                    'id': vid_id,
                    'title': info.get('title') or 'Untitled video',
                    'uploader': info.get('uploader') or '',
                    'thumbnail': info.get('thumbnail') or '',
                    'duration': info.get('duration') or 0,
                    'filename': os.path.basename(final_path),
                    'status': 'ready',
                    'error': None
                })
                if not video_mode_state:
                    video_mode_state = dict(pending)
                    save_video_mode_state()
                video_mode_status = {"state": "ready", "error": None}
                save_video_mode_queue()
            print(f"Video Mode: downloaded '{pending['title']}'")
        except Exception as e:
            print(f"Video Mode download failed: {e}")
            with video_mode_lock:
                pending['status'] = 'error'
                pending['error'] = "Couldn't download this video. It may be unavailable or private."
                video_mode_status = {"state": "error", "error": pending['error']}
                save_video_mode_queue()


@app.route('/api/videomode/import', methods=['POST'])
def videomode_import():
    global video_mode_worker_running
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip()

    if not is_valid_youtube_url(url):
        return jsonify({"error": "Please paste a valid YouTube video URL."}), 400

    with video_mode_lock:
        video_mode_queue.append({
            'url': url,
            'title': 'Waiting for metadata...',
            'uploader': '',
            'thumbnail': '',
            'status': 'queued',
            'error': None
        })
        save_video_mode_queue()
        if not video_mode_worker_running:
            video_mode_worker_running = True
            threading.Thread(target=download_video_mode_queue, daemon=True).start()
    return jsonify({"message": "Video added to queue."})


@app.route('/api/videomode/status')
def videomode_status():
    with video_mode_lock:
        return jsonify({
            "status": video_mode_status.get("state", "idle"),
            "error": video_mode_status.get("error"),
            "video": video_mode_state if video_mode_state else None,
            "queue": video_mode_queue
        })


@app.route('/api/videomode/stop', methods=['POST'])
def videomode_stop():
    """Stops the current video, then promotes the next downloaded item."""
    global video_mode_state, video_mode_status
    with video_mode_lock:
        if video_mode_state:
            current_id = video_mode_state.get('id')
            current = next((item for item in video_mode_queue if item.get('id') == current_id), None)
            if current:
                video_mode_queue.remove(current)
            remove_video_file(video_mode_state)
        video_mode_state = {}
        next_video = next((item for item in video_mode_queue if item.get('status') == 'ready'), None)
        if next_video:
            video_mode_state = dict(next_video)
            save_video_mode_state()
            video_mode_status = {"state": "ready", "error": None}
        else:
            if os.path.exists(VIDEO_MODE_STATE_FILE):
                os.remove(VIDEO_MODE_STATE_FILE)
            video_mode_status = {"state": "idle", "error": None}
        save_video_mode_queue()
    return jsonify({"status": "cleared"})


@app.route('/videomode/file/<video_id>')
def videomode_file(video_id):
    if not VIDEO_ID_RE.match(video_id):
        return "Invalid id", 400

    with video_mode_lock:
        if not video_mode_state or video_mode_state.get('id') != video_id:
            return "Not found", 404
        filename = video_mode_state.get('filename')

    path = os.path.join(VIDEO_MODE_CACHE_DIR, filename)
    if filename and os.path.exists(path):
        return send_file(path, mimetype="video/mp4")
    return "Not found", 404


if __name__ == '__main__':
    print(f"Server ready! Listening on http://localhost:{PORT}")

    if any(item.get('status') == 'queued' for item in video_mode_queue):
        video_mode_worker_running = True
        threading.Thread(target=download_video_mode_queue, daemon=True).start()

    env_url = os.getenv("YOUTUBE_PLAYLIST_URL")
    if env_url and "YOUR_PLAYLIST_HERE" not in env_url:
        threading.Thread(target=sync_playlist_task, args=(env_url,), daemon=True).start()

    app.run(host='0.0.0.0', port=PORT, debug=True, use_reloader=False)
