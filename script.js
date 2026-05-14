const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const GRID_SIZE = 20;
const WORLD_GRID_SIZE = 100;
const HUD_UPDATE_INTERVAL_MS = 150;
const boardContainer = document.getElementById('board-container');

let spectatorCamX = 0;
let spectatorCamY = 0;
let hasSpectatorCamera = false;

function worldPixelSize() {
    return WORLD_GRID_SIZE * GRID_SIZE;
}

function clampCamera(x, y) {
    const worldSize = worldPixelSize();
    const minX = Math.min(0, canvas.width - worldSize);
    const minY = Math.min(0, canvas.height - worldSize);
    return {
        x: Math.min(0, Math.max(minX, x)),
        y: Math.min(0, Math.max(minY, y))
    };
}

function centerSpectatorCamera() {
    const worldSize = worldPixelSize();
    const centered = clampCamera(
        canvas.width / 2 - worldSize / 2,
        canvas.height / 2 - worldSize / 2
    );
    spectatorCamX = centered.x;
    spectatorCamY = centered.y;
    hasSpectatorCamera = true;
}

function resizeCanvasToBoard() {
    if (!boardContainer) return;
    const rect = boardContainer.getBoundingClientRect();
    const size = Math.max(320, Math.floor(Math.min(rect.width, rect.height)));
    if (!Number.isFinite(size) || size === canvas.width) return;
    canvas.width = size;
    canvas.height = size;
    if (!hasSpectatorCamera || (isSpectating && !spectateTargetId)) {
        centerSpectatorCamera();
    }
}

requestAnimationFrame(resizeCanvasToBoard);
window.addEventListener('resize', resizeCanvasToBoard);
if (window.ResizeObserver && boardContainer) {
    new ResizeObserver(resizeCanvasToBoard).observe(boardContainer);
}

// UI 元素
const screens = {
    start: document.getElementById('start-screen'),
    over: document.getElementById('game-over-screen'),
    pause: document.getElementById('pause-screen'),
    settings: document.getElementById('settings-screen'),
    leaderboard: document.getElementById('leaderboard-screen')
};

const btns = {
    start: document.getElementById('btn-start'),
    restart: document.getElementById('btn-restart')
};

const userInfoEl = document.getElementById('user-info');
const finalScoreEl = document.getElementById('final-score');
const playerNameInput = document.getElementById('player-name');
const onlineCountEl = document.getElementById('online-count');
const hudOnlineCountEl = document.getElementById('hud-online-count');
const hudModeEl = document.getElementById('hud-mode');
const hudPlayerCountEl = document.getElementById('hud-player-count');
const hudScoreEl = document.getElementById('hud-score');
const hudLengthEl = document.getElementById('hud-length');
const hudDashEl = document.getElementById('hud-dash');
const hudDashStateEl = document.getElementById('hud-dash-state');
const hudEffectsEl = document.getElementById('hud-effects');
const spectateTargetEl = document.getElementById('spectate-target');
const btnLockLandscape = document.getElementById('btn-lock-landscape');
const orientationLockStatusEl = document.getElementById('orientation-lock-status');

const EFFECT_DEFINITIONS = [
    { key: 'superUntil', label: 'Invincible', short: 'INV', color: '#ffd700' },
    { key: 'speedUntil', label: 'Speed Boost', short: 'SPD', color: '#00ff88' },
    { key: 'magnetUntil', label: 'Magnet Pull', short: 'MAG', color: '#49a7ff' },
    { key: 'reversedUntil', label: 'Reverse', short: 'REV', color: '#cc66ff' }
];

function activeEffectsForPlayer(player, now) {
    if (!player) return [];
    return EFFECT_DEFINITIONS
        .filter(effect => player[effect.key] && player[effect.key] > now)
        .map(effect => ({
            ...effect,
            secs: Math.max(1, Math.ceil((player[effect.key] - now) / 1000))
        }));
}

function updateMatchHud(state, now) {
    const player = myId && state.players ? state.players[myId] : null;
    const isPlaying = player && player.state === 'PLAYING';

    if (hudScoreEl) hudScoreEl.textContent = isPlaying ? String(player.score || 0) : '0';
    if (hudLengthEl) hudLengthEl.textContent = isPlaying ? String(player.len || (player.snake ? player.snake.length : 0)) : '0';

    if (hudDashEl && hudDashStateEl) {
        hudDashEl.classList.toggle('is-spending', Boolean(isPlaying && player.isDashing));
        hudDashEl.classList.toggle('is-low', Boolean(isPlaying && (player.len || 0) <= 3));
        if (!isPlaying) {
            hudDashStateEl.textContent = 'Join';
        } else if ((player.len || 0) <= 3) {
            hudDashStateEl.textContent = 'Low';
        } else if (player.isDashing) {
            hudDashStateEl.textContent = 'Using';
        } else {
            hudDashStateEl.textContent = 'Ready';
        }
    }

    if (!hudEffectsEl) return;
    hudEffectsEl.innerHTML = '';
    const activeEffects = activeEffectsForPlayer(player, now);
    if (!activeEffects.length) {
        const empty = document.createElement('span');
        empty.className = 'effect-chip effect-muted';
        empty.textContent = isPlaying ? 'No active effect' : 'Enter arena to track effects';
        hudEffectsEl.appendChild(empty);
        return;
    }

    activeEffects.forEach(effect => {
        const chip = document.createElement('span');
        chip.className = 'effect-chip';
        chip.style.setProperty('--effect-color', effect.color);
        chip.textContent = `${effect.short} ${effect.secs}s`;
        chip.title = effect.label;
        hudEffectsEl.appendChild(chip);
    });
}

