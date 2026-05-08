const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const GRID_SIZE = 20;

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
    restart: document.getElementById('btn-restart'),
    googleLogin: document.getElementById('btn-google-login')
};

const userInfoEl = document.getElementById('user-info');
const scoreEl = document.getElementById('score');
const finalScoreEl = document.getElementById('final-score');

// 隱藏目前多人連線用不到的功能
document.getElementById('btn-resume-save').classList.add('hidden');
document.getElementById('btn-show-cheat').classList.add('hidden');
document.getElementById('cheat-text').classList.add('hidden');
document.getElementById('btn-settings').classList.add('hidden');
document.getElementById('btn-leaderboard').classList.add('hidden');
document.getElementById('high-score').parentElement.style.display = 'none';

let currentUser = null;

// 檢查使用者是否已經使用 Google 登入
fetch('/api/me')
    .then(res => res.json())
    .then(data => {
        if(data.loggedIn) {
            currentUser = data.user;
            // 隱藏登入按鈕，顯示開始遊戲按鈕
            btns.googleLogin.style.display = 'none';
            btns.start.classList.remove('hidden');
            // 顯示大頭貼與名字
            let img = currentUser.picture ? `<img src="${currentUser.picture}" style="width:24px; border-radius:50%; vertical-align:middle; margin-right:5px;">` : '';
            userInfoEl.innerHTML = `${img}歡迎, ${currentUser.name}`;
        }
    });

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

// 點擊開始與重新開始按鈕 (送出使用者資料給伺服器)
btns.start.addEventListener('click', () => {
    socket.emit('joinGame', currentUser);
});
btns.restart.addEventListener('click', () => {
    socket.emit('joinGame', currentUser);
});

socket.on('joined', () => { hideAllScreens(); });
socket.on('serverMessage', (msg) => { alert(msg); });
socket.on('gameOver', (score) => {
    hideAllScreens();
    finalScoreEl.textContent = score;
    screens.over.classList.remove('hidden');
});

// 更新分數
const liveScoreboardEl = document.getElementById('live-scoreboard');
socket.on('updateScoreboard', (scores) => {
    if(liveScoreboardEl) {
        liveScoreboardEl.innerHTML = '';
        scores.forEach(s => {
            let p = document.createElement('div');
            p.textContent = `${s.name}: ${s.score}`;
            p.style.color = s.color;
            p.style.textShadow = `0 0 5px ${s.color}`;
            p.style.padding = '2px 0';
            if(s.id === myId) p.style.fontWeight = 'bold';
            liveScoreboardEl.appendChild(p);
        });
    }
});

// 鍵盤監聽
document.addEventListener('keydown', (e) => {
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight", " "].includes(e.key)) e.preventDefault();
    let dir = null;
    switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': dir = { dx: 0, dy: -1 }; break;
        case 'ArrowDown': case 's': case 'S': dir = { dx: 0, dy: 1 }; break;
        case 'ArrowLeft': case 'a': case 'A': dir = { dx: -1, dy: 0 }; break;
        case 'ArrowRight': case 'd': case 'D': dir = { dx: 1, dy: 0 }; break;
    }
    if (dir) socket.emit('direction', dir);
});

// 初始化星星背景
let stars = [];
for (let i = 0; i < 300; i++) {
    stars.push({
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        r: Math.random() * 1.5,
        alpha: Math.random()
    });
}

// 繪製遊戲畫面
socket.on('gameState', (state) => {
    const SERVER_GRID_SIZE = 100; // 對應後端的新尺寸
    
    // 計算相機位置 (如果自己活著，跟隨自己；否則置中)
    let camX = 0;
    let camY = 0;
    let mySnake = null;
    if (myId && state.players[myId] && state.players[myId].state === 'PLAYING') {
        mySnake = state.players[myId].snake[0];
        let targetX = mySnake.x * GRID_SIZE + GRID_SIZE / 2;
        let targetY = mySnake.y * GRID_SIZE + GRID_SIZE / 2;
        camX = canvas.width / 2 - targetX;
        camY = canvas.height / 2 - targetY;
    } else {
        camX = canvas.width / 2 - (SERVER_GRID_SIZE * GRID_SIZE) / 2;
        camY = canvas.height / 2 - (SERVER_GRID_SIZE * GRID_SIZE) / 2;
    }

    // 限制相機不要超出邊界
    camX = Math.min(0, Math.max(canvas.width - SERVER_GRID_SIZE * GRID_SIZE, camX));
    camY = Math.min(0, Math.max(canvas.height - SERVER_GRID_SIZE * GRID_SIZE, camY));

    // 清空並畫上宇宙背景 (深藍紫色底)
    ctx.fillStyle = '#0b0c10'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camX, camY);

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

    // 畫蘋果
    if(state.apples) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff2a2a';
        ctx.fillStyle = '#ff2a2a'; 
        state.apples.forEach(apple => {
            ctx.fillRect(apple.x * GRID_SIZE + 2, apple.y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);
        });
        ctx.shadowBlur = 0;
    }

    // 畫特殊果實 (無敵星星)
    if(state.specialApple) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ffd700';
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(state.specialApple.x * GRID_SIZE, state.specialApple.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(state.specialApple.x * GRID_SIZE + 5, state.specialApple.y * GRID_SIZE + 5, GRID_SIZE - 10, GRID_SIZE - 10);
        ctx.shadowBlur = 0;
    }

    // 設定文字樣式 (放大字體)
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";

    // 畫玩家
    for (let id in state.players) {
        let p = state.players[id];
        
        p.snake.forEach((segment, index) => {
            let color = p.color;
            if (p.isSuper) {
                // 超級狀態：閃爍七彩顏色
                color = `hsl(${Math.random() * 360}, 100%, 70%)`;
            }

            ctx.fillStyle = index === 0 ? '#FFFFFF' : color;
            ctx.shadowBlur = index === 0 || p.isSuper ? 15 : 5;
            ctx.shadowColor = color;
            ctx.fillRect(segment.x * GRID_SIZE + 1, segment.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
            
            // 標記自己的蛇眼
            if (index === 0 && id === myId) {
                ctx.fillStyle = '#ff0000';
                ctx.shadowBlur = 0;
                ctx.fillRect(segment.x * GRID_SIZE + 8, segment.y * GRID_SIZE + 8, 4, 4);
            }
        });
        ctx.shadowBlur = 0;

        // 畫出 Google 名字在蛇的頭上 (字體加大)
        if(p.name) {
            ctx.fillStyle = '#ffffff';
            ctx.fillText(p.name, p.snake[0].x * GRID_SIZE + 10, p.snake[0].y * GRID_SIZE - 12);
        }
    }

    ctx.restore();

    // 畫出其他玩家的方向提示
    if(myId && state.players[myId] && state.players[myId].state === 'PLAYING') {
        let mySnake = state.players[myId].snake[0];
        let myScreenX = mySnake.x * GRID_SIZE + GRID_SIZE / 2 + camX;
        let myScreenY = mySnake.y * GRID_SIZE + GRID_SIZE / 2 + camY;

        for (let id in state.players) {
            if (id === myId) continue;
            let other = state.players[id];
            if (other.state !== 'PLAYING') continue;

            let otherHead = other.snake[0];
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
});
