const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { dialog, shell } = require('electron');
const { GAME_LAUNCHER_EXE, GAME_FALLBACK_EXE } = require('../shared/constants');
const Store = require('electron-store');
const { detectGamePath, validateGamePath } = require('./game-detection');
const modRegistry = require('./mod-registry');
const { installFromZip, installFromArchive, installFoundationalMods, getFoundationalModsPath } = require('./install');
const loadOrder = require('./load-order');
const profiles = require('./profiles');
const deps = require('./deps');
const { resetInstallToVanilla } = require('./reset-install');
const modCustomizations = require('./mod-customizations');
const { inspectArchive } = require('./archive-inspect');
const modConflicts = require('./mod-conflicts');
const modGroups = require('./mod-groups');
const ai = require('./ai');
const nexus = require('./nexus-api');

function extFromContentType(contentType) {
  const t = String(contentType || '').toLowerCase();
  if (t.includes('image/jpeg') || t.includes('image/jpg')) return '.jpg';
  if (t.includes('image/png')) return '.png';
  if (t.includes('image/gif')) return '.gif';
  if (t.includes('image/webp')) return '.webp';
  return '';
}

function downloadImageToTemp(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects while downloading image.'));
      return;
    }
    const parsed = new URL(url);
    const host = parsed.hostname || '';
    const isNexus = host.includes('nexusmods.com') || host.includes('staticdelivery.nexusmods.com');
    const referer = isNexus ? 'https://www.nexusmods.com/' : `${parsed.protocol}//${parsed.host}/`;
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: referer,
      },
    };
    const client = String(url).startsWith('https://') ? https : http;
    client.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirected = new URL(res.headers.location, url).toString();
        res.resume();
        downloadImageToTemp(redirected, redirects + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Image download failed (${res.statusCode}).`));
        return;
      }
      const contentType = res.headers['content-type'] || '';
      if (!String(contentType).toLowerCase().startsWith('image/')) {
        res.resume();
        reject(new Error('Dropped URL is not an image.'));
        return;
      }
      const urlExt = path.extname(parsed.pathname || '').toLowerCase();
      const ext = urlExt || extFromContentType(contentType) || '.png';
      const tempPath = path.join(os.tmpdir(), `cp2077-mod-image-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
      const out = fs.createWriteStream(tempPath);
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => resolve(tempPath));
      });
      out.on('error', (err) => reject(err));
    }).on('error', reject);
  });
}

const PREDEFINED_CATEGORIES = [
  'Character',
  'Gameplay',
  'Visual',
  'Framework',
  'Audio',
  'UI',
  'Uncategorized',
];

const store = new Store({
  name: 'cp2077-mod-manager',
  defaults: {
    gamePath: null,
    modsDownloadFolder: null,
    foundationalModsPath: null,
    userCategories: [],
  },
});

/** Default mods folder in AppData. Created on first use. */
function getDefaultModsFolder() {
  return path.join(app.getPath('userData'), 'Mods');
}

/** Resolve mods download folder: custom path if set, else default. Ensures folder exists. */
function getModsDownloadFolder() {
  const custom = store.get('modsDownloadFolder');
  const folder = custom ? path.normalize(custom) : getDefaultModsFolder();
  try {
    fs.mkdirSync(folder, { recursive: true });
  } catch (_) {}
  return folder;
}