// 隱藏目前多人連線用不到的功能
async function requestLandscapeLock() {
    const root = document.documentElement;
    try {
        if (!document.fullscreenElement && root.requestFullscreen) {
            await root.requestFullscreen();
        }
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape');
            if (orientationLockStatusEl) orientationLockStatusEl.textContent = 'Landscape locked.';
        } else if (orientationLockStatusEl) {
            orientationLockStatusEl.textContent = 'This browser does not support orientation lock.';
        }
    } catch (err) {
        if (orientationLockStatusEl) {
            orientationLockStatusEl.textContent = 'Please rotate your phone and use system rotation lock if needed.';
        }
    } finally {
        setTimeout(resizeCanvasToBoard, 300);
    }
}

if (btnLockLandscape) {
    btnLockLandscape.addEventListener('click', requestLandscapeLock);
}

['btn-resume-save','btn-show-cheat','cheat-text'].forEach(id => {
    let el = document.getElementById(id);
    if(el) el.classList.add('hidden');
});

// 設定按鈕
let settingsOrigin = null;
document.getElementById('btn-settings').addEventListener('click', () => {
    settingsOrigin = Object.values(screens).find(el => !el.classList.contains('hidden')) || null;
    hideAllScreens();
    screens.settings.classList.remove('hidden');
});
document.getElementById('btn-close-settings').addEventListener('click', () => {
    screens.settings.classList.add('hidden');
    if (settingsOrigin) settingsOrigin.classList.remove('hidden');
    settingsOrigin = null;
});

async function loadLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    list.innerHTML = '<li>Loading...</li>';

    try {
        const res = await fetch('/api/leaderboard');
        const rows = await res.json();
        list.innerHTML = '';

        if (!Array.isArray(rows) || rows.length === 0) {
            const empty = document.createElement('li');
            empty.textContent = 'No saved scores yet';
            list.appendChild(empty);
            return;
        }

        rows.forEach((row) => {
            const item = document.createElement('li');
            const name = document.createElement('span');
            name.textContent = row.player_name;
            item.append(name, ` ${row.best_score} pts / len ${row.best_length} / ${row.games_played} games`);
            list.appendChild(item);
        });
    } catch (err) {
        list.innerHTML = '<li>Failed to load leaderboard</li>';
    }
}

document.getElementById('btn-leaderboard').addEventListener('click', async () => {
    settingsOrigin = Object.values(screens).find(el => !el.classList.contains('hidden')) || null;
    hideAllScreens();
    screens.leaderboard.classList.remove('hidden');
    await loadLeaderboard();
});
document.getElementById('btn-close-leaderboard').addEventListener('click', () => {
    screens.leaderboard.classList.add('hidden');
    if (settingsOrigin) settingsOrigin.classList.remove('hidden');
    settingsOrigin = null;
});

// 主題切換
const savedTheme = localStorage.getItem('theme') || 'retro';
document.getElementById('theme-select').value = savedTheme;
document.documentElement.setAttribute('data-theme', savedTheme);
document.getElementById('theme-select').addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.target.value);
    localStorage.setItem('theme', e.target.value);
});

let currentUser = null;
let isSpectating = false;
let spectateTargetId = '';

const savedPlayerName = localStorage.getItem('playerName') || '';
if (playerNameInput) playerNameInput.value = savedPlayerName;

function hideAllScreens() {
    Object.values(screens).forEach(s => { if(s) s.classList.add('hidden'); });
}

// 初始化連線
const socket = io();
let myId = null;

socket.on('connect', () => {
    myId = socket.id;
    hideAllScreens();
    screens.start.classList.remove('hidden');
});

function buildCurrentUser() {
    const name = playerNameInput ? playerNameInput.value.trim() : '';
    const finalName = name || '玩家' + Math.floor(Math.random() * 9000 + 1000);
    localStorage.setItem('playerName', finalName);
    currentUser = { name: finalName };
    userInfoEl.textContent = `👤 ${finalName}`;
    return currentUser;
}

// 點擊開始與重新開始按鈕 (送出使用者資料給伺服器)
btns.start.addEventListener('click', () => {
    isSpectating = false;
    spectateTargetId = '';
    hasSpectatorCamera = false;
    if (hudModeEl) hudModeEl.textContent = 'Playing';
    socket.emit('joinGame', buildCurrentUser());
});
btns.restart.addEventListener('click', () => {
    isSpectating = false;
    spectateTargetId = '';
    hasSpectatorCamera = false;
    if (hudModeEl) hudModeEl.textContent = 'Playing';
    socket.emit('joinGame', currentUser);
});

