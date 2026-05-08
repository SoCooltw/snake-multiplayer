require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// 設定 Session (在 Render 代理後方需要 trust proxy)
app.set('trust proxy', 1);
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // Render 提供 HTTPS
        sameSite: 'none' // 允許 Google 跨站 redirect
    }
}));

// 初始化 Passport
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => { done(null, user); });
passport.deserializeUser((user, done) => { done(null, user); });

// 設定 Google OAuth 策略
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback",
    proxy: true
  },
  function(accessToken, refreshToken, profile, cb) {
      // 擷取我們需要的資料 (名字與大頭貼)
      return cb(null, {
          id: profile.id,
          name: profile.displayName,
          picture: profile.photos[0] ? profile.photos[0].value : null
      });
  }
));

// 登入相關路由
app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  function(req, res) {
    // 登入成功後，導回首頁
    res.redirect('/');
  }
);

// 讓前端可以取得目前登入者的資訊
app.get('/api/me', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ loggedIn: true, user: req.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// 讓 Express 讀取靜態檔案
app.use(express.static(__dirname));

let players = {};
let apples = [];
const NUM_APPLES = 15;
const GRID_SIZE = 100;

function spawnApple() {
    let valid = false;
    let newApple = {};
    while (!valid) {
        newApple = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
        valid = true;
        for (let id in players) {
            for (let segment of players[id].snake) {
                if (segment.x === newApple.x && segment.y === newApple.y) valid = false;
            }
        }
        for (let a of apples) {
            if (a.x === newApple.x && a.y === newApple.y) valid = false;
        }
    }
    return newApple;
}

for(let i=0; i<NUM_APPLES; i++) apples.push(spawnApple());

let specialApple = null;
setInterval(() => {
    if (!specialApple && Object.keys(players).length > 0) {
        specialApple = spawnApple();
    }
}, 15000); // 15秒產生一顆特殊果實

io.on('connection', (socket) => {
    console.log('連線建立:', socket.id);

    socket.on('joinGame', (userData) => {
        if (Object.keys(players).length >= 4) {
            socket.emit('serverMessage', '房間已滿 (最多 4 人)！請稍後再試。');
            return;
        }

        // 如果沒有登入，預設為 Guest
        let playerName = userData && userData.name ? userData.name : 'Guest';

        players[socket.id] = {
            id: socket.id,
            name: playerName,
            snake: [{x: Math.floor(Math.random()*80)+10, y: Math.floor(Math.random()*80)+10}],
            dx: 0, dy: -1,
            color: getRandomColor(),
            score: 0,
            state: 'PLAYING'
        };
        players[socket.id].snake.push({x: players[socket.id].snake[0].x, y: players[socket.id].snake[0].y + 1});
        players[socket.id].snake.push({x: players[socket.id].snake[0].x, y: players[socket.id].snake[0].y + 2});

        socket.emit('joined');
        io.emit('updateScoreboard', getScoreboard());
    });

    socket.on('direction', (dir) => {
        let p = players[socket.id];
        if(!p || p.state !== 'PLAYING') return;
        if (p.dx !== 0 && dir.dx !== 0 && p.dx !== dir.dx) return;
        if (p.dy !== 0 && dir.dy !== 0 && p.dy !== dir.dy) return;
        p.dx = dir.dx; p.dy = dir.dy;
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updateScoreboard', getScoreboard());
    });
});

function getScoreboard() {
    let scores = [];
    for (let id in players) {
        scores.push({ id: id, name: players[id].name, score: players[id].score, color: players[id].color });
    }
    return scores.sort((a,b) => b.score - a.score);
}

function getRandomColor() {
    return `hsl(${Math.floor(Math.random() * 360)}, 100%, 60%)`;
}

setInterval(() => {
    let now = Date.now();
    let scoreboardChanged = false;

    // 移動蛇與吃蘋果判定
    for (let id in players) {
        let p = players[id];
        if (p.state !== 'PLAYING') continue;

        let head = { x: p.snake[0].x + p.dx, y: p.snake[0].y + p.dy };

        if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
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
            // 吃特殊蘋果
            if (specialApple && head.x === specialApple.x && head.y === specialApple.y) {
                p.score += 50;
                p.superUntil = now + 10000; // 無敵時間 10 秒
                specialApple = null;
                scoreboardChanged = true;
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

    for (let id of deaths) {
        if (players[id]) {
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
    for (let id in players) {
        players[id].isSuper = players[id].superUntil && players[id].superUntil > now;
    }

    if(scoreboardChanged) {
        io.emit('updateScoreboard', getScoreboard());
    }

    io.emit('gameState', { players, apples, specialApple });

}, 120);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`伺服器已啟動於 http://localhost:${PORT}`);
});
