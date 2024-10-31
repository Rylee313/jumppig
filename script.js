const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverScreen = document.getElementById('gameOver');
const upgradeScreen = document.getElementById('upgradeScreen');

// 游戏状态
let currentLevel = 1;
let lives = 3;
let coins = 0;
let collectibles = [];
let trampolines = [];
let gameState = 'playing'; // 'playing', 'completed', 'over', 'upgrade'
let timeLeft = 60;
let combo = 0;
let lastCollectTime = 0;

// 音频系统
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function createOscillator(frequency, startTime, duration) {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    
    gainNode.gain.setValueAtTime(0.1, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
}

let isMusicPlaying = false;
let isSoundEnabled = true;
let musicInterval;

function playBackgroundMusic() {
    const notes = [262, 294, 330, 349, 392, 440, 494, 523];
    let noteIndex = 0;
    
    musicInterval = setInterval(() => {
        if (isMusicPlaying) {
            createOscillator(notes[noteIndex], audioCtx.currentTime, 0.2);
            noteIndex = (noteIndex + 1) % notes.length;
        }
    }, 300);
}

function toggleMusic() {
    isMusicPlaying = !isMusicPlaying;
    if (isMusicPlaying) {
        audioCtx.resume();
        playBackgroundMusic();
    } else {
        clearInterval(musicInterval);
    }
}

function playJumpSound() {
    if (isSoundEnabled) {
        const now = audioCtx.currentTime;
        createOscillator(600, now, 0.1);
    }
}

function playCollectSound() {
    if (isSoundEnabled) {
        const now = audioCtx.currentTime;
        createOscillator(800, now, 0.1);
    }
}

function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
}

