let library = [];
let currentIndex = 0;
let audio = new Audio();
const audioModeKey = 'katt_background_mode';

const videoPlayer = document.getElementById('video-player');
const backgroundVideoLayer = document.getElementById('background-video-layer');
const videoWrapper = document.querySelector('.video-wrapper');
const elBg = document.getElementById('app-background');
const elBgAlt = document.getElementById('app-background-alt');
let activeBg = elBg;

function syncVideoPlayer(force = false) {
    if (!videoPlayer || !videoPlayer.src || Number.isNaN(audio.currentTime)) return;
    const diff = Math.abs(videoPlayer.currentTime - audio.currentTime);
    if (videoPlayer.readyState >= 2 && !videoPlayer.seeking && (force || diff > 0.75)) {
        videoPlayer.currentTime = audio.currentTime;
    }

    if (audio.paused) {
        videoPlayer.pause();
    } else {
        videoPlayer.play().catch(() => {});
    }
}

function moveVideoToBackground() {
    if (!backgroundVideoLayer || !videoWrapper || !videoPlayer) return;
    if (videoPlayer.parentElement === backgroundVideoLayer) return;
    backgroundVideoLayer.appendChild(videoPlayer);
}

function moveVideoToInline() {
    if (!backgroundVideoLayer || !videoWrapper || !videoPlayer) return;
    if (videoPlayer.parentElement === videoWrapper) return;
    videoWrapper.appendChild(videoPlayer);
}

function getBackgroundMode() {
    return document.body.classList.contains('animated-mode') ? 'animated' : 'static';
}