if (spectateTargetEl) {
    spectateTargetEl.addEventListener('change', () => {
        spectateTargetId = spectateTargetEl.value;
        if (!spectateTargetId) centerSpectatorCamera();
    });
}

if (playerNameInput) {
    playerNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btns.start.click();
        }
    });
}

socket.on('joined', () => { hideAllScreens(); });
socket.on('serverMessage', (msg) => { alert(msg); });
socket.on('roomStatus', (status) => {
    if (onlineCountEl) onlineCountEl.textContent = `在線 ${status.players}/${status.maxPlayers}`;
    if (hudOnlineCountEl) hudOnlineCountEl.textContent = `${status.players}/${status.maxPlayers}`;
    if (hudPlayerCountEl) hudPlayerCountEl.textContent = `${status.players} players`;
});
socket.on('gameOver', (score) => {
    // 不 hideAllScreens：讓遊戲畫面繼續在半透明 overlay 後面跑（觀戰模式）
    Object.values(screens).forEach(s => { if (s !== screens.over) s.classList.add('hidden'); });
    finalScoreEl.textContent = score;
    screens.over.classList.remove('hidden');
    isSpectating = true;
    if (hudModeEl) hudModeEl.textContent = 'Spectating';
    spectateTargetId = '';
    centerSpectatorCamera();
    // 死亡後自動 focus 聊天輸入框
    const chatInput = document.getElementById('chat-input');
    const isTouchDevice = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (chatInput && !isTouchDevice) setTimeout(() => chatInput.focus(), 200);
});

// 更新分數
const liveScoreboardEl = document.getElementById('live-scoreboard');
socket.on('updateScoreboard', (scores) => {
    if(liveScoreboardEl) {
        liveScoreboardEl.innerHTML = '';
        if (!scores.length) {
            const empty = document.createElement('div');
            empty.className = 'score-empty';
            empty.textContent = 'Waiting for players';
            liveScoreboardEl.appendChild(empty);
            return;
        }
        const topScore = Math.max(1, ...scores.map(s => s.score));
        scores.forEach((s, idx) => {
            const row = document.createElement('div');
            row.className = 'score-row';
            if (idx === 0) row.classList.add('score-row-leader');
            if (idx < 3) row.classList.add('score-row-podium');
            if (s.id === myId) row.classList.add('score-row-self');
            row.style.setProperty('--player-color', s.color);

            const rank = document.createElement('div');
            rank.className = 'score-rank';
            rank.textContent = idx === 0 ? '1' : idx === 1 ? '2' : idx === 2 ? '3' : String(idx + 1);

            const body = document.createElement('div');
            body.className = 'score-body';

            const top = document.createElement('div');
            top.className = 'score-topline';

            const name = document.createElement('span');
            name.className = 'score-name';
            name.textContent = s.name;

            const points = document.createElement('span');
            points.className = 'score-points';
            points.textContent = `${s.score} 分`;

            points.textContent = `${s.score} pts`;
            top.append(name, points);

            const meta = document.createElement('div');
            meta.className = 'score-meta';
            meta.textContent = `長度 ${s.len}`;
            meta.textContent = `Length ${s.len}`;
            if (s.isSuper) {
                const status = document.createElement('span');
                status.className = 'score-status';
                status.textContent = 'INV';
                status.textContent = '無敵';
                meta.append(' · ', status);
            }

            const superStatus = meta.querySelector('.score-status');
            if (superStatus) superStatus.textContent = 'INV';

            const meter = document.createElement('div');
            meter.className = 'score-meter';
            const fill = document.createElement('span');
            fill.style.width = `${Math.max(6, Math.round((s.score / topScore) * 100))}%`;
            meter.appendChild(fill);

            body.append(top, meta, meter);
            row.append(rank, body);
            liveScoreboardEl.appendChild(row);
        });
    }
});

// 擊殺通知
let killFeedMessages = [];
socket.on('killFeed', (data) => {
    killFeedMessages.push({ ...data, time: Date.now() });
    if(killFeedMessages.length > 5) killFeedMessages.shift();
});

let effectToasts = [];
let previousEffectState = {};
let lastHudUpdateAt = 0;

function pushEffectToast(icon, label, color) {
    effectToasts.push({ icon, label, color, time: Date.now() });
    if (effectToasts.length > 4) effectToasts.shift();
}

function updateEffectToasts(player, now) {
    const effects = [
        { key: 'superUntil', icon: '⭐', label: '無敵', color: '#ffd700' },
        { key: 'speedUntil', icon: '💨', label: '加速', color: '#00ff88' },
        { key: 'magnetUntil', icon: '🧲', label: '磁鐵', color: '#0088ff' },
        { key: 'reversedUntil', icon: '☠️', label: '中毒', color: '#cc44cc' }
    ];

    effects.forEach(effect => {
        const isActive = player[effect.key] && player[effect.key] > now;
        if (isActive && !previousEffectState[effect.key]) {
            pushEffectToast(effect.icon, effect.label, effect.color);
        }
        previousEffectState[effect.key] = isActive;
    });
}

