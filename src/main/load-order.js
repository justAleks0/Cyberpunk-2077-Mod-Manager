const fs = require('fs');
const path = require('path');
const { MODLIST_FILE } = require('../shared/constants');

/**
 * Get current load order of archive mods (filenames only).
 * Reads modlist.txt if present, otherwise lists .archive files in directory (ASCII order).
 * @param {string} gameRoot
 * @returns {string[]}
 */
function getArchiveLoadOrder(gameRoot) {
  const modDir = path.join(gameRoot, path.dirname(MODLIST_FILE));
  const modlistPath = path.join(gameRoot, MODLIST_FILE);
  if (!fs.existsSync(modDir)) return [];
  const files = fs.readdirSync(modDir).filter((n) => n.toLowerCase().endsWith('.archive'));
  if (fs.existsSync(modlistPath)) {
    const content = fs.readFileSync(modlistPath, 'utf8');
    const fromFile = content
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase().endsWith('.archive'));
    const fromFileSet = new Set(fromFile.map((n) => n.toLowerCase()));
    const rest = files.filter((n) => !fromFileSet.has(n.toLowerCase()));
    return [...fromFile.filter((n) => files.some((f) => f.toLowerCase() === n.toLowerCase())), ...rest];
  }
  return files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Write modlist.txt with the given order (array of .archive filenames).
 * @param {string} gameRoot
 * @param {string[]} orderedNames
 * @returns {{ ok: boolean, error?: string }}
 */
function setArchiveLoadOrder(gameRoot, orderedNames) {
  const modlistPath = path.join(gameRoot, MODLIST_FILE);
  try {
    fs.mkdirSync(path.dirname(modlistPath), { recursive: true });
    const content = orderedNames.filter((n) => n && n.toLowerCase().endsWith('.archive')).join('\n');
    fs.writeFileSync(modlistPath, content, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getArchiveLoadOrder,
  setArchiveLoadOrder,
};
