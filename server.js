require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// 設定 Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
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
let apple = { x: 50, y: 50 };
const GRID_SIZE = 100;

function placeApple() {
    let valid = false;
    while (!valid) {
        apple = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
        valid = true;
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
    let scoreboardChanged = false;

    // 移動蛇與碰撞判定
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

        if (head.x === apple.x && head.y === apple.y) {
            p.score += 10;
            scoreboardChanged = true;
            placeApple();
        } else {
            p.snake.pop();
        }
    }

    // 蛇撞蛇判定
    for (let id1 in players) {
        let p1 = players[id1];
        if(p1.state !== 'PLAYING') continue;
        let head = p1.snake[0];
        let dead = false;
        for (let id2 in players) {
            let p2 = players[id2];
            if(p2.state !== 'PLAYING') continue;
            for(let i=0; i<p2.snake.length; i++) {
                if(id1 === id2 && i === 0) continue;
                if(head.x === p2.snake[i].x && head.y === p2.snake[i].y) {
                    dead = true; break;
                }
            }
            if(dead) break;
        }
        if(dead) {
            p1.state = 'DEAD';
            io.to(id1).emit('gameOver', p1.score);
        }
    }

    for (let id in players) {
        if(players[id].state === 'DEAD') {
            delete players[id];
            scoreboardChanged = true;
        }
    }

    if(scoreboardChanged) {
        io.emit('updateScoreboard', getScoreboard());
    }

    io.emit('gameState', { players, apple });

}, 120);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`伺服器已啟動於 http://localhost:${PORT}`);
});
