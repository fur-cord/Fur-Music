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

(function initSettingsDropdown() {
    const btnSettingsOpen = document.getElementById('btn-settings-open');
    const settingsPanel = document.getElementById('settings-panel');
    if (!btnSettingsOpen || !settingsPanel) return;

    btnSettingsOpen.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = settingsPanel.style.display === 'flex';
        settingsPanel.style.display = isOpen ? 'none' : 'flex';
        btnSettingsOpen.setAttribute('aria-expanded', String(!isOpen));
    });

    document.addEventListener('click', (e) => {
        if (settingsPanel.style.display !== 'flex') return;
        if (settingsPanel.contains(e.target) || btnSettingsOpen.contains(e.target)) return;
        settingsPanel.style.display = 'none';
        btnSettingsOpen.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            settingsPanel.style.display = 'none';
            btnSettingsOpen.setAttribute('aria-expanded', 'false');
        }
    });
})();

const viewModeKey = 'katt_view_mode';

function setViewMode(view) {
    const safeView = view === 'video' ? 'video' : 'music';
    document.body.classList.toggle('video-mode-active', safeView === 'video');

    document.querySelectorAll('.view-mode-option').forEach((btn) => {
        const selected = btn.dataset.view === safeView;
        btn.classList.toggle('active', selected);
        btn.setAttribute('aria-pressed', String(selected));
    });

    localStorage.setItem(viewModeKey, safeView);
}

document.querySelectorAll('.view-mode-option').forEach((btn) => {
    btn.addEventListener('click', () => setViewMode(btn.dataset.view));
});

setViewMode(localStorage.getItem(viewModeKey) || 'music');

