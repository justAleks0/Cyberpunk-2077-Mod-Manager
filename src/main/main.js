const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('./ipc');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function getAssetsBase() {
  return isDev ? path.join(__dirname, '../../assets') : path.join(app.getAppPath(), 'assets');
}

function getIconPath() {
  return path.join(getAssetsBase(), 'icon.ico');
}

function registerAssetProtocol() {
  const base = getAssetsBase();
  protocol.registerFileProtocol('app-asset', (request, callback) => {
    const url = request.url.slice('app-asset://'.length);
    const filename = path.basename(decodeURIComponent(url));
    if (!filename || filename.includes('..')) {
      callback({ error: -2 });
      return;
    }
    const filePath = path.join(base, filename);
    if (!fs.existsSync(filePath)) {
      callback({ error: -2 });
      return;
    }
    callback({ path: filePath });
  });
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  registerAssetProtocol();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
