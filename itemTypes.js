const ITEM_TYPES = {
    specialApple: {
        stateKey: 'specialApple',
        spawnMs: 15000,
        chance: 1,
        pickupMessage: (name) => `⭐ ${name} 獲得無敵狀態！`,
        color: '#ffd700'
    },
    speedApple: {
        stateKey: 'speedApple',
        spawnMs: 20000,
        chance: 0.5,
        pickupMessage: (name) => `💨 ${name} 獲得加速狀態！`,
        color: '#00ff88'
    },
    magnetApple: {
        stateKey: 'magnetApple',
        spawnMs: 18000,
        chance: 0.5,
        pickupMessage: (name) => `🧲 ${name} 獲得磁鐵能力！`,
        color: '#0088ff'
    },
    poisonApple: {
        stateKey: 'poisonApple',
        spawnMs: 25000,
        chance: 0.5,
        pickupMessage: (name) => `☠️ ${name} 中毒了 (方向反轉)！`,
        color: '#800080'
    },
    bombApple: {
        stateKey: 'bombApple',
        spawnMs: 30000,
        chance: 0.5,
        pickupMessage: (name) => `💣 ${name} 排出了地雷！`,
        color: '#555555'
    }
};

module.exports = { ITEM_TYPES };