function registerIpcHandlers() {
  // ----- Game -----
  ipcMain.handle('game:get-path', () => store.get('gamePath'));

  ipcMain.handle('game:set-path', (_, newPath) => {
    const result = validateGamePath(newPath);
    if (result.valid) {
      store.set('gamePath', path.normalize(newPath));
      return { ok: true };
    }
    return { ok: false, error: result.error };
  });

  ipcMain.handle('game:detect', () => {
    const { found, checked } = detectGamePath();
    if (found) {
      store.set('gamePath', found);
      return { ok: true, path: found, checked };
    }
    return { ok: false, checked };
  });

  ipcMain.handle('game:select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Cyberpunk 2077 game folder',
      properties: ['openDirectory'],
      message: "The app couldn't auto-detect the game. Please select its location.",
    });
    if (canceled || !filePaths?.length) return { canceled: true };
    const result = validateGamePath(filePaths[0]);
    if (result.valid) {
      store.set('gamePath', path.normalize(filePaths[0]));
      return { ok: true, path: filePaths[0] };
    }
    return { ok: false, error: result.error };
  });

  ipcMain.handle('game:open-folder', async () => {
    const gamePath = store.get('gamePath');
    if (!gamePath || !fs.existsSync(gamePath)) {
      return { ok: false, error: 'Game path not set or invalid.' };
    }
    try {
      await shell.openPath(gamePath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('game:open-mods-folder', async () => {
    const gamePath = store.get('gamePath');
    if (!gamePath || !fs.existsSync(gamePath)) {
      return { ok: false, error: 'Game path not set or invalid.' };
    }
    const modsPath = path.join(gamePath, 'archive', 'pc', 'mod');
    const altPath = path.join(gamePath, 'mods');
    const target = fs.existsSync(modsPath) ? modsPath : altPath;
    try {
      await shell.openPath(target);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('game:launch', () => {
    const gamePath = store.get('gamePath');
    if (!gamePath || !fs.existsSync(gamePath)) {
      return { ok: false, error: 'Game path not set or invalid.' };
    }
    const launcherPath = path.join(gamePath, GAME_LAUNCHER_EXE);
    const fallbackPath = path.join(gamePath, GAME_FALLBACK_EXE);
    const exePath = fs.existsSync(launcherPath) ? launcherPath : fs.existsSync(fallbackPath) ? fallbackPath : null;
    if (!exePath) {
      return { ok: false, error: `Could not find ${GAME_LAUNCHER_EXE} or ${GAME_FALLBACK_EXE} in game folder.` };
    }
    try {
      spawn(exePath, [], { cwd: gamePath, detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Failed to launch game.' };
    }
  });

  // ----- Settings (paths) -----
  ipcMain.handle('settings:get', (_, key) => store.get(key));

  ipcMain.handle('assets:get-background-artwork', () => {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    const candidates = [];
    if (isDev) {
      candidates.push(path.join(__dirname, '../../assets', 'background-art.jpg'));
    } else {
      const resourcesDir = process.resourcesPath || path.dirname(app.getAppPath());
      candidates.push(path.join(resourcesDir, 'app.asar.unpacked', 'assets', 'background-art.jpg'));
      candidates.push(path.join(path.dirname(app.getAppPath()), 'app.asar.unpacked', 'assets', 'background-art.jpg'));
      candidates.push(path.join(app.getAppPath(), 'assets', 'background-art.jpg'));
    }
    const filePath = candidates.find((p) => fs.existsSync(p));
    if (!filePath) return null;
    try {
      const buf = fs.readFileSync(filePath);
      const base64 = buf.toString('base64');
      return `data:image/jpeg;base64,${base64}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle('settings:set', (_, key, value) => {
    store.set(key, value);
    return true;
  });

  ipcMain.handle('settings:get-download-folder', () => getModsDownloadFolder());
  ipcMain.handle('settings:set-download-folder', (_, value) => {
    store.set('modsDownloadFolder', value ?? null);
    return true;
  });

  ipcMain.handle('settings:reset-download-folder-to-default', () => {
    store.set('modsDownloadFolder', null);
    return getModsDownloadFolder();
  });

  ipcMain.handle('settings:select-download-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select folder for mod archives',
      properties: ['openDirectory'],
      message: 'Choose a folder where you keep downloaded mod archives (.zip/.7z/.rar).',
    });
    if (canceled || !filePaths?.length) return { canceled: true };
    store.set('modsDownloadFolder', path.normalize(filePaths[0]));
    return { ok: true, path: filePaths[0] };
  });

  // ----- Mods -----
  ipcMain.handle('mods:list', () => {
    const gamePath = store.get('gamePath');
    const mods = modRegistry.getMods(gamePath || '');
    const customAll = modCustomizations.loadAll();
    const groups = modGroups.getGroups();
    const groupByMod = new Map();
    for (const g of groups) {
      for (const mid of g.modIds) {
        groupByMod.set(mid, g);
      }
    }
    return mods.map((mod) => {
      const custom = customAll[mod.id];
      const group = groupByMod.get(mod.id) || null;
      let out = { ...mod };
      if (custom) {
        out.customName = custom.customName;
        out.customDescription = custom.description;
        out.customTags = custom.tags;
        out.customImages = custom.images;
        out.customCategory = custom.category;
        out.nexusModId = custom.nexusModId;
        out.nexusUrl = custom.nexusUrl;
        out.parentModId = custom.parentModId;
        out.childAddonName = custom.childAddonName;
        out.childAddonDescription = custom.childAddonDescription;
      }
      if (group) out.group = { id: group.id, name: group.name, type: group.type };
      return out;
    });
  });

  ipcMain.handle('categories:get', () => ({
    predefined: [...PREDEFINED_CATEGORIES],
    user: store.get('userCategories') || [],
  }));

  ipcMain.handle('categories:add', (_, name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    const user = store.get('userCategories') || [];
    if (user.includes(trimmed)) return true;
    store.set('userCategories', [...user, trimmed]);
    return true;
  });

  ipcMain.handle('mods:enable', (_, modId) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    return modRegistry.enableMod(modId, gamePath);
  });

  ipcMain.handle('mods:disable', (_, modId) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    return modRegistry.disableMod(modId, gamePath);
  });

  ipcMain.handle('mods:uninstall', (_, modId) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    return modRegistry.uninstallMod(modId, gamePath);
  });

  ipcMain.handle('mods:push', () => {
    const gamePath = store.get('gamePath');
    if (!gamePath || !fs.existsSync(gamePath)) {
      return { ok: false, error: 'Game path not set or invalid.' };
    }
    const mods = modRegistry.getMods(gamePath);
    try {
      for (const mod of mods) {
        if (mod.enabled) {
          const r = modRegistry.enableMod(mod.id, gamePath);
          if (!r.ok) return r;
        } else {
          const r = modRegistry.disableMod(mod.id, gamePath);
          if (!r.ok) return r;
        }
      }
      const order = loadOrder.getArchiveLoadOrder(gamePath);
      const orderResult = loadOrder.setArchiveLoadOrder(gamePath, order);
      if (!orderResult.ok) return orderResult;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Push failed.' };
    }
  });

  ipcMain.handle('mods:install-from-file', async (_, archivePath) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    return installFromArchive(archivePath, gamePath);
  });

  ipcMain.handle('mods:show-install-picker', async () => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { needGamePath: true };
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select mod archive',
      properties: ['openFile'],
      filters: [{ name: 'Archives', extensions: ['zip', '7z', 'rar'] }],
    });
    if (canceled || !filePaths?.length) return { canceled: true };
    const archivePath = filePaths[0];
    const ext = path.extname(archivePath).toLowerCase();
    if (!['.zip', '.7z', '.rar'].includes(ext)) {
      const info = await inspectArchive(archivePath);
      return {
        ok: false,
        error: 'Unsupported format. Use .zip, .7z, or .rar.',
        preview: info,
        archivePath,
      };
    }
    return installFromArchive(archivePath, gamePath);
  });

  ipcMain.handle('mods:install-foundational', async () => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    return installFoundationalMods(gamePath);
  });

  ipcMain.handle('mods:get-foundational-path', () => getFoundationalModsPath());

  ipcMain.handle('mods:list-foundational', () => {
    const { ARCHIVE_EXTENSIONS } = require('../shared/constants');
    const base = getFoundationalModsPath();
    if (!fs.existsSync(base)) return { path: base, files: [] };
    const names = fs.readdirSync(base);
    const files = names
      .filter((n) => ARCHIVE_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext)))
      .map((n) => ({ name: n, fullPath: path.join(base, n) }));
    return { path: base, files };
  });

  ipcMain.handle('mods:inspect-archive', async (_, archivePath) => inspectArchive(archivePath));

  ipcMain.handle('mods:check-download-folder', () => {
    const folder = getModsDownloadFolder();
    if (!folder || !fs.existsSync(folder)) return { pending: [], folder: folder || null };
    const names = fs.readdirSync(folder);
    const exts = ['.zip', '.7z', '.rar'];
    const pending = names.filter((n) => exts.some((e) => n.toLowerCase().endsWith(e)) && !modRegistry.isAlreadyInstalled(n));
    return { pending: pending.map((n) => path.join(folder, n)), folder };
  });

  ipcMain.handle('mods:install-from-path', async (_, archivePath) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    return installFromArchive(archivePath, gamePath);
  });

  ipcMain.handle('groups:list', () => modGroups.getGroups());
  ipcMain.handle('groups:create', (_, name, type, modIds) => modGroups.createGroup(name, type, modIds));
  ipcMain.handle('groups:update', (_, groupId, updates) => modGroups.updateGroup(groupId, updates));
  ipcMain.handle('groups:delete', (_, groupId) => modGroups.deleteGroup(groupId));
  ipcMain.handle('groups:add-mod', (_, groupId, modId) => modGroups.addModToGroup(groupId, modId));
  ipcMain.handle('groups:remove-mod', (_, groupId, modId) => modGroups.removeModFromGroup(groupId, modId));
  ipcMain.handle('groups:get-for-mod', (_, modId) => modGroups.getGroupForMod(modId));
  ipcMain.handle('groups:suggest', () => {
    const gamePath = store.get('gamePath');
    const rawMods = modRegistry.getMods(gamePath || '');
    const customAll = modCustomizations.loadAll();
    const mods = rawMods.map((mod) => {
      const custom = customAll[mod.id];
      if (!custom) return mod;
      return { ...mod, customName: custom.customName, customDescription: custom.description, customCategory: custom.category, customTags: custom.tags };
    });
    return modGroups.suggestRelatedMods(mods, gamePath);
  });
  ipcMain.handle('groups:apply-to-group', (_, groupId, data) => {
    const apply = (modId, d) => {
      const existing = modCustomizations.getCustomization(modId);
      const merged = { ...existing };
      if (d.category !== undefined) merged.category = d.category;
      if (d.tags !== undefined && Array.isArray(d.tags)) {
        const existingTags = existing.tags || [];
        merged.tags = [...new Set([...existingTags, ...d.tags])];
      }
      modCustomizations.setCustomization(modId, merged);
    };
    return modGroups.applyToGroup(groupId, data, apply);
  });

  ipcMain.handle('mods:check-conflicts', () => {
    const gamePath = store.get('gamePath');
    const mods = modRegistry.getMods(gamePath || '');
    return modConflicts.detectConflicts(mods);
  });

  ipcMain.handle('mods:resolve-conflict', (_, conflict, choice) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    return modConflicts.resolveConflict(gamePath, conflict, choice);
  });

  ipcMain.handle('mods:show-files-in-explorer', (_, modId) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    const mods = modRegistry.getMods(gamePath);
    const mod = mods.find((m) => m.id === modId);
    if (!mod) return { ok: false, error: 'Mod not found' };
    const base = mod.enabled ? gamePath : modRegistry.getStashPath(modId);
    for (const rel of mod.files || []) {
      const full = path.join(base, rel);
      if (fs.existsSync(full)) {
        shell.showItemInFolder(full);
        return { ok: true };
      }
    }
    return { ok: false, error: 'No tracked files found on disk for this mod.' };
  });

  ipcMain.handle('mods:reset-install', () => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    return resetInstallToVanilla(gamePath);
  });

  ipcMain.handle('mods:dump-all-to-folder', async () => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select folder for mod dump',
      properties: ['openDirectory'],
      message: 'Choose a folder. All mod files (archive, bin, r6, red4ext, mods) will be extracted here. Existing files may be overwritten.',
    });
    if (canceled || !filePaths?.length) return { canceled: true };
    return modRegistry.dumpAllModsToFolder(gamePath, filePaths[0]);
  });

  ipcMain.handle('mods:extract-to-separate-folders', async () => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select folder for mod extraction',
      properties: ['openDirectory'],
      message: 'Choose a folder. Each mod will be extracted into its own named subfolder (e.g. ModName/archive, ModName/mods).',
    });
    if (canceled || !filePaths?.length) return { canceled: true };
    return modRegistry.extractModsToSeparateFolders(gamePath, filePaths[0]);
  });

  ipcMain.handle('mods:enable-all', () => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    const records = modRegistry.loadRecords();
    const toEnable = records.filter((r) => !r.enabled);
    for (const mod of toEnable) {
      const r = modRegistry.enableMod(mod.id, gamePath);
      if (!r.ok) return r;
    }
    return { ok: true, count: toEnable.length };
  });

  ipcMain.handle('mods:disable-all', () => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    const records = modRegistry.loadRecords();
    const toDisable = records.filter((r) => r.enabled);
    for (const mod of toDisable) {
      const r = modRegistry.disableMod(mod.id, gamePath);
      if (!r.ok) return r;
    }
    return { ok: true, count: toDisable.length };
  });

  ipcMain.handle('mods:uninstall-all', () => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    const records = modRegistry.loadRecords();
    const ids = records.map((r) => r.id);
    for (const modId of ids) {
      const r = modRegistry.uninstallMod(modId, gamePath);
      if (!r.ok) return r;
    }
    return { ok: true, count: ids.length };
  });

  ipcMain.handle('mods:get-customization', (_, modId) => modCustomizations.getCustomization(modId));

  ipcMain.handle('mods:set-customization', (_, modId, data) => {
    modCustomizations.setCustomization(modId, data);
    return true;
  });

  ipcMain.handle('mods:select-image-file', async (_, modId) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select image for mod',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    });
    if (canceled || !filePaths?.length) return { canceled: true };
    return modCustomizations.addModImage(modId, filePaths[0]);
  });

  ipcMain.handle('mods:add-image-from-path', (_, modId, sourcePath) =>
    modCustomizations.addModImage(modId, sourcePath)
  );

  ipcMain.handle('mods:add-image-from-url', async (_, modId, imageUrl) => {
    try {
      const tempPath = await downloadImageToTemp(imageUrl);
      const result = modCustomizations.addModImage(modId, tempPath);
      try { fs.unlinkSync(tempPath); } catch (_) {}
      return result;
    } catch (err) {
      return { ok: false, error: err.message || 'Failed to download image.' };
    }
  });

  ipcMain.handle('load-order:get', () => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return [];
    return loadOrder.getArchiveLoadOrder(gamePath);
  });

  ipcMain.handle('load-order:apply', (_, orderedNames) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    return loadOrder.setArchiveLoadOrder(gamePath, orderedNames);
  });

  // ----- Profiles -----
  ipcMain.handle('profiles:list', () => {
    const gamePath = store.get('gamePath');
    const mods = modRegistry.getMods(gamePath || '');
    const order = gamePath ? loadOrder.getArchiveLoadOrder(gamePath) : [];
    return profiles.ensureDefaultProfile(mods, order);
  });

  ipcMain.handle('profiles:create', (_, name) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    const mods = modRegistry.getMods(gamePath);
    const order = loadOrder.getArchiveLoadOrder(gamePath);
    const profile = profiles.createProfile(name || 'New Profile', mods, order);
    return { ok: true, profile };
  });

  ipcMain.handle('profiles:save', (_, profileId) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    const mods = modRegistry.getMods(gamePath);
    const order = loadOrder.getArchiveLoadOrder(gamePath);
    return profiles.saveCurrentProfile(profileId, mods, order);
  });

  ipcMain.handle('profiles:switch', (_, profileId) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    const state = profiles.listProfiles();
    const target = state.profiles.find((p) => p.id === profileId);
    if (!target) return { ok: false, error: 'Profile not found' };

    const currentMods = modRegistry.getMods(gamePath);
    const enabledSet = new Set(target.enabledModIds);

    // Disable mods not in profile
    for (const mod of currentMods) {
      if (mod.enabled && !enabledSet.has(mod.id)) {
        const res = modRegistry.disableMod(mod.id, gamePath);
        if (!res.ok) return { ok: false, error: res.error || `Failed disabling ${mod.displayName}` };
      }
    }
    // Enable mods in profile
    for (const modId of target.enabledModIds) {
      const res = modRegistry.enableMod(modId, gamePath);
      if (!res.ok) return { ok: false, error: res.error || `Failed enabling ${modId}` };
    }

    // Apply archive load order
    const lo = loadOrder.setArchiveLoadOrder(gamePath, target.archiveLoadOrder || []);
    if (!lo.ok) return { ok: false, error: lo.error || 'Failed applying load order' };

    const setRes = profiles.setCurrentProfile(profileId);
    if (!setRes.ok) return setRes;
    return { ok: true };
  });

  ipcMain.handle('profiles:delete', (_, profileId) => profiles.deleteProfile(profileId));

  // ----- AI (optional, user provides API key) -----
  ipcMain.handle('ai:has-key', () => ai.hasApiKey());
  ipcMain.handle('ai:set-key', (_, key) => {
    ai.setApiKey(key);
    return true;
  });
  ipcMain.handle('ai:clear-key', () => {
    ai.setApiKey('');
    return true;
  });
  ipcMain.handle('ai:generate-description', async (_, modContext) => {
    const categories = { predefined: PREDEFINED_CATEGORIES, user: store.get('userCategories') || [] };
    return ai.generateModDescription(modContext, categories);
  });
  ipcMain.handle('ai:batch-categorize', async (event, mods) => {
    const categories = { predefined: PREDEFINED_CATEGORIES, user: store.get('userCategories') || [] };
    const send = (msg, data = {}) => event.sender.send('ai:activity', { message: msg, ...data });
    const opts = { onActivity: send };
    try {
      const result = await ai.batchCategorize(mods, categories, opts);
      send(result.ok ? 'Complete' : 'Error', { ok: result.ok, error: result.error, rawSnippet: result.rawSnippet });
      return result;
    } catch (e) {
      send('Error', { ok: false, error: e.message });
      throw e;
    }
  });
  ipcMain.handle('ai:classify-chat-intent', async (_, userMessage) => ai.classifyChatIntent(userMessage));

  ipcMain.handle('ai:suggest-groups', async (event, mods, customInstructions) => {
    const send = (msg, data = {}) => event.sender.send('ai:activity', { message: msg, ...data });
    try {
      const result = await ai.suggestGroups(mods, { onActivity: send, customInstructions: customInstructions || undefined });
      send(result.ok ? 'Complete' : 'Error', { ok: result.ok, error: result.error, rawSnippet: result.rawSnippet });
      return result;
    } catch (e) {
      send('Error', { ok: false, error: e.message });
      throw e;
    }
  });
  ipcMain.handle('ai:suggest-load-order', async (event, mods, currentOrder) => {
    const send = (msg, data = {}) => event.sender.send('ai:activity', { message: msg, ...data });
    try {
      const result = await ai.suggestLoadOrder(mods, currentOrder, { onActivity: send });
      send(result.ok ? 'Complete' : 'Error', { ok: result.ok, error: result.error, rawSnippet: result.rawSnippet });
      return result;
    } catch (e) {
      send('Error', { ok: false, error: e.message });
      throw e;
    }
  });
  ipcMain.handle('ai:troubleshoot', async (event, mods, userMessage) => {
    const send = (msg, data = {}) => event.sender.send('ai:activity', { message: msg, ...data });
    try {
      const result = await ai.troubleshoot(mods, userMessage, { onActivity: send });
      send(result.ok ? 'Complete' : 'Error', { ok: result.ok, error: result.error, rawSnippet: result.rawSnippet });
      return result;
    } catch (e) {
      send('Error', { ok: false, error: e.message });
      throw e;
    }
  });

  // ----- Nexus Mods API -----
  ipcMain.handle('nexus:has-key', () => nexus.hasApiKey());
  ipcMain.handle('nexus:set-key', (_, key) => {
    nexus.setApiKey(key);
    nexus.clearCache();
    return true;
  });
  ipcMain.handle('nexus:clear-key', () => {
    nexus.setApiKey('');
    nexus.clearCache();
    return true;
  });
  ipcMain.handle('nexus:validate', () => nexus.validate());
  ipcMain.handle('nexus:get-latest-added', () => nexus.getLatestAdded());
  ipcMain.handle('nexus:get-latest-updated', () => nexus.getLatestUpdated());
  ipcMain.handle('nexus:get-trending', () => nexus.getTrending());
  ipcMain.handle('nexus:get-updated', (_, period) => nexus.getUpdated(period));
  ipcMain.handle('nexus:get-mod', (_, modId) => nexus.getMod(modId));
  ipcMain.handle('nexus:get-files', (_, modId, category) => nexus.getFiles(modId, category));
  ipcMain.handle('nexus:get-file', (_, modId, fileId) => nexus.getFile(modId, fileId));
  ipcMain.handle('nexus:get-download-link', (_, modId, fileId, key, expires) =>
    nexus.getDownloadLink(modId, fileId, key, expires));
  ipcMain.handle('nexus:endorse', (_, modId, version) => nexus.endorse(modId, version));
  ipcMain.handle('nexus:abstain', (_, modId, version) => nexus.abstain(modId, version));
  ipcMain.handle('nexus:track', (_, modId) => nexus.track(modId));
  ipcMain.handle('nexus:untrack', (_, modId) => nexus.untrack(modId));
  ipcMain.handle('nexus:get-tracked', () => nexus.getTrackedMods());
  ipcMain.handle('nexus:get-endorsements', () => nexus.getEndorsements());
  ipcMain.handle('nexus:get-changelogs', (_, modId) => nexus.getChangelogs(modId));
  ipcMain.handle('nexus:md5-search', (_, md5Hash) => nexus.md5Search(md5Hash));
  ipcMain.handle('nexus:install-from-nexus', async (event, modId, fileId, key, expires) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    const onProgress = (received, total) => {
      event.sender.send('nexus:download-progress', { received, total });
    };
    return nexus.installFromNexus(modId, fileId, gamePath, key, expires, onProgress);
  });

  // ----- Dependency checks -----
  ipcMain.handle('deps:check-redmod', (_, modId) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    const all = modRegistry.getMods(gamePath);
    const mod = all.find((m) => m.id === modId);
    if (!mod) return { ok: false, error: 'Mod not found' };
    if (mod.type !== 'redmod') return { ok: false, error: 'Not a REDmod (no info.json dependency check)' };
    return deps.checkRedmodDependencies(gamePath, mod, all);
  });
}

module.exports = { registerIpcHandlers, store, getModsDownloadFolder };
