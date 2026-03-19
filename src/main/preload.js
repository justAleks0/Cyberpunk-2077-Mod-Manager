const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cp2077', {
  getAssetUrl: (filename) => `app-asset://${encodeURIComponent(filename)}`,

  // Game
  getGamePath: () => ipcRenderer.invoke('game:get-path'),
  setGamePath: (path) => ipcRenderer.invoke('game:set-path', path),
  detectGame: () => ipcRenderer.invoke('game:detect'),
  selectGameFolder: () => ipcRenderer.invoke('game:select-folder'),
  launchGame: () => ipcRenderer.invoke('game:launch'),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getDownloadFolder: () => ipcRenderer.invoke('settings:get-download-folder'),
  setDownloadFolder: (path) => ipcRenderer.invoke('settings:set-download-folder', path),
  selectDownloadFolder: () => ipcRenderer.invoke('settings:select-download-folder'),

  // Mods
  listMods: () => ipcRenderer.invoke('mods:list'),
  enableMod: (modId) => ipcRenderer.invoke('mods:enable', modId),
  disableMod: (modId) => ipcRenderer.invoke('mods:disable', modId),
  uninstallMod: (modId) => ipcRenderer.invoke('mods:uninstall', modId),
  showFilesInExplorer: (modId) => ipcRenderer.invoke('mods:show-files-in-explorer', modId),
  pushMods: () => ipcRenderer.invoke('mods:push'),
  installFromFile: () => ipcRenderer.invoke('mods:show-install-picker'),
  installFromPath: (path) => ipcRenderer.invoke('mods:install-from-path', path),
  installFoundational: () => ipcRenderer.invoke('mods:install-foundational'),
  resetInstall: () => ipcRenderer.invoke('mods:reset-install'),
  getFoundationalPath: () => ipcRenderer.invoke('mods:get-foundational-path'),
  checkDownloadFolder: () => ipcRenderer.invoke('mods:check-download-folder'),
  getLoadOrder: () => ipcRenderer.invoke('load-order:get'),
  applyLoadOrder: (names) => ipcRenderer.invoke('load-order:apply', names),

  // Profiles
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  createProfile: (name) => ipcRenderer.invoke('profiles:create', name),
  saveProfile: (id) => ipcRenderer.invoke('profiles:save', id),
  switchProfile: (id) => ipcRenderer.invoke('profiles:switch', id),
  deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),

  // Dependencies
  checkRedmodDeps: (modId) => ipcRenderer.invoke('deps:check-redmod', modId),
});
