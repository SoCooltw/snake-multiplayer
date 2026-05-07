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
    restart: document.getElementById('btn-restart')
};

const scoreEl = document.getElementById('score');
const finalScoreEl = document.getElementById('final-score');

// 隱藏目前多人連線用不到的功能
document.getElementById('btn-resume-save').classList.add('hidden');
document.getElementById('btn-show-cheat').classList.add('hidden');
document.getElementById('cheat-text').classList.add('hidden');
document.getElementById('btn-settings').classList.add('hidden');
document.getElementById('btn-leaderboard').classList.add('hidden');
document.getElementById('high-score').parentElement.style.display = 'none'; // 隱藏最高分

function hideAllScreens() {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
}

// 初始化連線
const socket = io();
let myId = null;

// 當成功連線時
socket.on('connect', () => {
    myId = socket.id;
    // 顯示開始畫面
    hideAllScreens();
    screens.start.classList.remove('hidden');
});

// 點擊開始與重新開始按鈕
btns.start.addEventListener('click', () => {
    socket.emit('joinGame');
});
btns.restart.addEventListener('click', () => {
    socket.emit('joinGame');
});

// 成功加入遊戲
socket.on('joined', () => {
    hideAllScreens();
});

// 系統訊息 (如房間已滿)
socket.on('serverMessage', (msg) => {
    alert(msg);
});

// 遊戲結束
socket.on('gameOver', (score) => {
    hideAllScreens();
    finalScoreEl.textContent = score;
    screens.over.classList.remove('hidden');
});

// 更新分數
socket.on('updateScoreboard', (scores) => {
    let myData = scores.find(s => s.id === myId);
    if(myData) {
        scoreEl.textContent = myData.score;
        scoreEl.style.color = myData.color;
    } else {
        scoreEl.textContent = '0';
        scoreEl.style.color = 'inherit';
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

// 繪製遊戲畫面
socket.on('gameState', (state) => {
    // 復古黑底
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 網格
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for(let i = 0; i < 30; i++) {
        ctx.beginPath(); ctx.moveTo(i * GRID_SIZE, 0); ctx.lineTo(i * GRID_SIZE, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * GRID_SIZE); ctx.lineTo(canvas.width, i * GRID_SIZE); ctx.stroke();
    }

    // 畫蘋果
    if(state.apple) {
        ctx.fillStyle = '#ff003c'; 
        ctx.shadowBlur = 10; ctx.shadowColor = '#ff003c';
        ctx.fillRect(state.apple.x * GRID_SIZE + 2, state.apple.y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);
        ctx.shadowBlur = 0;
    }

    // 畫玩家
    for (let id in state.players) {
        let p = state.players[id];
        p.snake.forEach((segment, index) => {
            // 自己頭部亮白色，身體為專屬顏色
            ctx.fillStyle = index === 0 ? '#FFFFFF' : p.color;
            ctx.fillRect(segment.x * GRID_SIZE + 1, segment.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
            
            // 標記自己的蛇眼
            if (index === 0 && id === myId) {
                ctx.fillStyle = 'red';
                ctx.fillRect(segment.x * GRID_SIZE + 8, segment.y * GRID_SIZE + 8, 4, 4);
            }
        });
    }
});