(function initVideoMode() {
    const vmVideo = document.getElementById('vm-video');
    if (!vmVideo) return;

    const vmImportState = document.getElementById('vm-import-state');
    const vmPlayerState = document.getElementById('vm-player-state');
    const vmLoadingState = document.getElementById('vm-loading-state');
    const vmErrorState = document.getElementById('vm-error-state');
    const vmErrorText = document.getElementById('vm-error-text');
    const vmTitle = document.getElementById('vm-title');
    const vmUploader = document.getElementById('vm-uploader');
    const vmQueueList = document.getElementById('vm-queue-list');
    const vmQueueCount = document.getElementById('vm-queue-count');
    const vmTimeCur = document.getElementById('vm-time-current');
    const vmTimeTot = document.getElementById('vm-time-total');
    const vmProgressFill = document.getElementById('vm-progress-fill');
    const vmProgressBox = document.getElementById('vm-progress-container');
    const vmIconPlay = document.getElementById('vm-icon-play');
    const vmIconPause = document.getElementById('vm-icon-pause');

    const vmImportModal = document.getElementById('vm-import-modal');
    const vmImportUrl = document.getElementById('vm-import-url');
    const btnVmImportOpen = document.getElementById('btn-vm-import-open');
    const btnVmImportCancel = document.getElementById('btn-vm-import-cancel');
    const btnVmImportSubmit = document.getElementById('btn-vm-import-submit');
    const btnVmRetry = document.getElementById('btn-vm-retry');
    const btnVmPlay = document.getElementById('vm-btn-play');
    const btnVmQueue = document.getElementById('vm-btn-queue');
    const btnVmStop = document.getElementById('vm-btn-stop');
    const btnVmMute = document.getElementById('vm-btn-mute');
    const vmVolSlider = document.getElementById('vm-vol-slider');
    const btnVmFullscreen = document.getElementById('vm-btn-fullscreen');
    const vmIconFsEnter = document.getElementById('vm-icon-fs-enter');
    const vmIconFsExit = document.getElementById('vm-icon-fs-exit');
    const btnVmPip = document.getElementById('vm-btn-pip');
    const vmIconPipEnter = document.getElementById('vm-icon-pip-enter');
    const vmIconPipExit = document.getElementById('vm-icon-pip-exit');

    let vmPollTimer = null;

    function vmShowState(state) {
        if (vmImportState) vmImportState.style.display = state === 'import' ? 'flex' : 'none';
        if (vmLoadingState) vmLoadingState.style.display = state === 'loading' ? 'flex' : 'none';
        if (vmPlayerState) vmPlayerState.style.display = state === 'player' ? 'flex' : 'none';
        if (vmErrorState) vmErrorState.style.display = state === 'error' ? 'flex' : 'none';
    }

    function vmLoadVideo(video) {
        if (!video) return;
        const src = `/videomode/file/${encodeURIComponent(video.id)}`;
        if (vmVideo.getAttribute('src') !== src) {
            vmVideo.src = src;
            vmVideo.load();
        }
        if (vmTitle) vmTitle.innerText = video.title || 'Untitled video';
        if (vmUploader) vmUploader.innerText = video.uploader || '';
    }

    function vmRenderQueue(queue, currentVideo) {
        if (!vmQueueList) return;
        const items = Array.isArray(queue) ? queue : [];
        vmQueueList.innerHTML = '';
        if (vmQueueCount) vmQueueCount.innerText = `${items.length} ${items.length === 1 ? 'video' : 'videos'}`;
        if (items.length === 0) {
            vmQueueList.innerHTML = '<div class="vm-queue-empty">Your video queue is empty.</div>';
            return;
        }

        items.forEach((item) => {
            const row = document.createElement('div');
            row.className = `vm-queue-item ${currentVideo && item.id === currentVideo.id ? 'current' : ''} ${item.status === 'error' ? 'error' : ''}`;
            const thumb = document.createElement('img');
            thumb.className = 'vm-queue-thumb';
            thumb.src = item.thumbnail || '';
            thumb.alt = '';
            row.appendChild(thumb);

            const copy = document.createElement('div');
            copy.className = 'vm-queue-copy';
            const title = document.createElement('div');
            title.className = 'vm-queue-title';
            title.innerText = item.title || item.url || 'Untitled video';
            const meta = document.createElement('div');
            meta.className = 'vm-queue-meta';
            meta.innerText = item.uploader || (item.id ? 'Ready to watch' : 'Waiting for metadata');
            copy.append(title, meta);
            row.appendChild(copy);

            const status = document.createElement('span');
            status.className = 'vm-queue-status';
            status.innerText = item.id === (currentVideo && currentVideo.id) ? 'Playing' :
                item.status === 'downloading' ? 'Downloading' :
                item.status === 'ready' ? 'Ready' :
                item.status === 'error' ? 'Failed' : 'Queued';
            row.appendChild(status);
            vmQueueList.appendChild(row);
        });
    }

    function vmStopPolling() {
        if (vmPollTimer) {
            clearInterval(vmPollTimer);
            vmPollTimer = null;
        }
    }

    function vmStartPolling() {
        vmStopPolling();
        vmPollTimer = setInterval(async () => {
            await vmRefreshStatus(true);
        }, 2000);
    }

    async function vmRefreshStatus(applyVideo = true) {
        try {
            const res = await fetch('/api/videomode/status');
            const data = await res.json();

            vmRenderQueue(data.queue, data.video);
            if (data.video) {
                vmLoadVideo(data.video);
                vmShowState('player');
            } else if (data.status === 'downloading') {
                vmShowState('loading');
            } else if (data.status === 'error') {
                if (vmErrorText) vmErrorText.innerText = data.error || 'Something went wrong.';
                vmShowState('error');
            } else if (data.status === 'ready' && data.video) {
                if (applyVideo) vmLoadVideo(data.video);
                vmShowState('player');
            } else {
                vmShowState('import');
            }
            return data;
        } catch (e) {
            console.error('Video Mode status check failed', e);
            return null;
        }
    }

    function vmTogglePlay() {
        if (!vmVideo.getAttribute('src')) return;
        if (vmVideo.paused) {
            vmVideo.play();
        } else {
            vmVideo.pause();
        }
    }

    async function vmStopVideo() {
        vmVideo.pause();
        vmVideo.removeAttribute('src');
        vmVideo.load();
        vmStopPolling();

        if (document.pictureInPictureElement === vmVideo && document.exitPictureInPicture) {
            try { await document.exitPictureInPicture(); } catch (e) { /* ignore */ }
        }

        if (vmIsFullscreen()) {
            try {
                if (document.exitFullscreen) await document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            } catch (e) { /* ignore */ }
        }

        try {
            await fetch('/api/videomode/stop', { method: 'POST' });
        } catch (e) {
            console.error('Failed to clean up Video Mode file', e);
        }

        const nextData = await vmRefreshStatus(true);
        if (nextData && nextData.status === 'downloading' && !nextData.video) vmShowState('loading');
        vmStartPolling();
    }

    vmVideo.addEventListener('play', () => {
        if (vmIconPlay) vmIconPlay.style.display = 'none';
        if (vmIconPause) vmIconPause.style.display = 'block';
    });
    vmVideo.addEventListener('pause', () => {
        if (vmIconPlay) vmIconPlay.style.display = 'block';
        if (vmIconPause) vmIconPause.style.display = 'none';
    });
    vmVideo.addEventListener('timeupdate', () => {
        const cur = vmVideo.currentTime;
        const tot = vmVideo.duration || 0;
        if (vmTimeCur) vmTimeCur.innerText = formatTime(cur);
        if (vmTimeTot) vmTimeTot.innerText = formatTime(tot);
        if (vmProgressFill) vmProgressFill.style.width = tot ? `${(cur / tot) * 100}%` : '0%';
    });
    vmVideo.addEventListener('error', () => {
        if (vmVideo.getAttribute('src')) {
            if (vmErrorText) vmErrorText.innerText = 'This video could not be played.';
            vmShowState('error');
        }
    });
    vmVideo.addEventListener('ended', vmStopVideo);

    if (vmProgressBox) {
        vmProgressBox.addEventListener('click', (e) => {
            if (!vmVideo.duration) return;
            const width = vmProgressBox.clientWidth;
            const ratio = e.offsetX / width;
            vmVideo.currentTime = ratio * vmVideo.duration;
        });
    }

    if (btnVmPlay) btnVmPlay.addEventListener('click', vmTogglePlay);
    if (btnVmStop) btnVmStop.addEventListener('click', vmStopVideo);
    if (btnVmMute) {
        btnVmMute.addEventListener('click', () => {
            vmVideo.muted = !vmVideo.muted;
            btnVmMute.style.opacity = vmVideo.muted ? '0.5' : '1';
        });
    }
    if (vmVolSlider) {
        vmVolSlider.addEventListener('input', (e) => {
            vmVideo.volume = e.target.value;
            vmVideo.muted = false;
        });
    }

    if (btnVmImportOpen) btnVmImportOpen.onclick = () => { vmImportModal.style.display = 'flex'; };
    if (btnVmQueue) btnVmQueue.onclick = () => {
        vmImportModal.style.display = 'flex';
        if (vmImportUrl) vmImportUrl.focus();
    };
    if (btnVmImportCancel) btnVmImportCancel.onclick = () => { vmImportModal.style.display = 'none'; };
    if (btnVmRetry) btnVmRetry.onclick = () => vmShowState('import');

    function vmIsFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function vmSetFullscreenIcon() {
        const active = vmIsFullscreen();
        if (vmIconFsEnter) vmIconFsEnter.style.display = active ? 'none' : 'block';
        if (vmIconFsExit) vmIconFsExit.style.display = active ? 'block' : 'none';
    }

    async function vmToggleFullscreen() {
        if (!vmPlayerState) return;
        try {
            if (!vmIsFullscreen()) {
                if (vmPlayerState.requestFullscreen) {
                    await vmPlayerState.requestFullscreen();
                } else if (vmPlayerState.webkitRequestFullscreen) {
                    vmPlayerState.webkitRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
        } catch (e) {
            console.error('Fullscreen toggle failed', e);
        }
    }

    function vmIsPip() {
        return document.pictureInPictureElement === vmVideo;
    }

    function vmSetPipIcon() {
        const active = vmIsPip();
        if (vmIconPipEnter) vmIconPipEnter.style.display = active ? 'none' : 'block';
        if (vmIconPipExit) vmIconPipExit.style.display = active ? 'block' : 'none';
        if (btnVmPip) {
            btnVmPip.setAttribute('aria-pressed', String(active));
            btnVmPip.title = active ? 'Exit pop-out video' : 'Pop out video';
        }
    }

    async function vmTogglePip() {
        if (!vmVideo.getAttribute('src')) return;

        try {
            if (vmIsPip()) {
                if (document.exitPictureInPicture) await document.exitPictureInPicture();
            } else if (vmVideo.requestPictureInPicture) {
                await vmVideo.requestPictureInPicture();
            } else {
                await vmToggleFullscreen();
            }
        } catch (e) {
            console.error('Pop-out toggle failed', e);
        }
    }

    if (btnVmFullscreen) btnVmFullscreen.addEventListener('click', vmToggleFullscreen);
    if (btnVmPip) btnVmPip.addEventListener('click', vmTogglePip);
    document.addEventListener('fullscreenchange', vmSetFullscreenIcon);
    document.addEventListener('webkitfullscreenchange', vmSetFullscreenIcon);
    vmVideo.addEventListener('enterpictureinpicture', vmSetPipIcon);
    vmVideo.addEventListener('leavepictureinpicture', vmSetPipIcon);
    vmSetPipIcon();

    if (btnVmImportSubmit) {
        btnVmImportSubmit.onclick = async () => {
            const url = vmImportUrl.value.trim();
            if (!url) return;

            btnVmImportSubmit.disabled = true;
            btnVmImportSubmit.innerText = 'Starting...';

            try {
                const res = await fetch('/api/videomode/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                const data = await res.json();

                if (!res.ok) {
                    if (vmErrorText) vmErrorText.innerText = data.error || 'Could not start download.';
                    vmShowState('error');
                } else {
                    await vmRefreshStatus(true);
                    vmStartPolling();
                }
            } catch (e) {
                if (vmErrorText) vmErrorText.innerText = 'Network error. Please try again.';
                vmShowState('error');
            }

            vmImportModal.style.display = 'none';
            vmImportUrl.value = '';
            btnVmImportSubmit.disabled = false;
            btnVmImportSubmit.innerText = 'Add to Queue';
        };
    }
(function initFullscreenAutoHide() {
    const vmPlayerState = document.getElementById('vm-player-state');
    const vmBottomBar = document.getElementById('vm-bottom-bar');
    const vmVideoEl = document.getElementById('vm-video');
    if (!vmPlayerState || !vmBottomBar) return;

    let hideTimer = null;
    const HIDE_DELAY = 2500;

    function isFs() {
        return document.fullscreenElement === vmPlayerState ||
               document.webkitFullscreenElement === vmPlayerState;
    }

    function showControls() {
        vmPlayerState.classList.remove('vm-controls-hidden');
        scheduleHide();
    }

    function scheduleHide() {
        clearTimeout(hideTimer);
        if (!isFs()) return;
        if (vmVideoEl && vmVideoEl.paused) return;
        hideTimer = setTimeout(() => {
            vmPlayerState.classList.add('vm-controls-hidden');
        }, HIDE_DELAY);
    }

    vmPlayerState.addEventListener('mousemove', () => { if (isFs()) showControls(); });

    vmBottomBar.addEventListener('mouseenter', () => {
        clearTimeout(hideTimer);
        if (isFs()) vmPlayerState.classList.remove('vm-controls-hidden');
    });
    vmBottomBar.addEventListener('mouseleave', () => { if (isFs()) scheduleHide(); });

    ['fullscreenchange', 'webkitfullscreenchange'].forEach((evt) => {
        document.addEventListener(evt, () => {
            if (isFs()) {
                showControls();
            } else {
                clearTimeout(hideTimer);
                vmPlayerState.classList.remove('vm-controls-hidden');
            }
        });
    });

    if (vmVideoEl) {
        vmVideoEl.addEventListener('play', () => { if (isFs()) scheduleHide(); });
        vmVideoEl.addEventListener('pause', () => { if (isFs()) showControls(); });
    }
})();

    vmRefreshStatus();
    vmStartPolling();
})();
const changelogModal = document.getElementById('changelog-modal');
const changelogText = document.getElementById('changelog-text');
const btnChangelogClose = document.getElementById('btn-changelog-close');

async function showChangelog() {
    if (!changelogModal) return;
    changelogModal.style.display = 'flex';
    try {
        const res = await fetch('/api/changelog');
        const data = await res.json();
        changelogText.innerText = data.content || 'No changelog available.';
    } catch (e) {
        changelogText.innerText = 'Could not load changelog.';
    }
}

if (btnChangelogClose) {
    btnChangelogClose.onclick = () => {
        changelogModal.style.display = 'none';
    };
}

showChangelog();
