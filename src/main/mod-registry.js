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
 * @param {string} gameRoot - absolute path to game root
 * @returns {ModRecord[]}
 */
function getMods(gameRoot) {
  return loadRecords();
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

  try {
    for (const rel of mod.files) {
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
  const baseRoot = mod.enabled ? gameRoot : modStashRoot;
  let removed = 0;

  try {
    for (const rel of mod.files || []) {
      const filePath = path.join(baseRoot, rel);
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { recursive: true, force: true });
        removed += 1;
        removeEmptyParents(path.dirname(filePath), baseRoot);
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
};
