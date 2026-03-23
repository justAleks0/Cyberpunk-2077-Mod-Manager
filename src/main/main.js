const { app, BrowserWindow, protocol, Menu, clipboard, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { registerIpcHandlers, getModsDownloadFolder, store } = require('./ipc');
const modCustomizations = require('./mod-customizations');
const nexus = require('./nexus-api');

function parseNxmUrl(url) {
  if (!url || !url.startsWith('nxm://')) return null;
  try {
    const u = new URL(url.replace('nxm://', 'https://nxm.local/'));
    const pathParts = u.pathname.replace(/^\/+/, '').split('/');
    let modId = null;
    let fileId = null;
    const key = u.searchParams.get('key') || u.searchParams.get('nxm_key');
    const expires = u.searchParams.get('expires') || u.searchParams.get('nxm_expires');
    const game = pathParts[0] || u.hostname;
    const modIdx = pathParts.indexOf('mods');
    const fileIdx = pathParts.indexOf('files');
    if (modIdx >= 0 && pathParts[modIdx + 1]) modId = pathParts[modIdx + 1];
    if (fileIdx >= 0 && pathParts[fileIdx + 1]) fileId = pathParts[fileIdx + 1];
    if (!modId && pathParts[1]) modId = pathParts[1];
    if (!fileId && pathParts[2]) fileId = pathParts[2];
    if (game === 'cyberpunk2077' && modId && fileId) {
      return { modId, fileId, key, expires, game };
    }
    return null;
  } catch (_) {
    return null;
  }
}

function handleNxmUrl(url) {
  const parsed = parseNxmUrl(url);
  if (!parsed || parsed.game !== 'cyberpunk2077') return;
  const gamePath = store.get('gamePath');
  if (!gamePath) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:show-toast', {
        message: 'Game path not set. Set it in Options first.',
        type: 'error',
      });
    }
    return;
  }
  nexus.installFromNexus(parsed.modId, parsed.fileId, gamePath, parsed.key, parsed.expires).then((result) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nexus:nxm-install-result', result);
    }
  });
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function getAssetsBase() {
  if (isDev) return path.join(__dirname, '../../assets');
  // Packaged: assets live in app.asar.unpacked, not inside app.asar
  const base = path.join(app.getAppPath(), 'assets');
  return base.replace('app.asar', 'app.asar.unpacked');
}

function getIconPath() {
  return path.join(getAssetsBase(), 'icon.ico');
}