function setBackgroundMode(mode) {
    const safeMode = mode === 'animated' ? 'animated' : 'static';
    document.body.classList.toggle('animated-mode', safeMode === 'animated');
    document.body.classList.toggle('static-mode', safeMode === 'static');
    localStorage.setItem(audioModeKey, safeMode);

    document.querySelectorAll('.mode-option').forEach((button) => {
        const isSelected = button.dataset.mode === safeMode;
        button.classList.toggle('active', isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
    });

    if (safeMode === 'animated') {
        elBg.classList.remove('active');
        elBgAlt.classList.remove('active');
        moveVideoToBackground();
        videoPlayer.muted = true;
        videoPlayer.defaultMuted = true;
        document.body.classList.add('animated-mode');
        if (audio.src && !audio.paused) {
            syncVideoPlayer(true);
            videoPlayer.play().catch(() => {});
        }
    } else {
        document.body.classList.remove('animated-mode');
        moveVideoToInline();
        videoPlayer.muted = true;
        videoPlayer.defaultMuted = true;
        syncVideoPlayer(true);
        if (library.length > 0 && library[currentIndex]?.thumbnail) {
            setStaticBackground(library[currentIndex].thumbnail);
        }
    }
}

function setStaticBackground(imageUrl) {
    if (!imageUrl || getBackgroundMode() !== 'static') return;
    const nextBg = activeBg === elBg ? elBgAlt : elBg;
    nextBg.style.backgroundImage = `url('${imageUrl}')`;
    nextBg.classList.add('active');
    activeBg.classList.remove('active');
    activeBg = nextBg;
}

let isShuffle = false;
let repeatMode = 0;
let shuffleHistory = [];

const elTitle = document.getElementById('title');
const elArtist = document.getElementById('artist');
const elArtwork = document.getElementById('artwork');
const elTimeCur = document.getElementById('time-current');
const elTimeTot = document.getElementById('time-total');
const elProgressFill = document.getElementById('progress-fill');
const elProgressBox = document.getElementById('progress-container');
const elQueue = document.getElementById('queue-list');
const elVideoFallback = document.getElementById('video-fallback');

const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');

const btnRepeat = document.getElementById('btn-repeat');
const iconRepeat = document.getElementById('icon-repeat');
const iconRepeatOne = document.getElementById('icon-repeat-one');
const btnShuffle = document.getElementById('btn-shuffle');

const modal = document.getElementById('import-modal');
const inputUrl = document.getElementById('import-url');
const btnImportOpen = document.getElementById('btn-import-open');
const btnImportCancel = document.getElementById('btn-import-cancel');
const btnImportSubmit = document.getElementById('btn-import-submit');

const rpcModal = document.getElementById('rpc-modal');
const btnRpcOpen = document.getElementById('btn-rpc-open');
const btnRpcClose = document.getElementById('btn-rpc-close');

const rpcEnable = document.getElementById('rpc-enable');
const rpcShowTitle = document.getElementById('rpc-show-title');
const rpcShowArtist = document.getElementById('rpc-show-artist');
const rpcShowTime = document.getElementById('rpc-show-time');
const rpcShowArt = document.getElementById('rpc-show-art');

let rpcSettings = JSON.parse(localStorage.getItem('katt_rpc_settings')) || {
    enabled: false,
    showTitle: true,
    showArtist: true,
    showTime: true,
    showArt: true
};

function initRPCUI() {
    rpcEnable.checked = rpcSettings.enabled;
    rpcShowTitle.checked = rpcSettings.showTitle;
    rpcShowArtist.checked = rpcSettings.showArtist;
    rpcShowTime.checked = rpcSettings.showTime;
    rpcShowArt.checked = rpcSettings.showArt;
}

function saveRPCSettings() {
    rpcSettings = {
        enabled: rpcEnable.checked,
        showTitle: rpcShowTitle.checked,
        showArtist: rpcShowArtist.checked,
        showTime: rpcShowTime.checked,
        showArt: rpcShowArt.checked
    };
    localStorage.setItem('katt_rpc_settings', JSON.stringify(rpcSettings));
    updateRPC();
}

[rpcEnable, rpcShowTitle, rpcShowArtist, rpcShowTime, rpcShowArt].forEach(el => {
    if (el) el.addEventListener('change', saveRPCSettings);
});

let rpcDebounceTimer = null;
function updateRPC() {
    if (library.length === 0) return;
    
    clearTimeout(rpcDebounceTimer);
    rpcDebounceTimer = setTimeout(async () => {
        const currentSong = library[currentIndex];
        const payload = {
            enabled: rpcSettings.enabled,
            show_title: rpcSettings.showTitle,
            show_artist: rpcSettings.showArtist,
            show_time: rpcSettings.showTime,
            show_art: rpcSettings.showArt,
            title: currentSong ? currentSong.title : '',
            artist: currentSong ? currentSong.artist : '',
            thumbnail: currentSong ? currentSong.thumbnail : '',
            paused: audio.paused,
            current_time: audio.currentTime
        };

        try {
            await fetch('/api/rpc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            console.error("RPC Update failed", e);
        }
    }, 500);
}

function recoverVideoPlayback() {
    if (!videoPlayer || !videoPlayer.src) return;

    const targetTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    if (Math.abs(videoPlayer.currentTime - targetTime) > 0.25) {
        videoPlayer.currentTime = targetTime;
    }

    if (!audio.paused && document.visibilityState !== 'hidden') {
        videoPlayer.play().catch(() => {});
    } else {
        videoPlayer.pause();
    }
}

async function init() {
    try {
        const savedMode = localStorage.getItem(audioModeKey);
        if (savedMode) {
            setBackgroundMode(savedMode);
        } else {
            setBackgroundMode('static');
        }

        initRPCUI();

        const res = await fetch('/api/library');
        library = await res.json();

        if (library.length > 0) {
            const savedId = localStorage.getItem('katt_id');
            const savedTime = localStorage.getItem('katt_time');

            let startIdx = library.findIndex(s => s.id === savedId);
            if (startIdx !== -1) currentIndex = startIdx;

            loadSong(currentIndex, false);
            if (savedTime) audio.currentTime = parseFloat(savedTime);
            renderQueue();
        } else {
            elTitle.innerText = 'No music found';
            elArtist.innerText = "Click 'Import Playlist' to begin";
        }
    } catch (e) {
        console.error('Failed to load library:', e);
    }
}

function loadSong(index, autoPlay = true) {
    if (library.length === 0) return;

    const song = library[index];
    elVideoFallback.href = `https://www.youtube.com/watch?v=${encodeURIComponent(song.id)}`;
    elVideoFallback.hidden = true;
    videoPlayer.src = `/video/${encodeURIComponent(song.id)}`;
    videoPlayer.load();
    audio.src = `/audio/${song.id}`;

    elTitle.innerText = song.title;
    elArtist.innerText = song.artist;

    if (song.thumbnail) {
        elArtwork.src = song.thumbnail;
        if (getBackgroundMode() === 'static') {
            setStaticBackground(song.thumbnail);
        }
    }

    localStorage.setItem('katt_id', song.id);

    if (autoPlay) audio.play();

    renderQueue();
    updateRPC();
}

function togglePlay() {
    if (library.length === 0) return;
    if (audio.paused) {
        audio.play();
    } else {
        audio.pause();
    }
}

function nextSong(isAuto = false) {
    if (library.length === 0) return;

    shuffleHistory.push(currentIndex);

    if (isShuffle) {
        let nextIdx = Math.floor(Math.random() * library.length);
        if (library.length > 1 && nextIdx === currentIndex) {
            nextIdx = (nextIdx + 1) % library.length;
        }
        currentIndex = nextIdx;
    } else {
        if (isAuto === true && repeatMode === 0 && currentIndex === library.length - 1) {
            return;
        }
        currentIndex = (currentIndex + 1) % library.length;
    }
    loadSong(currentIndex);
}

function prevSong() {
    if (library.length === 0) return;
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        if (typeof ytPlayer !== 'undefined' && ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(0);
        updateRPC();
    } else {
        if (isShuffle && shuffleHistory.length > 0) {
            currentIndex = shuffleHistory.pop();
        } else {
            currentIndex = (currentIndex - 1 + library.length) % library.length;
        }
        loadSong(currentIndex);
    }
}

audio.addEventListener('play', () => {
    iconPlay.style.display = 'none';
    iconPause.style.display = 'block';
    syncVideoPlayer(true);
    updateRPC();
});

audio.addEventListener('pause', () => {
    iconPlay.style.display = 'block';
    iconPause.style.display = 'none';
    syncVideoPlayer(true);
    updateRPC();
});

audio.addEventListener('seeked', () => {
    updateRPC();
});

audio.addEventListener('timeupdate', () => {
    const cur = audio.currentTime;
    const tot = audio.duration || 0;

    elTimeCur.innerText = formatTime(cur);
    elTimeTot.innerText = formatTime(tot);
    elProgressFill.style.width = tot ? `${(cur / tot) * 100}%` : '0%';
    syncVideoPlayer();

    if (Math.floor(cur) % 5 === 0) {
        localStorage.setItem('katt_time', cur);
    }
});

audio.addEventListener('ended', () => {
    if (repeatMode === 2) {
        audio.currentTime = 0;
        audio.play();
        syncVideoPlayer(true);
    } else {
        nextSong(true);
    }
});

elProgressBox.addEventListener('click', (e) => {
    if (library.length === 0) return;
    const width = elProgressBox.clientWidth;
    const clickX = e.offsetX;
    const ratio = clickX / width;
    audio.currentTime = ratio * audio.duration;
    syncVideoPlayer(true);
});

btnShuffle.addEventListener('click', () => {
    isShuffle = !isShuffle;
    btnShuffle.classList.toggle('active-control', isShuffle);
});

btnRepeat.addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % 3;

    if (repeatMode === 0) {
        btnRepeat.classList.remove('active-control');
        iconRepeat.style.display = 'block';
        iconRepeatOne.style.display = 'none';
    } else if (repeatMode === 1) {
        btnRepeat.classList.add('active-control');
        iconRepeat.style.display = 'block';
        iconRepeatOne.style.display = 'none';
    } else if (repeatMode === 2) {
        btnRepeat.classList.add('active-control');
        iconRepeat.style.display = 'none';
        iconRepeatOne.style.display = 'block';
    }
});