// 收集品类
class Collectible {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 20;
        this.collected = false;
        this.floatOffset = 0;
        this.floatSpeed = 0.05;
    }

    update() {
        this.floatOffset = Math.sin(Date.now() * this.floatSpeed) * 5;
    }

    draw() {
        if (!this.collected) {
            ctx.save();
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2 + this.floatOffset;
            ctx.arc(centerX, centerY, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.strokeStyle = '#FFA500';
            ctx.lineWidth = 2;
            for (let i = 0; i < 5; i++) {
                const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
                const x = centerX + Math.cos(angle) * (this.width / 4);
                const y = centerY + Math.sin(angle) * (this.width / 4);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        }
    }
}

// 弹跳垫类
class Trampoline {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 60;
        this.height = 20;
    }

    draw() {
        ctx.fillStyle = '#FF69B4';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

// 关卡配置
const levelConfigs = {};

// 生成20个关卡
for (let i = 1; i <= 20; i++) {
    levelConfigs[i] = {
        platforms: [
            { x: 0, y: 350, width: 800, height: 50, type: 'static', color: '#2C3E50' },
            { x: 100, y: 250, width: 150, height: 20, type: 'horizontal', color: '#E74C3C' },
            { x: 300, y: 200, width: 100, height: 20, type: 'vertical', color: '#F1C40F' },
            { x: 500, y: 150, width: 100, height: 20, type: 'horizontal', color: '#E74C3C' },
            { x: 700, y: 100, width: 100, height: 20, type: 'vertical', color: '#F1C40F' }
        ],
        collectibles: [
            { x: 120, y: 200 },
            { x: 320, y: 150 },
            { x: 520, y: 100 },
            { x: 720, y: 50 },
            { x: 400, y: 300 }
        ],
        trampolines: [
            { x: 200, y: 300 },
            { x: 600, y: 250 }
        ]
    };

    // 增加难度
    levelConfigs[i].platforms.forEach(platform => {
        if (platform.type !== 'static') {
            platform.moveSpeed = 1 + (i - 1) * 0.1; // 每关增加10%的速度
        }
    });

    // 增加收集品和弹跳垫的数量
    for (let j = 0; j < Math.min(i, 5); j++) {
        levelConfigs[i].collectibles.push({ x: Math.random() * 700 + 50, y: Math.random() * 250 + 50 });
        if (j % 2 === 0) {
            levelConfigs[i].trampolines.push({ x: Math.random() * 700 + 50, y: Math.random() * 250 + 50 });
        }
    }
}

// 游戏角色
const player = {
    x: 50,
    y: 300,
    width: 40,
    height: 40,
    speed: 5,
    jumpForce: 12,
    gravity: 0.5,
    velocityY: 0,
    isJumping: false,
    direction: 1
};

// 平台类
class Platform {
    constructor(x, y, width, height, type = 'static', color = '#4ECDC4') {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type;
        this.color = color;
        this.initialX = x;
        this.initialY = y;
        this.moveSpeed = 1;
        this.moveRange = 100;
        this.moveDirection = 1;
        this.vertical = type === 'vertical';
    }

    update() {
        if (this.type === 'horizontal') {
            this.x += this.moveSpeed * this.moveDirection;
            if (Math.abs(this.x - this.initialX) > this.moveRange) {
                this.moveDirection *= -1;
            }
        } else if (this.type === 'vertical') {
            this.y += this.moveSpeed * this.moveDirection;
            if (Math.abs(this.y - this.initialY) > 50) {
                this.moveDirection *= -1;
            }
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        if (this.type !== 'static') {
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            if (this.type === 'horizontal') {
                ctx.moveTo(this.x + this.width/2 - 15, this.y + this.height/2);
                ctx.lineTo(this.x + this.width/2 + 15, this.y + this.height/2);
                ctx.lineTo(this.x + this.width/2 + (this.moveDirection > 0 ? 5 : -5), this.y + this.height/2 - 5);
                ctx.moveTo(this.x + this.width/2 + 15 *   (this.moveDirection), this.y + this.height/2);
                ctx.lineTo(this.x + this.width/2 + (this.moveDirection > 0 ? 5 : -5), this.y + this.height/2 + 5);
            } else if (this.type === 'vertical') {
                ctx.moveTo(this.x + this.width/2, this.y + this.height/2 - 15);
                ctx.lineTo(this.x + this.width/2, this.y + this.height/2 + 15);
                ctx.lineTo(this.x + this.width/2 - 5, this.y + this.height/2 + (this.moveDirection > 0 ? 5 : -5));
                ctx.moveTo(this.x + this.width/2, this.y + this.height/2 + 15 * (this.moveDirection));
                ctx.lineTo(this.x + this.width/2 + 5, this.y + this.height/2 + (this.moveDirection > 0 ? 5 : -5));
            }
            ctx.stroke();
        }
    }
}

let platforms = [];

function loadLevel(levelNumber) {
    const config = levelConfigs[levelNumber];
    if (!config) return false;

    // 调整平台移动速度
    platforms = config.platforms.map(p => new Platform(p.x, p.y, p.width, p.height, p.type, p.color));

    // 设置收集品
    collectibles = config.collectibles.map(c => new Collectible(c.x, c.y));

    // 设置弹跳垫
    trampolines = config.trampolines.map(t => new Trampoline(t.x, t.y));

    // 重置玩家位置
    player.x = 50;
    player.y = 300;
    player.velocityY = 0;

    // 重置时间
    timeLeft = 60 + (levelNumber - 1) * 5; // 每关增加5秒
    document.getElementById('timeDisplay').textContent = timeLeft;

    return true;
}

function checkLevelCompletion() {
    if (collectibles.every(c => c.collected)) {
        if (currentLevel < Object.keys(levelConfigs).length) {
            currentLevel++;
            showUpgradeScreen();
        } else {
            gameState = 'completed';
            showGameOver(true);
        }
    }
}

function showGameOver(completed = false) {
    gameOverScreen.style.display = 'block';
    const finalScore = coins;
    document.getElementById('finalScore').textContent = finalScore;

    if (completed) {
        const stars = Math.min(5, Math.floor(finalScore / 200) + 1);
        document.getElementById('gameOver').innerHTML += '<p>恭喜你完成了所有关卡！</p>';
        document.getElementById('gameOver').innerHTML += '<p>评级: ' + '★'.repeat(stars) + '☆'.repeat(5 - stars) + '</p>';
    }
}

function restartGame() {
    gameOverScreen.style.display = 'none';
    currentLevel = 1;
    lives = 3;
    coins = 0;
    gameState = 'playing';
    combo = 0;
    document.getElementById('livesDisplay').textContent = lives;
    document.getElementById('coinsDisplay').textContent = coins;
    document.getElementById('comboDisplay').textContent = combo;
    loadLevel(currentLevel);
}

function handleDeath() {
    lives--;
    document.getElementById('livesDisplay').textContent = lives;
    
    if (lives <= 0) {
        gameState = 'over';
        showGameOver(false);
    } else {
        player.x = 50;
        player.y = 300;
        player.velocityY = 0;
    }
}

// 控制
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    Space: false
};

document.addEventListener('keydown', (e) => {
    if (e.code in keys) {
        keys[e.code] = true;
        if (e.code === 'Space' && !player.isJumping) {
            playJumpSound();
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code in keys) {
        keys[e.code] = false;
    }
});

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// 绘制角色
function drawCharacter(x, y, width, height, direction) {
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    if (direction === -1) {
        ctx.scale(-1, 1);
    }
    
    // 身体（椭圆形）
    ctx.beginPath();
    ctx.fillStyle = '#FFB6C1';
    ctx.ellipse(0, 0, width/2, height/3, 0, 0, Math.PI * 2);
    ctx.fill();

    // 头部（圆形）
    ctx.beginPath();
    ctx.fillStyle = '#FFB6C1';
    ctx.arc(width/4, -height/4, width/3, 0, Math.PI * 2);
    ctx.fill();

    // 耳朵
    ctx.beginPath();
    ctx.fillStyle = '#FF69B4';
    ctx.ellipse(width/4 + width/6, -height/3, width/8, height/8, Math.PI/4, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.beginPath();
    ctx.fillStyle = '#000000';
    ctx.arc(width/4 + width/6, -height/4, 3, 0, Math.PI * 2);
    ctx.fill();

    // 鼻子
    ctx.beginPath();
    ctx.fillStyle = '#FF69B4';
    ctx.arc(width/4 + width/3, -height/4, width/10, 0, Math.PI * 2);
    ctx.fill();

    // 鼻孔
    ctx.beginPath();
    ctx.fillStyle = '#000000';
    ctx.arc(width/4 + width/3 - 2, -height/4 - 2, 1.5, 0, Math.PI * 2);
    ctx.arc(width/4 + width/3 + 2, -height/4 - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 獠牙
    ctx.beginPath();
    ctx.fillStyle = '#FFFFFF';
    ctx.moveTo(width/4 + width/4, -height/4 + height/8);
    ctx.lineTo(width/4 + width/3 + 5, -height/4 + height/6);
    ctx.lineTo(width/4 + width/3 - 5, -height/4 + height/6);
    ctx.fill();

    // 腿
    ctx.fillStyle = '#FFB6C1';
    ctx.fillRect(-width/6, height/6, width/8, height/3);
    ctx.fillRect(width/12, height/6, width/8, height/3);
    ctx.fillRect(-width/3, height/6, width/8, height/3);
    ctx.fillRect(-width/2, height/6, width/8, height/3);

    // 小卷尾巴
    ctx.beginPath();
    ctx.strokeStyle = '#FFB6C1';
    ctx.lineWidth = 4;
    ctx.moveTo(-width/2, 0);
    for(let i = 0; i <= 1; i += 0.1) {
        ctx.lineTo(
            -width/2 - Math.sin(i * 4) * width/8,
            i * height/4
        );
    }
    ctx.stroke();
    
    ctx.restore();
}

function update() {
    if (gameState !== 'playing') return;

    if (keys.ArrowLeft) {
        player.x -= player.speed;
        player.direction = -1;
    }
    if (keys.ArrowRight) {
        player.x += player.speed;
        player.direction = 1;
    }

    player.velocityY += player.gravity;
    player.y += player.velocityY;

    platforms.forEach(platform => platform.update());
    collectibles.forEach(collectible => collectible.update());

    let onPlatform = false;
    platforms.forEach(platform => {
        if (checkCollision(player, platform)) {
            if (player.y + player.height - player.velocityY <= platform.y) {
                player.y = platform.y - player.height;
                player.velocityY = 0;
                player.isJumping = false;
                onPlatform = true;

                if (platform.type === 'horizontal') {
                    player.x += platform.moveSpeed * platform.moveDirection;
                }
            }
        }
    });

    collectibles.forEach((collectible, index) => {
        if (!collectible.collected && checkCollision(player, collectible)) {
            collectible.collected = true;
            coins++;
            document.getElementById('coinsDisplay').textContent = coins;
            playCollectSound();
            updateCombo();
            checkLevelCompletion();
        }
    });

    trampolines.forEach(trampoline => {
        if (checkCollision(player, trampoline)) {
            player.velocityY = -player.jumpForce * 1.5;
            playJumpSound();
        }
    });

    if (keys.Space && !player.isJumping) {
        player.velocityY = -player.jumpForce;
        player.isJumping = true;
    }

    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
    
    if (player.y > canvas.height) {
        handleDeath();
    }
}

function updateCombo() {
    const now = Date.now();
    if (now - lastCollectTime < 2000) { // 2秒内收集
        combo++;
    } else {
        combo = 1;
    }
    lastCollectTime = now;
    document.getElementById('comboDisplay').textContent = combo;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    platforms.forEach(platform => platform.draw());
    collectibles.forEach(collectible => collectible.draw());
    trampolines.forEach(trampoline => trampoline.draw());
    drawCharacter(player.x, player.y, player.width, player.height, player.direction);
}

function updateTimer() {
    if (gameState === 'playing') {
        timeLeft--;
        if (timeLeft <= 0) {
            handleDeath();
        }
        document.getElementById('timeDisplay').textContent = timeLeft;
    }
}

// 升级系统
const upgrades = {
    jumpForce: { level: 0, cost: 5 },
    speed: { level: 0, cost: 5 }
};

function showUpgradeScreen() {
    gameState = 'upgrade';
    upgradeScreen.style.display = 'block';
    document.getElementById('currentCoins').textContent = coins;
    document.getElementById('jumpForceCost').textContent = upgrades.jumpForce.cost;
    document.getElementById('speedCost').textContent = upgrades.speed.cost;
}

function applyUpgrade(type) {
    if (coins >= upgrades[type].cost) {
        coins -= upgrades[type].cost;
        upgrades[type].level++;
        if (type === 'jumpForce') {
            player.jumpForce += 1;
        } else if (type === 'speed') {
            player.speed += 0.5;
        }
        upgrades[type].cost = Math.floor(upgrades[type].cost * 1.5);
        document.getElementById(`${type}Cost`).textContent = upgrades[type].cost;
        document.getElementById('coinsDisplay').textContent = coins;
        document.getElementById('currentCoins').textContent = coins;
    }
}

function continueGame() {
    upgradeScreen.style.display = 'none';
    gameState = 'playing';
    loadLevel(currentLevel);
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// 初始化游戏
loadLevel(currentLevel);
document.getElementById('levelDisplay').textContent = currentLevel;
document.getElementById('livesDisplay').textContent = lives;
document.getElementById('coinsDisplay').textContent = coins;

// 事件监听器
document.getElementById('musicToggle').addEventListener('click', toggleMusic);
document.getElementById('soundToggle').addEventListener('click', toggleSound);
document.getElementById('restartButton').addEventListener('click', restartGame);
document.getElementById('jumpForceUpgrade').addEventListener('click', () => applyUpgrade('jumpForce'));
document.getElementById('speedUpgrade').addEventListener('click', () => applyUpgrade('speed'));
document.getElementById('continueButton').addEventListener('click', continueGame);

window.addEventListener('click', () => {
    audioCtx.resume();
}, { once: true });

setInterval(updateTimer, 1000);
gameLoop();