// UI 顯示切換
updateEffectToasts = function(player, now) {
    EFFECT_DEFINITIONS.forEach(effect => {
        const isActive = player[effect.key] && player[effect.key] > now;
        if (isActive && !previousEffectState[effect.key]) {
            pushEffectToast(effect.short, effect.label, effect.color);
        }
        previousEffectState[effect.key] = isActive;
    });
};

const btnToggleUi = document.getElementById('btn-toggle-ui');
const controlsHint = document.getElementById('controls-hint');
if (btnToggleUi && controlsHint) {
    btnToggleUi.addEventListener('click', () => {
        if (controlsHint.style.display === 'none') {
            controlsHint.style.display = 'block';
            btnToggleUi.innerText = '👁️ 隱藏';
        } else {
            controlsHint.style.display = 'none';
            btnToggleUi.innerText = '👁️ 顯示';
        }
    });
}

// 鍵盤監聽（聊天框 focus 時不攔截）
document.addEventListener('keydown', (e) => {
    if (document.activeElement && ['chat-input', 'player-name'].includes(document.activeElement.id)) return;
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight", " "].includes(e.key)) e.preventDefault();
    if (e.key === ' ') { socket.emit('dash', true); return; }
    let dir = null;
    switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': dir = { dx: 0, dy: -1 }; break;
        case 'ArrowDown': case 's': case 'S': dir = { dx: 0, dy: 1 }; break;
        case 'ArrowLeft': case 'a': case 'A': dir = { dx: -1, dy: 0 }; break;
        case 'ArrowRight': case 'd': case 'D': dir = { dx: 1, dy: 0 }; break;
    }
    if (dir) socket.emit('direction', dir);
});
document.addEventListener('keyup', (e) => {
    if (document.activeElement && ['chat-input', 'player-name'].includes(document.activeElement.id)) return;
    if (e.key === ' ') socket.emit('dash', false);
});

function emitDirection(dir) {
    socket.emit('direction', dir);
}

function directionFromDelta(dx, dy, minDistance = 12) {
    if (Math.abs(dx) < minDistance && Math.abs(dy) < minDistance) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 };
    return dy > 0 ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 };
}

// 手機滑動控制：拖曳中即可換方向，不必等放開
let touchStartX = 0, touchStartY = 0;
function isFreeSpectatorCamera() {
    return isSpectating && !spectateTargetId;
}

function panSpectatorCamera(dx, dy) {
    const clamped = clampCamera(spectatorCamX + dx, spectatorCamY + dy);
    spectatorCamX = clamped.x;
    spectatorCamY = clamped.y;
    hasSpectatorCamera = true;
}

let isMousePanning = false;
let lastPanX = 0;
let lastPanY = 0;

canvas.addEventListener('mousedown', (e) => {
    if (!isFreeSpectatorCamera()) return;
    e.preventDefault();
    isMousePanning = true;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
});

window.addEventListener('mousemove', (e) => {
    if (!isMousePanning) return;
    panSpectatorCamera(e.clientX - lastPanX, e.clientY - lastPanY);
    lastPanX = e.clientX;
    lastPanY = e.clientY;
});

window.addEventListener('mouseup', () => {
    isMousePanning = false;
});

let lastSwipeDir = null;
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    lastSwipeDir = null;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (isFreeSpectatorCamera()) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        panSpectatorCamera(dx, dy);
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        return;
    }
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    const dir = directionFromDelta(dx, dy);
    if (!dir) return;
    const key = `${dir.dx},${dir.dy}`;
    if (key !== lastSwipeDir) {
        emitDirection(dir);
        lastSwipeDir = key;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    lastSwipeDir = null;
}, { passive: false });

// 虛擬方向鍵
['up','down','left','right'].forEach(d => {
    let btn = document.getElementById('dpad-' + d);
    if (!btn) return;
    let dir = d === 'up' ? {dx:0,dy:-1} : d === 'down' ? {dx:0,dy:1} : d === 'left' ? {dx:-1,dy:0} : {dx:1,dy:0};
    const pressDirection = (e) => {
        e.preventDefault();
        emitDirection(dir);
        btn.classList.add('dpad-active');
    };
    const releaseDirection = (e) => {
        e.preventDefault();
        btn.classList.remove('dpad-active');
    };
    btn.addEventListener('pointerdown', pressDirection);
    btn.addEventListener('pointerup', releaseDirection);
    btn.addEventListener('pointercancel', releaseDirection);
    btn.addEventListener('pointerleave', releaseDirection);
});

const dpadDash = document.getElementById('dpad-dash');
if (dpadDash) {
    const startDash = (e) => {
        e.preventDefault();
        dpadDash.classList.add('dpad-active');
        socket.emit('dash', true);
    };
    const stopDash = (e) => {
        e.preventDefault();
        dpadDash.classList.remove('dpad-active');
        socket.emit('dash', false);
    };
    dpadDash.addEventListener('pointerdown', startDash);
    dpadDash.addEventListener('pointerup', stopDash);
    dpadDash.addEventListener('pointercancel', stopDash);
    dpadDash.addEventListener('pointerleave', stopDash);
}

