const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cp2077', {
  getAssetUrl: (filename) => `app-asset://${encodeURIComponent(filename)}`,
  getBackgroundArtworkDataUrl: () => ipcRenderer.invoke('assets:get-background-artwork'),

  // Game
  getGamePath: () => ipcRenderer.invoke('game:get-path'),
  setGamePath: (path) => ipcRenderer.invoke('game:set-path', path),
  detectGame: () => ipcRenderer.invoke('game:detect'),
  selectGameFolder: () => ipcRenderer.invoke('game:select-folder'),
  launchGame: () => ipcRenderer.invoke('game:launch'),
  openGameFolder: () => ipcRenderer.invoke('game:open-folder'),
  openModsFolder: () => ipcRenderer.invoke('game:open-mods-folder'),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getDownloadFolder: () => ipcRenderer.invoke('settings:get-download-folder'),
  setDownloadFolder: (path) => ipcRenderer.invoke('settings:set-download-folder', path),
  resetDownloadFolderToDefault: () => ipcRenderer.invoke('settings:reset-download-folder-to-default'),
  selectDownloadFolder: () => ipcRenderer.invoke('settings:select-download-folder'),

  // Mods
  listMods: () => ipcRenderer.invoke('mods:list'),
  enableMod: (modId) => ipcRenderer.invoke('mods:enable', modId),
  disableMod: (modId) => ipcRenderer.invoke('mods:disable', modId),
  uninstallMod: (modId) => ipcRenderer.invoke('mods:uninstall', modId),
  showFilesInExplorer: (modId) => ipcRenderer.invoke('mods:show-files-in-explorer', modId),
  getModCustomization: (modId) => ipcRenderer.invoke('mods:get-customization', modId),
  setModCustomization: (modId, data) => ipcRenderer.invoke('mods:set-customization', modId, data),
  getCategories: () => ipcRenderer.invoke('categories:get'),
  addCategory: (name) => ipcRenderer.invoke('categories:add', name),
  selectModImage: (modId) => ipcRenderer.invoke('mods:select-image-file', modId),
  addModImageFromPath: (modId, sourcePath) => ipcRenderer.invoke('mods:add-image-from-path', modId, sourcePath),
  addModImageFromUrl: (modId, imageUrl) => ipcRenderer.invoke('mods:add-image-from-url', modId, imageUrl),
  pushMods: () => ipcRenderer.invoke('mods:push'),
  installFromFile: () => ipcRenderer.invoke('mods:show-install-picker'),
  installFromPath: (path) => ipcRenderer.invoke('mods:install-from-path', path),
  installFoundational: () => ipcRenderer.invoke('mods:install-foundational'),
  resetInstall: () => ipcRenderer.invoke('mods:reset-install'),
  dumpAllModsToFolder: () => ipcRenderer.invoke('mods:dump-all-to-folder'),
  extractModsToSeparateFolders: () => ipcRenderer.invoke('mods:extract-to-separate-folders'),
  enableAllMods: () => ipcRenderer.invoke('mods:enable-all'),
  disableAllMods: () => ipcRenderer.invoke('mods:disable-all'),
  uninstallAllMods: () => ipcRenderer.invoke('mods:uninstall-all'),
  getFoundationalPath: () => ipcRenderer.invoke('mods:get-foundational-path'),
  listFoundationalMods: () => ipcRenderer.invoke('mods:list-foundational'),
  inspectArchive: (archivePath) => ipcRenderer.invoke('mods:inspect-archive', archivePath),
  checkDownloadFolder: () => ipcRenderer.invoke('mods:check-download-folder'),
  checkConflicts: () => ipcRenderer.invoke('mods:check-conflicts'),
  resolveConflict: (conflict, choice) => ipcRenderer.invoke('mods:resolve-conflict', conflict, choice),
  groupsList: () => ipcRenderer.invoke('groups:list'),
  groupsCreate: (name, type, modIds) => ipcRenderer.invoke('groups:create', name, type, modIds),
  groupsUpdate: (groupId, updates) => ipcRenderer.invoke('groups:update', groupId, updates),
  groupsDelete: (groupId) => ipcRenderer.invoke('groups:delete', groupId),
  groupsAddMod: (groupId, modId) => ipcRenderer.invoke('groups:add-mod', groupId, modId),
  groupsRemoveMod: (groupId, modId) => ipcRenderer.invoke('groups:remove-mod', groupId, modId),
  groupsGetForMod: (modId) => ipcRenderer.invoke('groups:get-for-mod', modId),
  groupsSuggest: () => ipcRenderer.invoke('groups:suggest'),
  groupsApplyToGroup: (groupId, data) => ipcRenderer.invoke('groups:apply-to-group', groupId, data),
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

  // AI (optional)
  aiHasKey: () => ipcRenderer.invoke('ai:has-key'),
  aiSetKey: (key) => ipcRenderer.invoke('ai:set-key', key),
  aiClearKey: () => ipcRenderer.invoke('ai:clear-key'),
  aiGenerateDescription: (modContext) => ipcRenderer.invoke('ai:generate-description', modContext),
  aiBatchCategorize: (mods) => ipcRenderer.invoke('ai:batch-categorize', mods),
  aiSuggestGroups: (mods, customInstructions) => ipcRenderer.invoke('ai:suggest-groups', mods, customInstructions),
  aiClassifyChatIntent: (userMessage) => ipcRenderer.invoke('ai:classify-chat-intent', userMessage),
  aiSuggestLoadOrder: (mods, currentOrder) => ipcRenderer.invoke('ai:suggest-load-order', mods, currentOrder),
  aiTroubleshoot: (mods, userMessage) => ipcRenderer.invoke('ai:troubleshoot', mods, userMessage),

  // Nexus Mods API
  nexusHasKey: () => ipcRenderer.invoke('nexus:has-key'),
  nexusSetKey: (key) => ipcRenderer.invoke('nexus:set-key', key),
  nexusClearKey: () => ipcRenderer.invoke('nexus:clear-key'),
  nexusValidate: () => ipcRenderer.invoke('nexus:validate'),
  nexusGetLatestAdded: () => ipcRenderer.invoke('nexus:get-latest-added'),
  nexusGetLatestUpdated: () => ipcRenderer.invoke('nexus:get-latest-updated'),
  nexusGetTrending: () => ipcRenderer.invoke('nexus:get-trending'),
  nexusGetUpdated: (period) => ipcRenderer.invoke('nexus:get-updated', period),
  nexusGetMod: (modId) => ipcRenderer.invoke('nexus:get-mod', modId),
  nexusGetFiles: (modId, category) => ipcRenderer.invoke('nexus:get-files', modId, category),
  nexusGetFile: (modId, fileId) => ipcRenderer.invoke('nexus:get-file', modId, fileId),
  nexusGetDownloadLink: (modId, fileId, key, expires) => ipcRenderer.invoke('nexus:get-download-link', modId, fileId, key, expires),
  nexusEndorse: (modId, version) => ipcRenderer.invoke('nexus:endorse', modId, version),
  nexusAbstain: (modId, version) => ipcRenderer.invoke('nexus:abstain', modId, version),
  nexusTrack: (modId) => ipcRenderer.invoke('nexus:track', modId),
  nexusUntrack: (modId) => ipcRenderer.invoke('nexus:untrack', modId),
  nexusGetTracked: () => ipcRenderer.invoke('nexus:get-tracked'),
  nexusGetEndorsements: () => ipcRenderer.invoke('nexus:get-endorsements'),
  nexusGetChangelogs: (modId) => ipcRenderer.invoke('nexus:get-changelogs', modId),
  nexusMd5Search: (md5Hash) => ipcRenderer.invoke('nexus:md5-search', md5Hash),
  nexusInstallFromNexus: (modId, fileId, key, expires) => ipcRenderer.invoke('nexus:install-from-nexus', modId, fileId, key, expires),
});

ipcRenderer.on('app:show-toast', (_, { message, type = 'error' }) => {
  window.dispatchEvent(new CustomEvent('app-show-toast', { detail: { message, type } }));
});

ipcRenderer.on('ai:activity', (_, payload) => {
  window.dispatchEvent(new CustomEvent('ai-activity', { detail: payload }));
});

ipcRenderer.on('mod-edit:add-image-from-url', (_, url) => {
  window.dispatchEvent(new CustomEvent('mod-edit-add-image-from-url', { detail: { url } }));
});

ipcRenderer.on('mod-edit:set-field', (_, { field, value }) => {
  window.dispatchEvent(new CustomEvent('mod-edit-set-field', { detail: { field, value } }));
});

ipcRenderer.on('nexus:nxm-install-result', (_, result) => {
  window.dispatchEvent(new CustomEvent('nexus-nxm-install-result', { detail: result }));
});

ipcRenderer.on('nexus:download-progress', (_, { received, total }) => {
  window.dispatchEvent(new CustomEvent('nexus-download-progress', { detail: { received, total } }));
});