document.getElementById('btn-play').addEventListener('click', togglePlay);
document.getElementById('btn-next').addEventListener('click', nextSong);
document.getElementById('btn-prev').addEventListener('click', prevSong);
document.getElementById('btn-mute').addEventListener('click', () => {
    audio.muted = !audio.muted;
    document.getElementById('btn-mute').style.opacity = audio.muted ? '0.5' : '1';
});
document.getElementById('vol-slider').addEventListener('input', (e) => {
    audio.volume = e.target.value;
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        togglePlay();
    }
    if (e.code === 'ArrowRight') nextSong();
    if (e.code === 'ArrowLeft') prevSong();
});

function renderQueue() {
    elQueue.innerHTML = '';
    library.forEach((song, i) => {
        const div = document.createElement('div');
        div.className = `queue-item ${i === currentIndex ? 'active' : ''}`;
        div.innerHTML = `
            <img src="${song.thumbnail}" alt="Thumb">
            <div class="q-info">
                <div class="q-title">${song.title}</div>
                <div class="q-artist">${song.artist}</div>
            </div>
        `;
        div.onclick = () => {
            currentIndex = i;
            loadSong(currentIndex);
        };
        elQueue.appendChild(div);

        if (i === currentIndex) {
            div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

videoPlayer.addEventListener('loadeddata', () => {
    elVideoFallback.hidden = true;
    syncVideoPlayer(true);
});
videoPlayer.addEventListener('error', () => {
    elVideoFallback.hidden = false;
});

videoPlayer.addEventListener('waiting', () => {
    if (!audio.paused) {
        recoverVideoPlayback();
    }
});

const modeButtons = document.querySelectorAll('.mode-option');
modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
        setBackgroundMode(button.dataset.mode);
    });
});

