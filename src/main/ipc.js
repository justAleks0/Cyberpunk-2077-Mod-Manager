const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { dialog, shell } = require('electron');
const { GAME_LAUNCHER_EXE, GAME_FALLBACK_EXE } = require('../shared/constants');
const Store = require('electron-store');
const { detectGamePath, validateGamePath } = require('./game-detection');
const modRegistry = require('./mod-registry');
const { installFromZip, installFoundationalMods, getFoundationalModsPath } = require('./install');
const loadOrder = require('./load-order');
const profiles = require('./profiles');
const deps = require('./deps');
const { resetInstallToVanilla } = require('./reset-install');

const store = new Store({
  name: 'cp2077-mod-manager',
  defaults: {
    gamePath: null,
    modsDownloadFolder: null,
    foundationalModsPath: null,
  },
});

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

  ipcMain.handle('settings:set', (_, key, value) => {
    store.set(key, value);
    return true;
  });

  ipcMain.handle('settings:get-download-folder', () => store.get('modsDownloadFolder'));
  ipcMain.handle('settings:set-download-folder', (_, value) => {
    store.set('modsDownloadFolder', value ?? null);
    return true;
  });

  ipcMain.handle('settings:select-download-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select folder for mods to install',
      properties: ['openDirectory'],
      message: "The app couldn't auto-detect the mods download folder. Please select its location.",
    });
    if (canceled || !filePaths?.length) return { canceled: true };
    store.set('modsDownloadFolder', path.normalize(filePaths[0]));
    return { ok: true, path: filePaths[0] };
  });

  // ----- Mods -----
  ipcMain.handle('mods:list', () => {
    const gamePath = store.get('gamePath');
    return modRegistry.getMods(gamePath || '');
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
    return installFromZip(archivePath, gamePath);
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
    return installFromZip(filePaths[0], gamePath);
  });

  ipcMain.handle('mods:install-foundational', () => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    return installFoundationalMods(gamePath);
  });

  ipcMain.handle('mods:get-foundational-path', () => getFoundationalModsPath());

  ipcMain.handle('mods:check-download-folder', () => {
    const folder = store.get('modsDownloadFolder');
    if (!folder || !fs.existsSync(folder)) return { pending: [], folder: folder || null };
    const names = fs.readdirSync(folder);
    const exts = ['.zip', '.7z', '.rar'];
    const pending = names.filter((n) => exts.some((e) => n.toLowerCase().endsWith(e)) && !modRegistry.isAlreadyInstalled(n));
    return { pending: pending.map((n) => path.join(folder, n)), folder };
  });

  ipcMain.handle('mods:install-from-path', (_, archivePath) => {
    const gamePath = store.get('gamePath');
    if (!gamePath) return { ok: false, error: 'Game path not set' };
    return installFromZip(archivePath, gamePath);
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

module.exports = { registerIpcHandlers, store };
