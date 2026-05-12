require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const {
    GRID_SIZE,
    NUM_APPLES,
    MAX_PLAYERS,
    APPLE_LIFETIME,
    SPECIAL_LIFETIME,
    MINE_LIFETIME,
    BLACK_HOLE_LIFETIME,
    DIRECTION_COOLDOWN_MS,
    CHAT_COOLDOWN_MS,
    MAX_CHAT_LENGTH,
    MAX_PLAYER_NAME_LENGTH
} = require('./gameConfig');
const { ITEM_TYPES } = require('./itemTypes');

// 讓 Express 讀取靜態檔案 (禁止快取，確保玩家拿到最新版)
app.use(express.static(__dirname, {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
}));

let players = {};
let spectators = {};
let apples = [];
const chatCooldowns = {};   // socket.id -> 上次發話時間
const dirCooldowns = {};    // socket.id -> 上次方向時間

function spawnApple() {
    let newApple = {};
    const MAX_ATTEMPTS = 200;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        newApple = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE), t: Date.now() };
        let valid = true;
        for (let id in players) {
            for (let segment of players[id].snake) {
                if (segment.x === newApple.x && segment.y === newApple.y) { valid = false; break; }
            }
            if (!valid) break;
        }
        if (valid) {
            for (let a of apples) {
                if (a.x === newApple.x && a.y === newApple.y) { valid = false; break; }
            }
        }
        if (valid) return newApple;
    }
    // 地圖幾乎塞滿時，直接回傳最後一次隨機位置（避免伺服器卡死）
    return newApple;
}

for(let i=0; i<NUM_APPLES; i++) apples.push(spawnApple());

const specialItems = {
    specialApple: null,
    speedApple: null,
    magnetApple: null,
    poisonApple: null,
    bombApple: null
};

for (let item of Object.values(ITEM_TYPES)) {
    setInterval(() => {
        if (!specialItems[item.stateKey] && Object.keys(players).length > 0 && Math.random() < item.chance) {
            specialItems[item.stateKey] = { ...spawnApple() };
        }
    }, item.spawnMs);
}

let mines = [];
let blackHoles = [];
setInterval(() => {
    if (Object.keys(players).length > 0 && Math.random() < 0.3 && blackHoles.length < 2) {
        blackHoles.push({ ...spawnApple(), r: Math.random() * 2 + 2, t: Date.now() });
    }
}, 40000);

function sanitizePlayerName(userData) {
    return (userData && userData.name ? String(userData.name).trim().slice(0, MAX_PLAYER_NAME_LENGTH) : '') || 'Guest';
}

function rememberIdentity(socketId, player) {
    spectators[socketId] = {
        name: player.name,
        color: player.color
    };
}

function getSocketIdentity(socketId) {
    return players[socketId] || spectators[socketId] || { name: '觀戰者', color: '#aaaaaa' };
}

function isValidDirection(dir) {
    if (!dir) return false;
    const validValues = [-1, 0, 1];
    if (!validValues.includes(dir.dx) || !validValues.includes(dir.dy)) return false;
    if (dir.dx !== 0 && dir.dy !== 0) return false;
    return !(dir.dx === 0 && dir.dy === 0);
}

function getGameStatePayload() {
    return {
        players,
        apples,
        specialApple: specialItems.specialApple,
        speedApple: specialItems.speedApple,
        poisonApple: specialItems.poisonApple,
        magnetApple: specialItems.magnetApple,
        bombApple: specialItems.bombApple,
        mines,
        blackHoles
    };
}


