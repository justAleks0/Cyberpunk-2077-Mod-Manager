const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const RECORDS_FILENAME = 'installed_mods.json';
const DISABLED_DIR = 'disabled';

function getRecordsPath() {
  return path.join(app.getPath('userData'), RECORDS_FILENAME);
}

function getStashBase() {
  return path.join(app.getPath('userData'), DISABLED_DIR);
}

function getStashPath(modId) {
  return path.join(getStashBase(), modId);
}

/**
 * @typedef {Object} ModRecord
 * @property {string} id
 * @property {string} displayName
 * @property {string} type - 'archive' | 'redmod' | 'cet' | 'red4ext' | 'hybrid'
 * @property {boolean} enabled
 * @property {number} installedAt
 * @property {string[]} files - paths relative to game root
 * @property {string[]} [disabledFiles] - paths to skip when enabling (for conflict resolution)
 * @property {string} [sourceArchiveName]
 */

/**
 * @returns {ModRecord[]}
 */
function loadRecords() {
  const filePath = getRecordsPath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.error('Failed to load mod records', err);
  }
  return [];
}

/**
 * @param {ModRecord[]} records
 */
function saveRecords(records) {
  const filePath = getRecordsPath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save mod records', err);
    throw err;
  }
}

/**
 * @param {ModRecord} mod
 */
function addRecord(mod) {
  const records = loadRecords();
  if (records.some((r) => r.id === mod.id)) {
    const idx = records.findIndex((r) => r.id === mod.id);
    records[idx] = { ...records[idx], ...mod };
  } else {
    records.push(mod);
  }
  saveRecords(records);
}

/**
 * @param {string} id
 */
function removeRecord(id) {
  const records = loadRecords().filter((r) => r.id !== id);
  saveRecords(records);
}

/**
 * Find info.json path in mod files (REDmod convention).
 * @param {string[]} files
 * @returns {string|null}
 */
function findRedmodInfoRelPath(files) {
  return (files || []).find((f) => f.toLowerCase().startsWith('mods/') && f.toLowerCase().endsWith('/info.json')) || null;
}

/**
 * Strip Nexus-style suffix from filename (e.g. -3850-3-1-5-1760299171).
 * @param {string} s
 * @returns {string}
 */
function cleanNexusSuffix(s) {
  if (!s || typeof s !== 'string') return s;
  return s.replace(/-\d+(-\d+){3,}$/, '').trim() || s;
}

/**
 * Resolve display name from info.json when available (for already-installed mods).
 * Falls back to cleaning Nexus-style suffixes from filename when no metadata found.
 * @param {ModRecord} mod
 * @param {string} gameRoot
 * @returns {string}
 */
function resolveDisplayName(mod, gameRoot) {
  const relInfo = findRedmodInfoRelPath(mod.files);
  if (relInfo) {
    const basePath = mod.enabled ? gameRoot : getStashPath(mod.id);
    const infoPath = path.join(basePath, relInfo);
    if (fs.existsSync(infoPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        const name = data.name || data.friendlyName;
        if (name && typeof name === 'string' && name.trim()) return name.trim();
      } catch (_) {}
    }
  }
  const current = mod.displayName || '';
  if (current && /-\d+(-\d+){3,}$/.test(current)) {
    return cleanNexusSuffix(current) || cleanNexusSuffix(path.basename(mod.sourceArchiveName || '', path.extname(mod.sourceArchiveName || ''))) || current;
  }
  return current || mod.id;
}

/**
 * @param {string} gameRoot - absolute path to game root
 * @returns {ModRecord[]}
 */
function getMods(gameRoot) {
  const records = loadRecords();
  if (!gameRoot) return records;
  return records.map((r) => ({
    ...r,
    displayName: resolveDisplayName(r, gameRoot),
  }));
}

/**
 * Move a single file or directory from src to dest (parent dirs created).
 * @param {string} src
 * @param {string} dest
 */
function movePath(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    // Cross-device moves (e.g. game on D:, app data on C:) cannot use rename.
    if (err && err.code === 'EXDEV') {
      fs.cpSync(src, dest, { recursive: true, force: true });
      fs.rmSync(src, { recursive: true, force: true });
      return;
    }
    throw err;
  }
}

