/**
 * 貪吃蛇 - 期末專題 (旗艦版：含彩蛋、存檔、佈景主題)
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const GRID_SIZE = 20;
const TILE_COUNT = 30; // 600/20

// Theme Definitions for Canvas Drawing
const themeColors = {
    retro: { head: '#39ff14', body: '#2ecc71', apple: '#ff003c', gold: '#ffd700', bg: '#000', lines: 'rgba(57, 255, 20, 0.05)' },
    cyberpunk: { head: '#ff00ff', body: '#00ffff', apple: '#ffff00', gold: '#ffffff', bg: '#050011', lines: 'rgba(0, 255, 255, 0.1)' },
    classic: { head: '#ffffff', body: '#aaaaaa', apple: '#ffffff', gold: '#dddddd', bg: '#000', lines: 'rgba(255, 255, 255, 0.1)' }
};

// DOM Elements
const els = {
    title: document.getElementById('game-title'),
    score: document.getElementById('score'),
    highScore: document.getElementById('high-score'),
    finalScore: document.getElementById('final-score'),
    screens: {
        start: document.getElementById('start-screen'),
        over: document.getElementById('game-over-screen'),
        pause: document.getElementById('pause-screen'),
        settings: document.getElementById('settings-screen'),
        leaderboard: document.getElementById('leaderboard-screen')
    },
    btns: {
        start: document.getElementById('btn-start'),
        restart: document.getElementById('btn-restart'),
        resume: document.getElementById('btn-resume'),
        resumeSave: document.getElementById('btn-resume-save'),
        showCheat: document.getElementById('btn-show-cheat'),
        settings: document.getElementById('btn-settings'),
        closeSettings: document.getElementById('btn-close-settings'),
        leaderboard: document.getElementById('btn-leaderboard'),
        closeLeaderboard: document.getElementById('btn-close-leaderboard')
    },
    texts: {
        cheatText: document.getElementById('cheat-text')
    },
    inputs: {
        theme: document.getElementById('theme-select'),
        diff: document.getElementById('diff-select'),
        sound: document.getElementById('sound-toggle')
    },
    container: document.getElementById('game-container'),
    leaderboardList: document.getElementById('leaderboard-list')
};

// Audio Manager
class AudioManager {
    constructor() {
        this.enabled = true;
        this.sounds = {
            eat: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-arcade-game-jump-coin-216.mp3'),
            eatGold: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-unlock-game-notification-253.mp3'),
            over: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-arcade-retro-game-over-213.mp3'),
            hit: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-player-losing-or-failing-2042.mp3'),
            secret: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-magical-coin-win-1936.mp3')
        };
        Object.values(this.sounds).forEach(s => s.volume = 0.5);
    }
    play(name) {
        if (!this.enabled) return;
        if (this.sounds[name]) {
            this.sounds[name].currentTime = 0;
            this.sounds[name].play().catch(e => console.log('Audio error:', e));
        }
    }
}
const audio = new AudioManager();

// Particle System
class ParticleSystem {
    constructor() { this.particles = []; }
    emit(x, y, color, count = 15) {
        const px = x * GRID_SIZE + GRID_SIZE/2;
        const py = y * GRID_SIZE + GRID_SIZE/2;
        for(let i=0; i<count; i++) {
            this.particles.push({
                x: px, y: py,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1,
                decay: Math.random() * 0.05 + 0.02,
                color: color
            });
        }
    }
    updateAndDraw(ctx) {
        for(let i=this.particles.length-1; i>=0; i--) {
            let p = this.particles[i];
            p.x += p.vx; p.y += p.vy;
            p.life -= p.decay;
            if(p.life <= 0) {
                this.particles.splice(i, 1);
            } else {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life;
                ctx.fillRect(p.x, p.y, 4, 4);
                ctx.globalAlpha = 1;
            }
        }
    }
}

// Game Logic
class SnakeGame {
    constructor() {
        this.particles = new ParticleSystem();
        this.highScores = JSON.parse(localStorage.getItem('snakeHighScoresOOP')) || [];
        this.updateHighScoreDisplay();
        
        // Settings
        this.themeStr = 'retro';
        this.difficultyStr = 'normal';
        this.baseSpeed = 120;
        this.speedStep = 2;
        this.minSpeed = 50;
        
        // Load Settings from LocalStorage if any
        this.loadSettings();

        // Cheat Code status
        this.rainbowMode = false;
        this.rainbowHue = 0;

        this.reset();
        this.checkSaveFile();
    }

    reset() {
        this.snake = [{ x: 15, y: 15 }, { x: 15, y: 16 }, { x: 15, y: 17 }];
        this.dx = 0;
        this.dy = -1;
        this.score = 0;
        this.state = 'START'; // START, PLAYING, PAUSED, GAMEOVER
        this.apple = null;
        this.goldApple = null;
        this.goldTimer = 0;
        this.currentSpeed = this.baseSpeed;
        this.rainbowMode = false;
        
        els.title.classList.remove('rainbow-text');
        els.score.textContent = this.score;
        this.hideAllScreens();
        els.screens.start.classList.remove('hidden');
        this.checkSaveFile();
    }

    applySettings(theme, diff, soundEnabled) {
        this.themeStr = theme;
        document.body.setAttribute('data-theme', theme);
        
        this.difficultyStr = diff;
        audio.enabled = soundEnabled;
        if (diff === 'easy') { this.baseSpeed = 160; this.speedStep = 1; this.minSpeed = 70; }
        else if (diff === 'normal') { this.baseSpeed = 120; this.speedStep = 2; this.minSpeed = 50; }
        else if (diff === 'hard') { this.baseSpeed = 80; this.speedStep = 3; this.minSpeed = 40; }
        
        // Save settings
        localStorage.setItem('snakeSettings', JSON.stringify({theme, diff, soundEnabled}));
    }

    loadSettings() {
        const saved = localStorage.getItem('snakeSettings');
        if (saved) {
            const s = JSON.parse(saved);
            els.inputs.theme.value = s.theme;
            els.inputs.diff.value = s.diff;
            els.inputs.sound.checked = s.soundEnabled;
            this.applySettings(s.theme, s.diff, s.soundEnabled);
        }
    }

    start() {
        this.reset();
        this.placeApple();
        this.state = 'PLAYING';
        this.currentSpeed = this.baseSpeed;
        this.hideAllScreens();
        // Clear old save when starting new
        localStorage.removeItem('snakeSavedGameOOP');
        this.loop();
    }

    pause() {
        if (this.state === 'PLAYING') {
            this.state = 'PAUSED';
            els.screens.pause.classList.remove('hidden');
            this.saveState(); // Auto save on pause
        } else if (this.state === 'PAUSED') {
            this.state = 'PLAYING';
            els.screens.pause.classList.add('hidden');
            this.loop();
        }
    }

    gameOver() {
        this.state = 'GAMEOVER';
        audio.play('over');
        els.finalScore.textContent = this.score;
        els.screens.over.classList.remove('hidden');
        
        els.container.classList.add('shake');
        setTimeout(() => els.container.classList.remove('shake'), 500);

        this.saveHighScore();
        localStorage.removeItem('snakeSavedGameOOP'); // Clear save on death
    }

    // Save & Load System
    saveState() {
        if (this.state === 'GAMEOVER' || this.state === 'START') return;
        const stateData = {
            snake: this.snake, dx: this.dx, dy: this.dy, score: this.score,
            apple: this.apple, goldApple: this.goldApple, goldTimer: this.goldTimer,
            currentSpeed: this.currentSpeed, rainbowMode: this.rainbowMode
        };
        localStorage.setItem('snakeSavedGameOOP', JSON.stringify(stateData));
    }

    loadState() {
        const saved = localStorage.getItem('snakeSavedGameOOP');
        if (saved) {
            const s = JSON.parse(saved);
            this.snake = s.snake; this.dx = s.dx; this.dy = s.dy;
            this.score = s.score; this.apple = s.apple;
            this.goldApple = s.goldApple; this.goldTimer = s.goldTimer;
            this.currentSpeed = s.currentSpeed; this.rainbowMode = s.rainbowMode;
            
            if(this.rainbowMode) els.title.classList.add('rainbow-text');
            els.score.textContent = this.score;
            this.state = 'PLAYING';
            this.hideAllScreens();
            this.loop();
        }
    }

    checkSaveFile() {
        if (localStorage.getItem('snakeSavedGameOOP') && this.state === 'START') {
            els.btns.resumeSave.classList.remove('hidden');
        } else {
            els.btns.resumeSave.classList.add('hidden');
        }
    }

    saveHighScore() {
        if (this.score > 0) {
            this.highScores.push({ score: this.score, date: new Date().toLocaleDateString() });
            this.highScores.sort((a, b) => b.score - a.score);
            this.highScores = this.highScores.slice(0, 5);
            localStorage.setItem('snakeHighScoresOOP', JSON.stringify(this.highScores));
            this.updateHighScoreDisplay();
        }
    }

    updateHighScoreDisplay() {
        els.highScore.textContent = this.highScores.length > 0 ? this.highScores[0].score : 0;
    }

    hideAllScreens() {
        Object.values(els.screens).forEach(s => s.classList.add('hidden'));
    }

    isOccupied(x, y, includeHead = true) {
        const startIdx = includeHead ? 0 : 1;
        for (let i = startIdx; i < this.snake.length; i++) {
            if (this.snake[i].x === x && this.snake[i].y === y) return true;
        }
        return false;
    }

    placeApple() {
        let valid = false;
        while (!valid) {
            this.apple = { x: Math.floor(Math.random() * TILE_COUNT), y: Math.floor(Math.random() * TILE_COUNT) };
            if (!this.isOccupied(this.apple.x, this.apple.y)) valid = true;
        }

        if (!this.goldApple && Math.random() < 0.15) {
            valid = false;
            while (!valid) {
                this.goldApple = { x: Math.floor(Math.random() * TILE_COUNT), y: Math.floor(Math.random() * TILE_COUNT) };
                if (!this.isOccupied(this.goldApple.x, this.goldApple.y) && 
                    (this.goldApple.x !== this.apple.x || this.goldApple.y !== this.apple.y)) {
                    valid = true;
                }
            }
            this.goldTimer = 40; 
        }
    }

    activateRainbowMode() {
        audio.play('secret');
        this.rainbowMode = true;
        els.title.classList.add('rainbow-text');
        this.score += 1000;
        els.score.textContent = this.score;
        this.particles.emit(canvas.width/2/GRID_SIZE, canvas.height/2/GRID_SIZE, '#ffffff', 50); // Big explosion
    }

    update() {
        if (this.state !== 'PLAYING') return;

        if (this.rainbowMode) {
            this.rainbowHue = (this.rainbowHue + 10) % 360;
        }

        let nextX = this.snake[0].x + this.dx;
        let nextY = this.snake[0].y + this.dy;

        // Auto-turn on wall collision
        if (nextX < 0 || nextX >= TILE_COUNT || nextY < 0 || nextY >= TILE_COUNT) {
            if (this.dx !== 0) { // Moving horizontally
                let dir1 = { dx: 0, dy: 1 };
                let dir2 = { dx: 0, dy: -1 };
                if (this.snake[0].y > TILE_COUNT / 2) [dir1, dir2] = [dir2, dir1]; 
                
                let testX = this.snake[0].x + dir1.dx; let testY = this.snake[0].y + dir1.dy;
                if (!this.isOccupied(testX, testY) && testX>=0 && testX<TILE_COUNT && testY>=0 && testY<TILE_COUNT) {
                    this.dx = dir1.dx; this.dy = dir1.dy;
                } else {
                    this.dx = dir2.dx; this.dy = dir2.dy;
                }
            } else { // Moving vertically
                let dir1 = { dx: 1, dy: 0 };
                let dir2 = { dx: -1, dy: 0 };
                if (this.snake[0].x > TILE_COUNT / 2) [dir1, dir2] = [dir2, dir1];
                
                let testX = this.snake[0].x + dir1.dx; let testY = this.snake[0].y + dir1.dy;
                if (!this.isOccupied(testX, testY) && testX>=0 && testX<TILE_COUNT && testY>=0 && testY<TILE_COUNT) {
                    this.dx = dir1.dx; this.dy = dir1.dy;
                } else {
                    this.dx = dir2.dx; this.dy = dir2.dy;
                }
            }
            // Recalculate
            nextX = this.snake[0].x + this.dx;
            nextY = this.snake[0].y + this.dy;
            
            // Re-check out of bounds (corner trap)
            if (nextX < 0 || nextX >= TILE_COUNT || nextY < 0 || nextY >= TILE_COUNT) {
                this.dx = -this.dx; this.dy = -this.dy;
                nextX = this.snake[0].x + this.dx; nextY = this.snake[0].y + this.dy;
            }
        }

        const head = { x: nextX, y: nextY };

        // Check Self collision (unless rainbow mode makes you invincible? Let's just keep self collision)
        for (let i = 0; i < this.snake.length; i++) {
            if (head.x === this.snake[i].x && head.y === this.snake[i].y) {
                audio.play('hit');
                return this.gameOver();
            }
        }

        this.snake.unshift(head);

        // Check Apple eaten
        let ate = false;
        let cColors = themeColors[this.themeStr];

        if (head.x === this.apple.x && head.y === this.apple.y) {
            this.score += 10;
            audio.play('eat');
            this.particles.emit(this.apple.x, this.apple.y, this.rainbowMode ? `hsl(${this.rainbowHue},100%,50%)` : cColors.apple);
            ate = true;
        } 
        else if (this.goldApple && head.x === this.goldApple.x && head.y === this.goldApple.y) {
            this.score += 30;
            audio.play('eatGold');
            this.particles.emit(this.goldApple.x, this.goldApple.y, cColors.gold, 30);
            this.goldApple = null;
            ate = true;
        }

        if (ate) {
            els.score.textContent = this.score;
            this.currentSpeed = Math.max(this.minSpeed, this.currentSpeed - this.speedStep);
            this.placeApple();
            this.saveState(); // Save silently on progress
        } else {
            this.snake.pop(); 
        }

        if (this.goldApple) {
            this.goldTimer--;
            if (this.goldTimer <= 0) this.goldApple = null;
        }
    }

    draw() {
        const cTheme = themeColors[this.themeStr];
        
        ctx.fillStyle = cTheme.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = cTheme.lines;
        ctx.lineWidth = 1;
        for(let i = 0; i < TILE_COUNT; i++) {
            ctx.beginPath(); ctx.moveTo(i * GRID_SIZE, 0); ctx.lineTo(i * GRID_SIZE, canvas.height); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i * GRID_SIZE); ctx.lineTo(canvas.width, i * GRID_SIZE); ctx.stroke();
        }

        // Draw snake
        this.snake.forEach((segment, index) => {
            if (this.rainbowMode) {
                ctx.fillStyle = `hsl(${(this.rainbowHue + index*5) % 360}, 100%, 50%)`;
            } else {
                ctx.fillStyle = index === 0 ? cTheme.head : cTheme.body;
            }
            ctx.fillRect(segment.x * GRID_SIZE + 1, segment.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
            
            // Eyes
            if (index === 0) {
                ctx.fillStyle = (this.themeStr === 'classic') ? '#000' : '#000'; // always black eyes for contrast
                const eyeSize = 4;
                let eyeX1, eyeY1, eyeX2, eyeY2;
                if (this.dx === 1) { eyeX1=segment.x*GRID_SIZE+12; eyeY1=segment.y*GRID_SIZE+4; eyeX2=segment.x*GRID_SIZE+12; eyeY2=segment.y*GRID_SIZE+12; } 
                else if (this.dx === -1) { eyeX1=segment.x*GRID_SIZE+4; eyeY1=segment.y*GRID_SIZE+4; eyeX2=segment.x*GRID_SIZE+4; eyeY2=segment.y*GRID_SIZE+12; } 
                else if (this.dy === 1) { eyeX1=segment.x*GRID_SIZE+4; eyeY1=segment.y*GRID_SIZE+12; eyeX2=segment.x*GRID_SIZE+12; eyeY2=segment.y*GRID_SIZE+12; } 
                else { eyeX1=segment.x*GRID_SIZE+4; eyeY1=segment.y*GRID_SIZE+4; eyeX2=segment.x*GRID_SIZE+12; eyeY2=segment.y*GRID_SIZE+4; }
                ctx.fillRect(eyeX1, eyeY1, eyeSize, eyeSize);
                ctx.fillRect(eyeX2, eyeY2, eyeSize, eyeSize);
            }
        });

        // Draw apple
        if (this.apple) {
            ctx.fillStyle = cTheme.apple;
            ctx.shadowBlur = 10; ctx.shadowColor = cTheme.apple;
            ctx.fillRect(this.apple.x * GRID_SIZE + 2, this.apple.y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);
            ctx.shadowBlur = 0;
            // Stem
            ctx.fillStyle = cTheme.head;
            ctx.fillRect(this.apple.x * GRID_SIZE + 8, this.apple.y * GRID_SIZE, 4, 4);
        }

        // Draw Gold Apple
        if (this.goldApple) {
            if (this.goldTimer > 10 || this.goldTimer % 2 === 0) {
                ctx.fillStyle = cTheme.gold;
                ctx.shadowBlur = 15; ctx.shadowColor = cTheme.gold;
                ctx.fillRect(this.goldApple.x * GRID_SIZE + 2, this.goldApple.y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);
                ctx.shadowBlur = 0;
            }
        }

        this.particles.updateAndDraw(ctx);
    }

    loop() {
        if (this.state !== 'PLAYING') return;
        this.update();
        this.draw();
        setTimeout(() => this.loop(), this.currentSpeed);
    }

    setInput(newDx, newDy) {
        if (this.state !== 'PLAYING') return;
        if (this.dx !== 0 && newDx !== 0 && this.dx !== newDx) return;
        if (this.dy !== 0 && newDy !== 0 && this.dy !== newDy) return;
        this.dx = newDx; this.dy = newDy;
    }

    renderLeaderboard() {
        els.leaderboardList.innerHTML = '';
        if (this.highScores.length === 0) {
            els.leaderboardList.innerHTML = '<li>暫無紀錄</li>';
            return;
        }
        this.highScores.forEach((entry) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${entry.score} 分</span> (${entry.date})`;
            els.leaderboardList.appendChild(li);
        });
    }
}

const game = new SnakeGame();
game.draw(); // Initial draw with current theme

// Konami Code Logic
const konamiCode = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiIndex = 0;

document.addEventListener('keydown', (e) => {
    // Cheat code check
    if (e.key === konamiCode[konamiIndex] || e.key.toLowerCase() === konamiCode[konamiIndex].toLowerCase()) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
            game.activateRainbowMode();
            konamiIndex = 0;
        }
    } else {
        konamiIndex = 0;
    }

    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight", " "].includes(e.key)) e.preventDefault();

    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        game.pause();
        return;
    }

    if (game.state !== 'PLAYING') {
        if (e.key === ' ' || e.key === 'Enter') {
            if (game.state === 'START' || game.state === 'GAMEOVER') game.start();
        }
        return;
    }

    switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': game.setInput(0, -1); break;
        case 'ArrowDown': case 's': case 'S': game.setInput(0, 1); break;
        case 'ArrowLeft': case 'a': case 'A': game.setInput(-1, 0); break;
        case 'ArrowRight': case 'd': case 'D': game.setInput(1, 0); break;
    }
});

// Touch controls removed by request

// Buttons
els.btns.start.addEventListener('click', () => game.start());
els.btns.resumeSave.addEventListener('click', () => game.loadState());
els.btns.restart.addEventListener('click', () => game.start());
els.btns.resume.addEventListener('click', () => game.pause());
els.btns.showCheat.addEventListener('click', () => els.texts.cheatText.classList.toggle('hidden'));

// Settings
els.btns.settings.addEventListener('click', () => {
    game.hideAllScreens();
    els.screens.settings.classList.remove('hidden');
    game.state = 'SETTINGS';
});
els.btns.closeSettings.addEventListener('click', () => {
    game.applySettings(els.inputs.theme.value, els.inputs.diff.value, els.inputs.sound.checked);
    game.reset(); 
});

// Leaderboard
els.btns.leaderboard.addEventListener('click', () => {
    game.hideAllScreens();
    game.renderLeaderboard();
    els.screens.leaderboard.classList.remove('hidden');
    game.state = 'LEADERBOARD';
});
els.btns.closeLeaderboard.addEventListener('click', () => {
    game.reset();
});