io.on('connection', (socket) => {
    console.log('連線建立:', socket.id);

    socket.on('joinGame', (userData) => {
        if (Object.keys(players).length >= MAX_PLAYERS) {
            socket.emit('serverMessage', `房間已滿 (最多 ${MAX_PLAYERS} 人)！請稍後再試。`);
            return;
        }

        const playerName = sanitizePlayerName(userData);

        players[socket.id] = {
            id: socket.id,
            name: playerName,
            snake: [{x: Math.floor(Math.random()*80)+10, y: Math.floor(Math.random()*80)+10}],
            dx: 0, dy: -1,
            color: getRandomColor(),
            score: 0,
            state: 'PLAYING'
        };
        rememberIdentity(socket.id, players[socket.id]);
        players[socket.id].snake.push({x: players[socket.id].snake[0].x, y: players[socket.id].snake[0].y + 1});
        players[socket.id].snake.push({x: players[socket.id].snake[0].x, y: players[socket.id].snake[0].y + 2});

        socket.emit('joined');
        io.emit('updateScoreboard', getScoreboard());
    });

    socket.on('direction', (dir) => {
        let p = players[socket.id];
        if(!p || p.state !== 'PLAYING') return;
        // Rate limit：每 50ms 最多一次
        const now = Date.now();
        if (dirCooldowns[socket.id] && now - dirCooldowns[socket.id] < DIRECTION_COOLDOWN_MS) return;
        dirCooldowns[socket.id] = now;
        if (!isValidDirection(dir)) return;
        p.nextDir = dir;
    });

    socket.on('dash', (isDashing) => {
        let p = players[socket.id];
        if (p && p.state === 'PLAYING') p.isDashing = isDashing;
    });

    socket.on('chat', (msg) => {
        if (!msg || typeof msg !== 'string') return;
        msg = msg.trim().slice(0, MAX_CHAT_LENGTH);
        if (!msg) return;
        // Rate limit：每 1.5 秒最多一則
        const now = Date.now();
        if (chatCooldowns[socket.id] && now - chatCooldowns[socket.id] < CHAT_COOLDOWN_MS) return;
        chatCooldowns[socket.id] = now;
        const { name, color } = getSocketIdentity(socket.id);
        io.emit('chatMessage', { name, msg, color, time: now });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        delete spectators[socket.id];
        delete chatCooldowns[socket.id];
        delete dirCooldowns[socket.id];
        io.emit('updateScoreboard', getScoreboard());
    });
});

function getScoreboard() {
    let scores = [];
    for (let id in players) {
        scores.push({
            id: id,
            name: players[id].name,
            score: players[id].score,
            color: players[id].color,
            len: players[id].snake.length,
            isSuper: players[id].isSuper || false
        });
    }
    return scores.sort((a,b) => b.score - a.score);
}

function getRandomColor() {
    return `hsl(${Math.floor(Math.random() * 360)}, 100%, 60%)`;
}