// 聊天
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const msg = chatInput.value.trim();
            if (msg) {
                socket.emit('chat', msg);
                chatInput.value = '';
            }
        }
        // Escape：取消 focus，回到遊戲控制
        if (e.key === 'Escape') chatInput.blur();
    });
}

socket.on('chatMessage', (data) => {
    if (!chatMessages) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    const t = new Date(data.time);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');

    const time = document.createElement('span');
    time.className = 'chat-time';
    time.textContent = `${hh}:${mm} `;

    const name = document.createElement('b');
    name.className = 'chat-name';
    name.style.color = data.color || '#aaaaaa';
    name.textContent = data.name || '觀戰者';

    const message = document.createElement('span');
    message.className = 'chat-text';
    message.textContent = `: ${data.msg || ''}`;

    div.append(time, name, message);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    // 保留最新 60 則
    while (chatMessages.children.length > 60) chatMessages.removeChild(chatMessages.firstChild);
});

// 初始化星星背景
let stars = [];
for (let i = 0; i < 160; i++) {
    stars.push({
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        r: Math.random() * 1.5,
        alpha: Math.random()
    });
}

let worldBackgroundCanvas = null;
let worldBackgroundCtx = null;

function buildWorldBackground(serverGridSize) {
    const worldSize = serverGridSize * GRID_SIZE;
    worldBackgroundCanvas = document.createElement('canvas');
    worldBackgroundCanvas.width = worldSize;
    worldBackgroundCanvas.height = worldSize;
    worldBackgroundCtx = worldBackgroundCanvas.getContext('2d');

    worldBackgroundCtx.fillStyle = '#0b0c10';
    worldBackgroundCtx.fillRect(0, 0, worldSize, worldSize);

    stars.forEach(star => {
        worldBackgroundCtx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        worldBackgroundCtx.beginPath();
        worldBackgroundCtx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        worldBackgroundCtx.fill();
    });

    worldBackgroundCtx.strokeStyle = '#00e5ff';
    worldBackgroundCtx.lineWidth = 4;
    worldBackgroundCtx.strokeRect(0, 0, worldSize, worldSize);

    worldBackgroundCtx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    worldBackgroundCtx.lineWidth = 1;
    for (let i = 0; i <= serverGridSize; i++) {
        worldBackgroundCtx.beginPath();
        worldBackgroundCtx.moveTo(i * GRID_SIZE, 0);
        worldBackgroundCtx.lineTo(i * GRID_SIZE, worldSize);
        worldBackgroundCtx.stroke();
        worldBackgroundCtx.beginPath();
        worldBackgroundCtx.moveTo(0, i * GRID_SIZE);
        worldBackgroundCtx.lineTo(worldSize, i * GRID_SIZE);
        worldBackgroundCtx.stroke();
    }
}

function drawWorldBackground(camX, camY, serverGridSize) {
    if (!worldBackgroundCanvas) buildWorldBackground(serverGridSize);
    const worldSize = serverGridSize * GRID_SIZE;
    const sx = Math.max(0, Math.min(worldSize - canvas.width, -camX));
    const sy = Math.max(0, Math.min(worldSize - canvas.height, -camY));
    const sw = Math.min(canvas.width, worldSize - sx);
    const sh = Math.min(canvas.height, worldSize - sy);

    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(worldBackgroundCanvas, sx, sy, sw, sh, sx + camX, sy + camY, sw, sh);
}