function handlePageRecovery() {
    if (document.visibilityState === 'visible') {
        recoverVideoPlayback();
    }
}

document.addEventListener('visibilitychange', handlePageRecovery);
window.addEventListener('pageshow', handlePageRecovery);
window.addEventListener('resize', handlePageRecovery);
document.addEventListener('fullscreenchange', handlePageRecovery);
window.addEventListener('focus', handlePageRecovery);

if (btnImportOpen) btnImportOpen.onclick = () => modal.style.display = 'flex';
if (btnImportCancel) btnImportCancel.onclick = () => modal.style.display = 'none';

if (btnRpcOpen) btnRpcOpen.onclick = () => rpcModal.style.display = 'flex';
if (btnRpcClose) btnRpcClose.onclick = () => rpcModal.style.display = 'none';

if (btnImportSubmit) {
    btnImportSubmit.onclick = async () => {
        const url = inputUrl.value.trim();
        if (!url) return;

        btnImportSubmit.innerText = 'Syncing...';
        await fetch('/api/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        modal.style.display = 'none';
        inputUrl.value = '';
        btnImportSubmit.innerText = 'Start Sync';
    };
}

let isPolling = false;
setInterval(async () => {
    if (isPolling) return;
    isPolling = true;

    try {
        const res = await fetch('/api/library');
        const newLibrary = await res.json();

        if (newLibrary.length > library.length) {
            const wasEmpty = library.length === 0;
            library = newLibrary;
            renderQueue();

            if (wasEmpty && library.length > 0) {
                currentIndex = 0;
                loadSong(0, true);
            }
        }
    } catch (e) {
        console.error('Polling error:', e);
    }

    isPolling = false;
}, 3000);

init();
