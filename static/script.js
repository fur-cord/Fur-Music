let library = [];
let currentIndex = 0;
let audio = new Audio();
let ytPlayer = null;

let isShuffle = false;
let repeatMode = 0;
let shuffleHistory = [];

const elTitle = document.getElementById('title');
const elArtist = document.getElementById('artist');
const elArtwork = document.getElementById('artwork');
const elBg = document.getElementById('app-background');
const elTimeCur = document.getElementById('time-current');
const elTimeTot = document.getElementById('time-total');
const elProgressFill = document.getElementById('progress-fill');
const elProgressBox = document.getElementById('progress-container');
const elQueue = document.getElementById('queue-list');

const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');

// New button selectors for Shuffle & Repeat
const btnRepeat = document.getElementById('btn-repeat');
const iconRepeat = document.getElementById('icon-repeat');
const iconRepeatOne = document.getElementById('icon-repeat-one');
const btnShuffle = document.getElementById('btn-shuffle');

const modal = document.getElementById('import-modal');
const inputUrl = document.getElementById('import-url');
const btnImportOpen = document.getElementById('btn-import-open');
const btnImportCancel = document.getElementById('btn-import-cancel');
const btnImportSubmit = document.getElementById('btn-import-submit');

async function init() {
    try {
        const res = await fetch('/api/library');
        library = await res.json();
        
        if(library.length > 0) {
            const savedId = localStorage.getItem('katt_id');
            const savedTime = localStorage.getItem('katt_time');
            
            let startIdx = library.findIndex(s => s.id === savedId);
            if(startIdx !== -1) currentIndex = startIdx;

            loadSong(currentIndex, false);
            if(savedTime) audio.currentTime = parseFloat(savedTime);
            renderQueue();
        } else {
            elTitle.innerText = "No music found";
            elArtist.innerText = "Click 'Import Playlist' to begin";
        }
    } catch (e) {
        console.error("Failed to load library:", e);
    }
}

function loadSong(index, autoPlay = true) {
    if (library.length === 0) return;
    
    const song = library[index];
    audio.src = `/audio/${song.id}`;
    
    elTitle.innerText = song.title;
    elArtist.innerText = song.artist;
    
    if (song.thumbnail) {
        elArtwork.src = song.thumbnail;
        elBg.style.backgroundImage = `url('${song.thumbnail}')`;
    }

    localStorage.setItem('katt_id', song.id);

    if(autoPlay) audio.play();
    
    if(ytPlayer && ytPlayer.loadVideoById) {
        ytPlayer.loadVideoById(song.id);
        if(!autoPlay) setTimeout(() => ytPlayer.pauseVideo(), 500);
    }
    
    renderQueue();
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
        if(ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(0);
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
    if(ytPlayer && ytPlayer.playVideo) ytPlayer.playVideo();
});

audio.addEventListener('pause', () => {
    iconPlay.style.display = 'block';
    iconPause.style.display = 'none';
    if(ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
});

audio.addEventListener('timeupdate', () => {
    const cur = audio.currentTime;
    const tot = audio.duration || 0;
    
    elTimeCur.innerText = formatTime(cur);
    elTimeTot.innerText = formatTime(tot);
    elProgressFill.style.width = tot ? `${(cur / tot) * 100}%` : '0%';
    
    if(Math.floor(cur) % 5 === 0) {
        localStorage.setItem('katt_time', cur);
    }
});

audio.addEventListener('ended', () => {
    if (repeatMode === 2) { 
        // Repeat One Mode
        audio.currentTime = 0;
        audio.play();
        if(ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(0);
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
    if(ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(audio.currentTime);
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
    if(e.code === 'Space' && e.target === document.body) { e.preventDefault(); togglePlay(); }
    if(e.code === 'ArrowRight') { nextSong(); }
    if(e.code === 'ArrowLeft') { prevSong(); }
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
        
        if(i === currentIndex) {
            div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
}

function formatTime(seconds) {
    if(isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('yt-player', {
        playerVars: { 'playsinline': 1, 'controls': 0, 'disablekb': 1, 'fs': 0, 'modestbranding': 1, 'rel': 0 },
        events: {
            'onReady': (event) => {
                event.target.mute(); 
                if(library.length > 0) {
                    ytPlayer.loadVideoById(library[currentIndex].id);
                    setTimeout(() => ytPlayer.pauseVideo(), 300);
                }
            },
            'onStateChange': (event) => {
                if (event.data === YT.PlayerState.BUFFERING) { audio.pause(); }
                if (event.data === YT.PlayerState.PLAYING && !audio.paused) { /* Synced */ }
            }
        }
    });
}

if (btnImportOpen) btnImportOpen.onclick = () => modal.style.display = 'flex';
if (btnImportCancel) btnImportCancel.onclick = () => modal.style.display = 'none';

if (btnImportSubmit) {
    btnImportSubmit.onclick = async () => {
        const url = inputUrl.value.trim();
        if(!url) return;
        
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
    } catch(e) {
        console.error("Polling error:", e);
    }
    
    isPolling = false;
}, 3000);

init();