function drawItemBase(x, y, color, glyph, label, shape = 'circle') {
    const cx = x * GRID_SIZE + GRID_SIZE / 2;
    const cy = y * GRID_SIZE + GRID_SIZE / 2;
    const pulse = 0.85 + Math.sin(Date.now() / 180) * 0.15;

    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    if (shape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 10 * pulse);
        ctx.lineTo(cx + 10 * pulse, cy);
        ctx.lineTo(cx, cy + 10 * pulse);
        ctx.lineTo(cx - 10 * pulse, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if (shape === 'square') {
        ctx.fillRect(cx - 9 * pulse, cy - 9 * pulse, 18 * pulse, 18 * pulse);
        ctx.strokeRect(cx - 9 * pulse, cy - 9 * pulse, 18 * pulse, 18 * pulse);
    } else {
        ctx.beginPath();
        ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#05050f';
    ctx.fillText(glyph, cx, cy + 0.5);

    if (label) {
        ctx.font = 'bold 8px sans-serif';
        ctx.fillStyle = color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
        ctx.fillText(label, cx, cy + 18);
    }
    ctx.restore();
}

function drawNormalApple(apple, alpha) {
    const cx = apple.x * GRID_SIZE + GRID_SIZE / 2;
    const cy = apple.y * GRID_SIZE + GRID_SIZE / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ff2a2a';
    ctx.fillStyle = '#ff2a2a';
    ctx.beginPath();
    ctx.arc(cx, cy + 1, GRID_SIZE / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#5d2b12';
    ctx.fillRect(cx - 1, cy - 10, 3, 7);
    ctx.fillStyle = '#39ff14';
    ctx.beginPath();
    ctx.ellipse(cx + 5, cy - 9, 5, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function updateSpectatorTargets(players) {
    if (!spectateTargetEl || !isSpectating) return;
    const livingPlayers = Object.values(players).filter(p => p.state === 'PLAYING');
    const existingValue = spectateTargetEl.value;

    spectateTargetEl.innerHTML = '';
    const overview = document.createElement('option');
    overview.value = '';
    overview.textContent = '全圖自由鏡頭';
    spectateTargetEl.appendChild(overview);

    livingPlayers.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.name} (${p.score})`;
        spectateTargetEl.appendChild(option);
    });

    if (existingValue && players[existingValue]) {
        spectateTargetEl.value = existingValue;
        spectateTargetId = existingValue;
    } else if (spectateTargetId && players[spectateTargetId]) {
        spectateTargetEl.value = spectateTargetId;
    } else {
        spectateTargetId = '';
        spectateTargetEl.value = '';
        if (!hasSpectatorCamera) centerSpectatorCamera();
    }
}

// 繪製遊戲畫面
const INTERPOLATION_MS = 100;
let previousGameState = null;
let latestGameState = null;
let previousGameStateAt = 0;
let latestGameStateAt = 0;
let renderLoopStarted = false;

function getRenderAlpha() {
    if (!previousGameState) return 1;
    return Math.min(1, Math.max(0, (performance.now() - latestGameStateAt) / INTERPOLATION_MS));
}

function getRenderSegment(playerId, index, segment, alpha) {
    const previous = previousGameState && previousGameState.players && previousGameState.players[playerId];
    const prevSegment = previous && previous.snake && previous.snake[index];
    if (!prevSegment) return segment;

    const dx = segment.x - prevSegment.x;
    const dy = segment.y - prevSegment.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) return segment;

    return {
        x: prevSegment.x + dx * alpha,
        y: prevSegment.y + dy * alpha
    };
}

socket.on('gameState', (state) => {
    previousGameState = latestGameState;
    previousGameStateAt = latestGameStateAt;
    latestGameState = state;
    latestGameStateAt = performance.now();
    updateSpectatorTargets(state.players);

    if (!renderLoopStarted) {
        renderLoopStarted = true;
        requestAnimationFrame(renderLatestGameState);
    }
});

function renderLatestGameState() {
    if (latestGameState) renderGameState(latestGameState);
    requestAnimationFrame(renderLatestGameState);
}

function renderGameState(state) {
    resizeCanvasToBoard();
    const SERVER_GRID_SIZE = 100; // 對應後端的新尺寸
    updateSpectatorTargets(state.players);
    const renderAlpha = getRenderAlpha();
    
    // 計算相機位置 (活著跟隨自己；觀戰可跟隨指定玩家；否則置中)
    let camX = 0;
    let camY = 0;
    let mySnake = null;
    const followedId = (myId && state.players[myId] && state.players[myId].state === 'PLAYING')
        ? myId
        : spectateTargetId;

    if (isFreeSpectatorCamera()) {
        if (!hasSpectatorCamera) centerSpectatorCamera();
        camX = spectatorCamX;
        camY = spectatorCamY;
    } else if (followedId && state.players[followedId] && state.players[followedId].state === 'PLAYING') {
        mySnake = getRenderSegment(followedId, 0, state.players[followedId].snake[0], renderAlpha);
        let targetX = mySnake.x * GRID_SIZE + GRID_SIZE / 2;
        let targetY = mySnake.y * GRID_SIZE + GRID_SIZE / 2;
        camX = canvas.width / 2 - targetX;
        camY = canvas.height / 2 - targetY;
    } else {
        camX = canvas.width / 2 - (SERVER_GRID_SIZE * GRID_SIZE) / 2;
        camY = canvas.height / 2 - (SERVER_GRID_SIZE * GRID_SIZE) / 2;
    }

    // 限制相機不要超出邊界
    const clampedCamera = clampCamera(camX, camY);
    camX = clampedCamera.x;
    camY = clampedCamera.y;
    if (isFreeSpectatorCamera()) {
        spectatorCamX = camX;
        spectatorCamY = camY;
    }

    // 清空並畫上宇宙背景 (深藍紫色底)
    drawWorldBackground(camX, camY, SERVER_GRID_SIZE);

    ctx.save();
    ctx.translate(camX, camY);
    if (false) {

    // 畫宇宙星星
    stars.forEach(star => {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
        // 讓星星閃爍
        star.alpha += (Math.random() - 0.5) * 0.1;
        if(star.alpha > 1) star.alpha = 1;
        if(star.alpha < 0) star.alpha = 0;
    });

    // 邊界外框
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, SERVER_GRID_SIZE * GRID_SIZE, SERVER_GRID_SIZE * GRID_SIZE);

    // 網格 (改畫全域)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for(let i = 0; i <= SERVER_GRID_SIZE; i++) {
        ctx.beginPath(); ctx.moveTo(i * GRID_SIZE, 0); ctx.lineTo(i * GRID_SIZE, SERVER_GRID_SIZE * GRID_SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * GRID_SIZE); ctx.lineTo(SERVER_GRID_SIZE * GRID_SIZE, i * GRID_SIZE); ctx.stroke();
    }

    // 畫蘋果 (快過期的會閃爍)
    }

    if(state.apples) {
        let now = Date.now();
        state.apples.forEach(apple => {
            let age = now - apple.t;
            let alpha = 1;
            // 最後 5 秒開始閃爍
            if (age > 15000) {
                alpha = 0.3 + Math.abs(Math.sin(now / 150)) * 0.7;
            }
            drawNormalApple(apple, alpha);
        });
        ctx.globalAlpha = 1;
    }

    // 畫特殊果實 (無敵星星)
    if(state.specialApple) {
        drawItemBase(state.specialApple.x, state.specialApple.y, '#ffd700', '★', 'INV', 'diamond');
    }

    // 畫加速果實 (綠色閃電)
    if(state.speedApple) {
        drawItemBase(state.speedApple.x, state.speedApple.y, '#00ff88', '⚡', 'SPD', 'diamond');
    }

    // 畫毒蘋果 (紫色)
    if(state.poisonApple) {
        drawItemBase(state.poisonApple.x, state.poisonApple.y, '#cc44cc', '☠', 'REV', 'square');
    }

    // 畫磁鐵蘋果 (藍色)
    if(state.magnetApple) {
        drawItemBase(state.magnetApple.x, state.magnetApple.y, '#0088ff', 'U', 'MAG', 'circle');
    }

    // 畫炸彈蘋果 (黑色)
    if(state.bombApple) {
        drawItemBase(state.bombApple.x, state.bombApple.y, '#ff4a4a', '●', 'BOM', 'circle');
    }

    // 畫地雷
    if (state.mines) {
        let now = Date.now();
        state.mines.forEach(mine => {
            const cx = mine.x * GRID_SIZE + GRID_SIZE / 2;
            const cy = mine.y * GRID_SIZE + GRID_SIZE / 2;
            const liveColor = (Math.floor(now / 200) % 2 === 0) ? '#ff0000' : '#550000';
            ctx.save();
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ff0000';
            ctx.fillStyle = '#111111';
            ctx.beginPath();
            ctx.arc(cx, cy, GRID_SIZE/2 - 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = liveColor;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = liveColor;
            ctx.fillRect(cx - 2, cy - 2, 4, 4);
            ctx.shadowBlur = 0;
            ctx.restore();
        });
    }

    // 畫黑洞
    if (state.blackHoles) {
        let now = Date.now();
        state.blackHoles.forEach(bh => {
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#6a0dad';
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(bh.x * GRID_SIZE + GRID_SIZE/2, bh.y * GRID_SIZE + GRID_SIZE/2, bh.r * GRID_SIZE, 0, Math.PI * 2);
            ctx.fill();
            
            // 旋轉吸積盤特效
            ctx.save();
            ctx.translate(bh.x * GRID_SIZE + GRID_SIZE/2, bh.y * GRID_SIZE + GRID_SIZE/2);
            ctx.rotate(now / 500);
            ctx.strokeStyle = `rgba(138, 43, 226, ${0.5 + Math.sin(now/200)*0.5})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, bh.r * GRID_SIZE + 5, 0, Math.PI * 1.5);
            ctx.stroke();
            ctx.restore();
            ctx.shadowBlur = 0;
        });
    }

    // 設定文字樣式 (放大字體)
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";

    // 畫玩家
    for (let id in state.players) {
        let p = state.players[id];
        
        p.snake.forEach((segment, index) => {
            const renderSegment = getRenderSegment(id, index, segment, renderAlpha);
            let color = p.color;
            if (p.isSuper) {
                // 超級狀態：閃爍七彩顏色
                color = `hsl(${Math.random() * 360}, 100%, 70%)`;
            }

            ctx.fillStyle = index === 0 ? '#FFFFFF' : color;
            ctx.shadowBlur = index === 0 || p.isSuper ? 15 : 5;
            ctx.shadowColor = color;
            ctx.fillRect(renderSegment.x * GRID_SIZE + 1, renderSegment.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
            
            // 標記自己的蛇眼
            if (index === 0 && id === myId) {
                ctx.fillStyle = '#ff0000';
                ctx.shadowBlur = 0;
                ctx.fillRect(renderSegment.x * GRID_SIZE + 8, renderSegment.y * GRID_SIZE + 8, 4, 4);
            }

            // 畫皇冠和名字
            if (index === 0) {
                ctx.shadowBlur = 0;
                if (p.isKing) {
                    ctx.font = "16px sans-serif";
                    ctx.fillText("👑", segment.x * GRID_SIZE + GRID_SIZE/2, segment.y * GRID_SIZE - 5);
                    ctx.font = "bold 16px sans-serif";
                }
                ctx.fillStyle = p.isSuper ? '#ffd700' : p.color;
                ctx.fillText(p.name, renderSegment.x * GRID_SIZE + GRID_SIZE / 2, renderSegment.y * GRID_SIZE - (p.isKing ? 25 : 10));
            }
        });
        ctx.shadowBlur = 0;


    }

    ctx.restore();

    // 畫擊殺通知 (Kill Feed)
    let now = Date.now();
    if (now - lastHudUpdateAt > HUD_UPDATE_INTERVAL_MS) {
        updateMatchHud(state, now);
        lastHudUpdateAt = now;
    }
    if (myId && state.players[myId] && state.players[myId].state === 'PLAYING') {
        updateEffectToasts(state.players[myId], now);
    } else {
        previousEffectState = {};
    }

    killFeedMessages = killFeedMessages.filter(m => now - m.time < 4000);
    killFeedMessages.forEach((msg, i) => {
        let alpha = Math.max(0, 1 - (now - msg.time) / 4000);
        ctx.fillStyle = msg.color;
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(msg.msg, canvas.width - 15, 30 + i * 22);
    });
    ctx.globalAlpha = 1;

    // 道具浮動提示
    effectToasts = effectToasts.filter(t => now - t.time < 1800);
    effectToasts.forEach((toast, i) => {
        const age = now - toast.time;
        const alpha = age < 1300 ? 1 : Math.max(0, 1 - (age - 1300) / 500);
        const y = canvas.height * 0.32 + i * 34 - Math.min(age / 18, 28);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = toast.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = toast.color;
        ctx.fillText(`${toast.icon} ${toast.label}`, canvas.width / 2, y);
        ctx.restore();
    });

    // 畫出其他玩家的方向提示
    if(followedId && state.players[followedId] && state.players[followedId].state === 'PLAYING') {
        let followedSnake = getRenderSegment(followedId, 0, state.players[followedId].snake[0], renderAlpha);
        let myScreenX = followedSnake.x * GRID_SIZE + GRID_SIZE / 2 + camX;
        let myScreenY = followedSnake.y * GRID_SIZE + GRID_SIZE / 2 + camY;

        for (let id in state.players) {
            if (id === followedId) continue;
            let other = state.players[id];
            if (other.state !== 'PLAYING') continue;

            let otherHead = getRenderSegment(id, 0, other.snake[0], renderAlpha);
            let targetX = otherHead.x * GRID_SIZE + GRID_SIZE / 2 + camX;
            let targetY = otherHead.y * GRID_SIZE + GRID_SIZE / 2 + camY;

            // 如果其他玩家在畫面外，畫一個箭頭指示
            if (targetX < 0 || targetX > canvas.width || targetY < 0 || targetY > canvas.height) {
                let dx = targetX - myScreenX;
                let dy = targetY - myScreenY;
                let angle = Math.atan2(dy, dx);
                
                let dist = Math.min(canvas.width, canvas.height) / 2 - 25; // 邊緣向內 25px
                let arrowX = canvas.width / 2 + Math.cos(angle) * dist;
                let arrowY = canvas.height / 2 + Math.sin(angle) * dist;

                // 畫三角形箭頭
                ctx.save();
                ctx.translate(arrowX, arrowY);
                ctx.rotate(angle);
                ctx.fillStyle = other.color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = other.color;
                ctx.beginPath();
                ctx.moveTo(10, 0);
                ctx.lineTo(-10, -8);
                ctx.lineTo(-10, 8);
                ctx.closePath();
                ctx.fill();
                
                // 箭頭旁寫名字
                ctx.rotate(-angle);
                ctx.fillStyle = '#fff';
                ctx.shadowBlur = 0;
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(other.name, 0, 22);
                ctx.restore();
            }
        }
    }

    // 特殊效果 HUD（左下角，顯示剩餘秒數）
    if (myId && state.players[myId] && state.players[myId].state === 'PLAYING') {
        const p = state.players[myId];
        const effects = [];
        if (p.superUntil    && p.superUntil    > now) effects.push({ icon: '⭐', label: '無敵', secs: Math.ceil((p.superUntil    - now) / 1000), color: '#ffd700' });
        if (p.speedUntil    && p.speedUntil    > now) effects.push({ icon: '💨', label: '加速', secs: Math.ceil((p.speedUntil    - now) / 1000), color: '#00ff88' });
        if (p.magnetUntil   && p.magnetUntil   > now) effects.push({ icon: '🧲', label: '磁鐵', secs: Math.ceil((p.magnetUntil   - now) / 1000), color: '#0088ff' });
        if (p.reversedUntil && p.reversedUntil > now) effects.push({ icon: '☠️', label: '中毒', secs: Math.ceil((p.reversedUntil - now) / 1000), color: '#cc44cc' });
        effects.length = 0;
        activeEffectsForPlayer(p, now).forEach(effect => {
            effects.push({ icon: effect.short, label: effect.label, secs: effect.secs, color: effect.color });
        });
        effects.forEach((ef, i) => {
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillStyle = ef.color;
            ctx.shadowBlur = 8;
            ctx.shadowColor = ef.color;
            ctx.fillText(`${ef.icon} ${ef.label} ${ef.secs}s`, 10, canvas.height - 12 - i * 20);
        });
        ctx.shadowBlur = 0;
    }
}