function registerModThumbProtocol() {
  protocol.registerFileProtocol('mod-thumb', (request, callback) => {
    const url = request.url.slice('mod-thumb://'.length);
    const match = /^([^/]+)\/(.+)$/.exec(decodeURIComponent(url));
    if (!match) {
      callback({ error: -2 });
      return;
    }
    const [, modId, filename] = match;
    if (!modId || !filename || filename.includes('..')) {
      callback({ error: -2 });
      return;
    }
    const modDir = modCustomizations.getModCustomizationsDir(modId);
    const filePath = path.join(modDir, path.basename(filename));
    if (!fs.existsSync(filePath)) {
      callback({ error: -2 });
      return;
    }
    callback({ path: filePath });
  });
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
      webviewTag: true,
    },
  });

  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  function downloadToPath(url, destPath) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https://') ? https : http;
      const parsed = new URL(url);
      const host = parsed.hostname || '';
      const isNexus = host.includes('nexusmods.com') || host.includes('staticdelivery.nexusmods.com');
      const referer = isNexus ? 'https://www.nexusmods.com/' : `${parsed.protocol}//${parsed.host}/`;
      const opts = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/*,*/*;q=0.8',
          Referer: referer,
        },
      };
      client.get(url, opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          downloadToPath(new URL(res.headers.location, url).toString(), destPath).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Download failed (${res.statusCode})`));
          return;
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on('finish', () => { out.close(() => resolve()); });
        out.on('error', reject);
      }).on('error', reject);
    });
  }

  function buildEditContextMenu(webContents, params, prependItems = []) {
    const { editFlags } = params;
    const template = [...prependItems];
    const isImage = params.mediaType === 'image' || params.srcURL;
    const isHttpImage = params.srcURL && /^https?:\/\//i.test(params.srcURL);
    if (isImage && params.srcURL) {
      if (isHttpImage) {
        template.push({ label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) });
        template.push({
          label: 'Save Image As…',
          click: async () => {
            const parsed = new URL(params.srcURL);
            const ext = path.extname(parsed.pathname) || '.png';
            const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
              defaultPath: `image${ext}`,
              filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
            });
            if (canceled || !filePath) return;
            try {
              await downloadToPath(params.srcURL, filePath);
            } catch (err) {
              const msg = err.message || 'Could not save image.';
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('app:show-toast', { message: msg, type: 'error' });
              } else {
                dialog.showErrorBox('Save Failed', msg);
              }
            }
          },
        });
      } else {
        template.push({ label: 'Copy Image', click: () => webContents.copy() });
      }
    } else if (params.isEditable) {
      if (editFlags.canCut) template.push({ label: 'Cut', click: () => webContents.cut() });
      if (editFlags.canCopy) template.push({ label: 'Copy', click: () => webContents.copy() });
      if (editFlags.canPaste) template.push({ label: 'Paste', click: () => webContents.paste() });
      template.push({ type: 'separator' });
      template.push({ label: 'Select All', click: () => webContents.selectAll() });
    } else if (params.selectionText) {
      template.push({ label: 'Copy', click: () => webContents.copy() });
    }
    if (template.length === 0) return null;
    return Menu.buildFromTemplate(template);
  }

  mainWindow.webContents.on('context-menu', async (_event, params) => {
    const handledByApp = await mainWindow.webContents.executeJavaScript(
      'typeof window.__contextMenuHandledByApp !== "undefined" && window.__contextMenuHandledByApp'
    ).catch(() => false);
    await mainWindow.webContents.executeJavaScript('delete window.__contextMenuHandledByApp').catch(() => {});
    if (handledByApp) return;
    const menu = buildEditContextMenu(mainWindow.webContents, params);
    if (menu) menu.popup({ window: mainWindow, x: params.x, y: params.y });
  });

  mainWindow.webContents.on('did-attach-webview', (_event, webContents) => {
    webContents.on('context-menu', (_ev, params) => {
      const prepend = [];
      const isHttpImage = params.srcURL && /^https?:\/\//i.test(params.srcURL);
      const hasSelection = params.selectionText && params.selectionText.trim();
      if (isHttpImage) {
        prepend.push({
          label: 'Add to mod images',
          click: () => mainWindow?.webContents?.send('mod-edit:add-image-from-url', params.srcURL),
        });
      }
      if (hasSelection) {
        if (prepend.length) prepend.push({ type: 'separator' });
        const text = params.selectionText.trim();
        prepend.push(
          { label: 'Add to mod title', click: () => mainWindow?.webContents?.send('mod-edit:set-field', { field: 'title', value: text }) },
          { label: 'Add to mod description', click: () => mainWindow?.webContents?.send('mod-edit:set-field', { field: 'description', value: text }) },
          { label: 'Add to mod tags', click: () => mainWindow?.webContents?.send('mod-edit:set-field', { field: 'tags', value: text }) }
        );
      }
      if (prepend.length) prepend.push({ type: 'separator' });
      const baseMenu = buildEditContextMenu(webContents, params, prepend);
      if (baseMenu) baseMenu.popup({ window: mainWindow, x: params.x, y: params.y });
    });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

let pendingNxmUrl = null;

app.whenReady().then(() => {
  if (process.defaultApp && process.argv.length >= 2) {
    const arg = process.argv[1];
    if (arg && arg.startsWith('nxm://')) pendingNxmUrl = arg;
  }
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on('second-instance', (_event, argv) => {
    const url = (argv || []).find((a) => a && a.startsWith('nxm://'));
    if (url) handleNxmUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.setAsDefaultProtocolClient('nxm');

  registerAssetProtocol();
  registerModThumbProtocol();
  registerIpcHandlers();

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (url && url.startsWith('nxm://')) handleNxmUrl(url);
  });

  session.defaultSession.on('will-download', (_event, item, _webContents) => {
    const modsFolder = getModsDownloadFolder();
    if (modsFolder && modsFolder.trim()) {
      const filename = item.getFilename() || 'mod.zip';
      item.setSaveDialogOptions({
        defaultPath: path.join(modsFolder, filename),
      });
    }
  });

  createWindow();

  if (pendingNxmUrl) {
    handleNxmUrl(pendingNxmUrl);
    pendingNxmUrl = null;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
