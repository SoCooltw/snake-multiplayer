const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {};
let apple = { x: 15, y: 15 };
const GRID_SIZE = 30;

function placeApple() {
    let valid = false;
    while (!valid) {
        apple = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
        valid = true;
        // 確保不會生在任何人的蛇身上
        for (let id in players) {
            for (let segment of players[id].snake) {
                if (segment.x === apple.x && segment.y === apple.y) {
                    valid = false;
                }
            }
        }
    }
}

io.on('connection', (socket) => {
    console.log('玩家已連線:', socket.id);

    // 處理玩家點擊開始遊戲
    socket.on('joinGame', () => {
        if (Object.keys(players).length >= 4) {
            socket.emit('serverMessage', '房間已滿 (最多 4 人)！請稍後再試。');
            return;
        }

        // 初始化玩家狀態
        players[socket.id] = {
            id: socket.id,
            snake: [
                {x: Math.floor(Math.random()*20)+5, y: Math.floor(Math.random()*20)+5}
            ],
            dx: 0, 
            dy: -1,
            color: getRandomColor(),
            score: 0,
            state: 'PLAYING'
        };
        
        // 初始長度為 3
        players[socket.id].snake.push({x: players[socket.id].snake[0].x, y: players[socket.id].snake[0].y + 1});
        players[socket.id].snake.push({x: players[socket.id].snake[0].x, y: players[socket.id].snake[0].y + 2});

        socket.emit('joined');
        io.emit('updateScoreboard', getScoreboard());
    });

    socket.on('direction', (dir) => {
        let p = players[socket.id];
        if(!p || p.state !== 'PLAYING') return;
        
        // 防止 180 度大迴轉
        if (p.dx !== 0 && dir.dx !== 0 && p.dx !== dir.dx) return;
        if (p.dy !== 0 && dir.dy !== 0 && p.dy !== dir.dy) return;
        
        p.dx = dir.dx;
        p.dy = dir.dy;
    });

    socket.on('disconnect', () => {
        console.log('玩家斷線:', socket.id);
        delete players[socket.id];
        io.emit('updateScoreboard', getScoreboard());
    });
});

function getScoreboard() {
    let scores = [];
    for (let id in players) {
        scores.push({ id: id, score: players[id].score, color: players[id].color });
    }
    return scores.sort((a,b) => b.score - a.score);
}

function getRandomColor() {
    // 產生明亮的顏色
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 100%, 60%)`;
}

// 伺服器遊戲主迴圈
setInterval(() => {
    let scoreboardChanged = false;

    // 1. 移動所有蛇
    for (let id in players) {
        let p = players[id];
        if (p.state !== 'PLAYING') continue;

        let head = { x: p.snake[0].x + p.dx, y: p.snake[0].y + p.dy };

        // 撞牆死亡判定
        if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
            p.state = 'DEAD';
            io.to(id).emit('gameOver', p.score);
            continue;
        }

        p.snake.unshift(head);

        // 吃蘋果判定
        if (head.x === apple.x && head.y === apple.y) {
            p.score += 10;
            scoreboardChanged = true;
            placeApple();
        } else {
            p.snake.pop(); // 沒吃到蘋果，尾巴縮短 (維持長度)
        }
    }

    // 2. 蛇與蛇之間的碰撞判定 (包含撞到自己)
    for (let id1 in players) {
        let p1 = players[id1];
        if(p1.state !== 'PLAYING') continue;
        
        let head = p1.snake[0];
        let dead = false;

        for (let id2 in players) {
            let p2 = players[id2];
            if(p2.state !== 'PLAYING') continue;

            // 檢查是否撞到 p2 的身體
            for(let i=0; i<p2.snake.length; i++) {
                if(id1 === id2 && i === 0) continue; // 不能說自己頭撞自己頭
                if(head.x === p2.snake[i].x && head.y === p2.snake[i].y) {
                    dead = true;
                    break;
                }
            }
            if(dead) break;
        }

        if(dead) {
            p1.state = 'DEAD';
            io.to(id1).emit('gameOver', p1.score);
        }
    }

    // 3. 清除死亡玩家
    for (let id in players) {
        if(players[id].state === 'DEAD') {
            delete players[id];
            scoreboardChanged = true;
        }
    }

    // 如果分數有變動或有人死亡，更新排行榜
    if(scoreboardChanged) {
        io.emit('updateScoreboard', getScoreboard());
    }

    // 廣播最新畫面給所有客戶端
    io.emit('gameState', { players, apple });

}, 120); // 速度：每 120ms 更新一次

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`多人伺服器已啟動於 http://localhost:${PORT}`);
});