let tickCount = 0;
setInterval(() => {
    tickCount++;
    let now = Date.now();
    let scoreboardChanged = false;

    // 果實過期檢查：紅蘋果過期就重新生成
    for (let i = apples.length - 1; i >= 0; i--) {
        if (now - apples[i].t > APPLE_LIFETIME) {
            apples.splice(i, 1);
            apples.push(spawnApple());
        }
    }
    for (let key in specialItems) {
        if (specialItems[key] && now - specialItems[key].t > SPECIAL_LIFETIME) {
            specialItems[key] = null;
        }
    }

    mines = mines.filter(m => now - m.t < MINE_LIFETIME);
    blackHoles = blackHoles.filter(b => now - b.t < BLACK_HOLE_LIFETIME);

    // 移動蛇與吃蘋果判定
    for (let id in players) {
        let p = players[id];
        if (p.state !== 'PLAYING') continue;

        let isFast = (p.isDashing && p.snake.length > 5) || (p.speedUntil && p.speedUntil > now);
        if (p.isDashing && p.snake.length <= 5) p.isDashing = false;

        // 慢速玩家只在偶數 tick 移動，快速玩家每 tick 移動 (tick=60ms)
        if (!isFast && tickCount % 2 !== 0) continue;

        // 衝刺代價：扣分並掉落蘋果
        if (p.isDashing && tickCount % 4 === 0) {
            let tail = p.snake.pop();
            if (apples.length < 100) apples.push({x: tail.x, y: tail.y, t: Date.now()});
            p.score = Math.max(0, p.score - 5);
            scoreboardChanged = true;
        }

        // 磁鐵效果
        if (p.magnetUntil && p.magnetUntil > now) {
            let head = p.snake[0];
            apples.forEach(a => {
                if (Math.abs(a.x - head.x) < 6 && Math.abs(a.y - head.y) < 6) {
                    if (a.x < head.x) a.x++; else if (a.x > head.x) a.x--;
                    if (a.y < head.y) a.y++; else if (a.y > head.y) a.y--;
                }
            });
        }

        // 處理方向佇列：用蛇身位置驗證，防止 180 度迴轉
        if (p.nextDir) {
            let finalDir = { dx: p.nextDir.dx, dy: p.nextDir.dy };
            // 毒蘋果效果：反向操作
            if (p.reversedUntil && p.reversedUntil > now) {
                finalDir.dx = -finalDir.dx;
                finalDir.dy = -finalDir.dy;
            }

            let neck = p.snake.length > 1 ? p.snake[1] : null;
            let futureHead = { x: p.snake[0].x + finalDir.dx, y: p.snake[0].y + finalDir.dy };
            if (!neck || futureHead.x !== neck.x || futureHead.y !== neck.y) {
                p.dx = finalDir.dx;
                p.dy = finalDir.dy;
            }
            p.nextDir = null;
        }
        let head = { x: p.snake[0].x + p.dx, y: p.snake[0].y + p.dy };

        // 黑洞引力與死亡判定
        let inBlackHole = false;
        for (let bh of blackHoles) {
            let dist = Math.sqrt(Math.pow(head.x - bh.x, 2) + Math.pow(head.y - bh.y, 2));
            if (dist < bh.r) inBlackHole = true;
            if (dist < bh.r + 6 && tickCount % 2 === 0) {
                if (head.x < bh.x) p.dx = 1; else if (head.x > bh.x) p.dx = -1;
                if (head.y < bh.y) p.dy = 1; else if (head.y > bh.y) p.dy = -1;
            }
        }

        if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE || inBlackHole) {
            p.state = 'DEAD';
            io.to(id).emit('gameOver', p.score);
            continue;
        }

        p.snake.unshift(head);

        // 吃一般蘋果
        let ateIndex = apples.findIndex(a => head.x === a.x && head.y === a.y);
        if (ateIndex !== -1) {
            p.score += 10;
            scoreboardChanged = true;
            apples.splice(ateIndex, 1);
            apples.push(spawnApple());
        } else {
            if (specialItems.specialApple && head.x === specialItems.specialApple.x && head.y === specialItems.specialApple.y) {
                p.score += 50; p.superUntil = now + 10000; specialItems.specialApple = null; scoreboardChanged = true;
                io.emit('killFeed', { msg: ITEM_TYPES.specialApple.pickupMessage(p.name), color: ITEM_TYPES.specialApple.color });
            } else if (specialItems.speedApple && head.x === specialItems.speedApple.x && head.y === specialItems.speedApple.y) {
                p.score += 30; p.speedUntil = now + 8000; specialItems.speedApple = null; scoreboardChanged = true;
                io.emit('killFeed', { msg: ITEM_TYPES.speedApple.pickupMessage(p.name), color: ITEM_TYPES.speedApple.color });
            } else if (specialItems.poisonApple && head.x === specialItems.poisonApple.x && head.y === specialItems.poisonApple.y) {
                p.reversedUntil = now + 5000; specialItems.poisonApple = null;
                io.emit('killFeed', { msg: ITEM_TYPES.poisonApple.pickupMessage(p.name), color: ITEM_TYPES.poisonApple.color });
            } else if (specialItems.magnetApple && head.x === specialItems.magnetApple.x && head.y === specialItems.magnetApple.y) {
                p.score += 20; p.magnetUntil = now + 10000; specialItems.magnetApple = null; scoreboardChanged = true;
                io.emit('killFeed', { msg: ITEM_TYPES.magnetApple.pickupMessage(p.name), color: ITEM_TYPES.magnetApple.color });
            } else if (specialItems.bombApple && head.x === specialItems.bombApple.x && head.y === specialItems.bombApple.y) {
                let tail = p.snake[p.snake.length - 1];
                mines.push({ x: tail.x, y: tail.y, t: Date.now(), owner: p.name });
                specialItems.bombApple = null;
                io.emit('killFeed', { msg: ITEM_TYPES.bombApple.pickupMessage(p.name), color: ITEM_TYPES.bombApple.color });
            } else {
                p.snake.pop(); // 沒吃到就移除尾巴
            }
        }
    }

    // 蛇撞蛇判定 (複雜吃人機制)
    let deaths = new Set();
    let eats = {};

    for (let id1 in players) {
        let p1 = players[id1];
        if(p1.state !== 'PLAYING') continue;
        let head = p1.snake[0];
        let p1Super = p1.superUntil && p1.superUntil > now;

        // 觸雷判定 (移到外層，每位玩家只判斷一次)
        for(let i=0; i<mines.length; i++) {
            if(head.x === mines[i].x && head.y === mines[i].y) {
                deaths.add(id1);
                io.emit('killFeed', { msg: `💥 ${p1.name} 踩到了地雷！`, color: '#ff0000' });
            }
        }

        for (let id2 in players) {
            let p2 = players[id2];
            if(p2.state !== 'PLAYING') continue;

            if (id1 === id2) {
                for(let i=1; i<p1.snake.length; i++) {
                    if(head.x === p1.snake[i].x && head.y === p1.snake[i].y) deaths.add(id1);
                }
                continue;
            }

            let p2Super = p2.superUntil && p2.superUntil > now;

            for(let i=0; i<p2.snake.length; i++) {
                if(head.x === p2.snake[i].x && head.y === p2.snake[i].y) {
                    if (i === 0) {
                        // 頭對撞 (只計算一次)
                        if (id1 < id2) {
                            if (p1Super && !p2Super) {
                                deaths.add(id2); eats[id1] = (eats[id1]||0) + Math.floor(p2.score/2) + 50;
                            } else if (!p1Super && p2Super) {
                                deaths.add(id1); eats[id2] = (eats[id2]||0) + Math.floor(p1.score/2) + 50;
                            } else {
                                if (p1.snake.length > p2.snake.length) {
                                    deaths.add(id2); eats[id1] = (eats[id1]||0) + Math.floor(p2.score/2) + 50;
                                } else if (p2.snake.length > p1.snake.length) {
                                    deaths.add(id1); eats[id2] = (eats[id2]||0) + Math.floor(p1.score/2) + 50;
                                } else {
                                    deaths.add(id1); deaths.add(id2);
                                }
                            }
                        }
                    } else {
                        // 撞到身體
                        if (p1Super) {
                            deaths.add(id2); eats[id1] = (eats[id1]||0) + Math.floor(p2.score/2) + 50;
                        } else {
                            deaths.add(id1);
                        }
                    }
                }
            }
        }
    }

    // 結算死亡與吃人獎勵
    for (let id in eats) {
        if (!deaths.has(id) && players[id]) {
            players[id].score += eats[id];
            // 蛇身增長 (增加 3 節)
            for(let k=0; k<3; k++) players[id].snake.push({...players[id].snake[players[id].snake.length-1]});
            scoreboardChanged = true;
        }
    }

    // 死亡掉落果實：被殺的蛇身體每隔 3 節掉落一顆蘋果
    for (let id of deaths) {
        if (players[id]) {
            let deadSnake = players[id].snake;
            for (let i = 0; i < deadSnake.length; i += 3) {
                if (apples.length < 80) {
                    apples.push({ x: deadSnake[i].x, y: deadSnake[i].y, t: Date.now() });
                }
            }
        }
    }

    for (let id of deaths) {
        if (players[id]) {
            // 找出是誰殺的 (如果有吃人獎勵)
            let killerName = null;
            for (let eid in eats) {
                if (!deaths.has(eid) && players[eid]) killerName = players[eid].name;
            }
            if (killerName) {
                io.emit('killFeed', { msg: `🐍 ${killerName} 吞噬了 ${players[id].name}！`, color: '#ff4444' });
            }
            players[id].state = 'DEAD';
            io.to(id).emit('gameOver', players[id].score);
        }
    }

    for (let id in players) {
        if(players[id].state === 'DEAD') {
            delete players[id];
            scoreboardChanged = true;
        }
    }

    // 標記 isSuper 給前端特效使用
    let highestScore = -1;
    let kingId = null;
    for (let id in players) {
        players[id].isSuper = players[id].superUntil && players[id].superUntil > now;
        players[id].isKing = false;
        if (players[id].score > highestScore && players[id].snake.length > 3) {
            highestScore = players[id].score;
            kingId = id;
        }
    }
    if (kingId) players[kingId].isKing = true;

    if(scoreboardChanged) {
        io.emit('updateScoreboard', getScoreboard());
    }

    io.emit('gameState', getGameStatePayload());

}, 60);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`伺服器已啟動於 http://localhost:${PORT}`);
});
