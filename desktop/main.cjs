const { app, BrowserWindow, shell } = require('electron');

const GAME_URL = process.env.SNAKE_GAME_URL || 'https://snake-game-tw.onrender.com/';

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 640,
        backgroundColor: '#05050f',
        autoHideMenuBar: true,
        title: '貪吃蛇專題',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.loadURL(GAME_URL);

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