function removeEmptyParents(startDir, stopDir) {
  let current = startDir;
  const stop = path.resolve(stopDir);
  while (current && path.resolve(current).startsWith(stop)) {
    if (path.resolve(current) === stop) break;
    try {
      if (fs.existsSync(current) && fs.readdirSync(current).length === 0) {
        fs.rmdirSync(current);
      } else {
        break;
      }
    } catch (_) {
      break;
    }
    current = path.dirname(current);
  }
}

/**
 * @param {string} modId
 * @param {string} gameRoot
 * @returns {{ ok: boolean, error?: string }}
 */
function enableMod(modId, gameRoot) {
  const records = loadRecords();
  const mod = records.find((r) => r.id === modId);
  if (!mod) return { ok: false, error: 'Mod not found' };
  if (mod.enabled) return { ok: true };

  const stashBase = getStashPath(modId);
  if (!fs.existsSync(stashBase)) {
    mod.enabled = true;
    addRecord(mod);
    return { ok: true };
  }

  const disabled = new Set((mod.disabledFiles || []).map((p) => p.replace(/\\/g, '/').toLowerCase()));
  try {
    for (const rel of mod.files) {
      if (disabled.has(rel.replace(/\\/g, '/').toLowerCase())) continue;
      const stashFile = path.join(stashBase, rel);
      const gameFile = path.join(gameRoot, rel);
      if (fs.existsSync(stashFile)) {
        movePath(stashFile, gameFile);
      }
    }
    mod.enabled = true;
    addRecord(mod);
    // Remove stash dir if empty
    try {
      const remaining = fs.readdirSync(stashBase);
      if (remaining.length === 0) fs.rmdirSync(stashBase);
    } catch (_) {}
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * @param {string} modId
 * @param {string} gameRoot
 * @returns {{ ok: boolean, error?: string }}
 */
function disableMod(modId, gameRoot) {
  const records = loadRecords();
  const mod = records.find((r) => r.id === modId);
  if (!mod) return { ok: false, error: 'Mod not found' };
  if (!mod.enabled) return { ok: true };

  const stashBase = getStashPath(modId);
  try {
    for (const rel of mod.files) {
      const gameFile = path.join(gameRoot, rel);
      const stashFile = path.join(stashBase, rel);
      if (fs.existsSync(gameFile)) {
        movePath(gameFile, stashFile);
      }
    }
    mod.enabled = false;
    addRecord(mod);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Uninstall a mod by removing tracked files from game or stash and deleting the record.
 * @param {string} modId
 * @param {string} gameRoot
 * @returns {{ ok: boolean, removed?: number, error?: string }}
 */
function uninstallMod(modId, gameRoot) {
  const records = loadRecords();
  const mod = records.find((r) => r.id === modId);
  if (!mod) return { ok: false, error: 'Mod not found' };

  const modStashRoot = getStashPath(modId);
  let removed = 0;

  try {
    for (const rel of mod.files || []) {
      const gamePath = path.join(gameRoot, rel);
      const stashPath = path.join(modStashRoot, rel);
      if (fs.existsSync(gamePath)) {
        fs.rmSync(gamePath, { recursive: true, force: true });
        removed += 1;
        removeEmptyParents(path.dirname(gamePath), gameRoot);
      }
      if (fs.existsSync(stashPath)) {
        fs.rmSync(stashPath, { recursive: true, force: true });
        removed += 1;
        removeEmptyParents(path.dirname(stashPath), modStashRoot);
      }
    }

    // Always cleanup per-mod stash folder if present.
    if (fs.existsSync(modStashRoot)) {
      fs.rmSync(modStashRoot, { recursive: true, force: true });
    }

    removeRecord(modId);
    return { ok: true, removed };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Check if an archive filename is already installed (has a record with that sourceArchiveName).
 * @param {string} archiveFileName
 * @returns {boolean}
 */
function isAlreadyInstalled(archiveFileName) {
  const name = path.basename(archiveFileName).toLowerCase();
  const records = loadRecords();
  return records.some(
    (r) => r.sourceArchiveName && r.sourceArchiveName.toLowerCase() === name
  );
}

/**
 * Dump all mod files into a destination folder, preserving folder structure
 * (archive/, bin/, r6/, red4ext/, mods/ etc.). Copies from game root for enabled
 * mods and from stash for disabled mods. May overwrite existing files.
 * @param {string} gameRoot
 * @param {string} destFolder
 * @returns {{ ok: boolean, filesCopied?: number, error?: string }}
 */
function dumpAllModsToFolder(gameRoot, destFolder) {
  const records = loadRecords();
  if (!gameRoot || !fs.existsSync(gameRoot)) {
    return { ok: false, error: 'Game path not set or invalid.' };
  }
  try {
    fs.mkdirSync(destFolder, { recursive: true });
  } catch (err) {
    return { ok: false, error: err.message || 'Could not create destination folder.' };
  }
  let filesCopied = 0;
  for (const mod of records) {
    const basePath = mod.enabled ? gameRoot : getStashPath(mod.id);
    if (!fs.existsSync(basePath)) continue;
    const disabled = new Set((mod.disabledFiles || []).map((p) => p.replace(/\\/g, '/').toLowerCase()));
    for (const rel of mod.files || []) {
      if (disabled.has(rel.replace(/\\/g, '/').toLowerCase())) continue;
      const src = path.join(basePath, rel);
      const dest = path.join(destFolder, rel);
      if (!fs.existsSync(src)) continue;
      try {
        const stat = fs.statSync(src);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (stat.isDirectory()) {
          fs.cpSync(src, dest, { recursive: true, force: true });
          filesCopied += 1;
        } else {
          fs.copyFileSync(src, dest);
          filesCopied += 1;
        }
      } catch (err) {
        return { ok: false, error: `Failed copying ${rel}: ${err.message}`, filesCopied };
      }
    }
  }
  return { ok: true, filesCopied };
}

/**
 * Sanitize a string for use as a folder name (remove invalid path chars).
 * @param {string} s
 * @returns {string}
 */
function sanitizeFolderName(s) {
  if (!s || typeof s !== 'string') return 'mod';
  return s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'mod';
}

/**
 * Extract each mod into its own named subfolder. Each mod gets destFolder/ModName/
 * containing its full structure (archive/, bin/, r6/, red4ext/, mods/ etc.).
 * @param {string} gameRoot
 * @param {string} destFolder
 * @returns {{ ok: boolean, modsExtracted?: number, filesCopied?: number, error?: string }}
 */
function extractModsToSeparateFolders(gameRoot, destFolder) {
  const records = loadRecords();
  if (!gameRoot || !fs.existsSync(gameRoot)) {
    return { ok: false, error: 'Game path not set or invalid.' };
  }
  const mods = getMods(gameRoot);
  try {
    fs.mkdirSync(destFolder, { recursive: true });
  } catch (err) {
    return { ok: false, error: err.message || 'Could not create destination folder.' };
  }
  const seenNames = new Map();
  let modsExtracted = 0;
  let filesCopied = 0;
  for (const mod of mods) {
    const basePath = mod.enabled ? gameRoot : getStashPath(mod.id);
    if (!fs.existsSync(basePath)) continue;
    let folderName = sanitizeFolderName(mod.displayName || mod.id);
    if (seenNames.has(folderName)) {
      let n = 1;
      while (seenNames.has(`${folderName} (${n})`)) n += 1;
      folderName = `${folderName} (${n})`;
    }
    seenNames.set(folderName, true);
    const modDest = path.join(destFolder, folderName);
    fs.mkdirSync(modDest, { recursive: true });
    const disabled = new Set((mod.disabledFiles || []).map((p) => p.replace(/\\/g, '/').toLowerCase()));
    for (const rel of mod.files || []) {
      if (disabled.has(rel.replace(/\\/g, '/').toLowerCase())) continue;
      const src = path.join(basePath, rel);
      const dest = path.join(modDest, rel);
      if (!fs.existsSync(src)) continue;
      try {
        const stat = fs.statSync(src);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (stat.isDirectory()) {
          fs.cpSync(src, dest, { recursive: true, force: true });
          filesCopied += 1;
        } else {
          fs.copyFileSync(src, dest);
          filesCopied += 1;
        }
      } catch (err) {
        return { ok: false, error: `Failed copying ${rel} (${mod.displayName || mod.id}): ${err.message}`, modsExtracted, filesCopied };
      }
    }
    modsExtracted += 1;
  }
  return { ok: true, modsExtracted, filesCopied };
}

module.exports = {
  loadRecords,
  saveRecords,
  addRecord,
  removeRecord,
  getMods,
  enableMod,
  disableMod,
  uninstallMod,
  isAlreadyInstalled,
  getStashBase,
  getStashPath,
  dumpAllModsToFolder,
  extractModsToSeparateFolders,
};
