/**
 * Mod groups: related mods (add-ons, expansions, etc.).
 * Supports auto-detection and manual grouping with mass edit.
 */
const Store = require('electron-store');
const path = require('path');
const fs = require('fs');
const deps = require('./deps');

const store = new Store({ name: 'cp2077-mod-manager' });
const GROUPS_KEY = 'modGroups';

/**
 * @typedef {Object} ModGroup
 * @property {string} id
 * @property {string} name
 * @property {string[]} modIds
 * @property {'addon'|'expansion'|'related'} [type]
 */

function getGroups() {
  const raw = store.get(GROUPS_KEY);
  return Array.isArray(raw) ? raw : [];
}

function saveGroups(groups) {
  store.set(GROUPS_KEY, groups);
}

/**
 * @param {string} name
 * @param {'addon'|'expansion'|'related'} [type]
 * @param {string[]} [modIds]
 * @returns {ModGroup}
 */
function createGroup(name, type = 'related', modIds = []) {
  const groups = getGroups();
  const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const group = { id, name: String(name || 'Unnamed').trim(), modIds: modIds || [], type: type || 'related' };
  groups.push(group);
  saveGroups(groups);
  return group;
}

/**
 * @param {string} groupId
 * @param {{ name?: string, modIds?: string[], type?: string }} updates
 */
function updateGroup(groupId, updates) {
  const groups = getGroups();
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx < 0) return null;
  if (updates.name !== undefined) groups[idx].name = String(updates.name).trim();
  if (updates.modIds !== undefined) groups[idx].modIds = Array.isArray(updates.modIds) ? updates.modIds : groups[idx].modIds;
  if (updates.type !== undefined) groups[idx].type = updates.type || 'related';
  saveGroups(groups);
  return groups[idx];
}

/**
 * @param {string} groupId
 */
function deleteGroup(groupId) {
  const groups = getGroups().filter((g) => g.id !== groupId);
  saveGroups(groups);
}

/**
 * @param {string} groupId
 * @param {string} modId
 */
function addModToGroup(groupId, modId) {
  const groups = getGroups();
  const g = groups.find((x) => x.id === groupId);
  if (!g || !modId) return false;
  if (g.modIds.includes(modId)) return true;
  g.modIds.push(modId);
  saveGroups(groups);
  return true;
}

/**
 * @param {string} groupId
 * @param {string} modId
 */
function removeModFromGroup(groupId, modId) {
  const groups = getGroups();
  const g = groups.find((x) => x.id === groupId);
  if (!g) return false;
  g.modIds = g.modIds.filter((id) => id !== modId);
  saveGroups(groups);
  return true;
}

/**
 * @param {string} modId
 * @returns {ModGroup|null}
 */
function getGroupForMod(modId) {
  return getGroups().find((g) => g.modIds.includes(modId)) || null;
}

/**
 * Suggest related mods for auto-detection.
 * Uses: REDmod dependencies, naming patterns (base name match).
 * @param {Array<{id: string, displayName: string, files?: string[]}>} mods
 * @param {string} [gameRoot]
 * @returns {Array<{ modIds: string[], reason: string, confidence: 'high'|'medium'|'low' }>}
 */
function suggestRelatedMods(mods, gameRoot = '') {
  const suggestions = [];
  const getModName = (m) => m.customName || m.displayName || m.id || '';
  const modByName = new Map();
  for (const m of mods || []) {
    const name = getModName(m).toLowerCase().trim();
    if (name) modByName.set(name, m);
  }

  /** Normalize for matching: strip addon/expansion suffixes, version, etc. */
  function baseName(s) {
    return (s || '')
      .toLowerCase()
      .replace(/\s*[-–—]\s*(addon|add-on|expansion|patch|optional|standalone|stand alone).*$/i, '')
      .replace(/\s*v?\d+(\.\d+)*\s*$/i, '')
      .replace(/\s*[-–—]\s*\d+(-\d+){3,}\s*$/i, '')
      .trim();
  }

  const baseToMods = new Map();
  for (const m of mods || []) {
    const name = getModName(m);
    const base = baseName(name);
    if (!base) continue;
    if (!baseToMods.has(base)) baseToMods.set(base, []);
    baseToMods.get(base).push(m);
  }
  for (const [, groupMods] of baseToMods) {
    if (groupMods.length >= 2) {
      const modIds = groupMods.map((m) => m.id);
      if (!suggestions.some((s) => s.modIds.length === modIds.length && s.modIds.every((id, i) => id === modIds[i]))) {
        suggestions.push({ modIds, reason: 'Similar names (add-on/expansion pattern)', confidence: 'medium' });
      }
    }
  }

  if (gameRoot && fs.existsSync(gameRoot)) {
    const records = mods;
    for (const mod of records || []) {
      const depResult = deps.checkRedmodDependencies(gameRoot, mod, records);
      if (depResult.dependencies && depResult.dependencies.length) {
        for (const dep of depResult.dependencies) {
          const depStr = typeof dep === 'string' ? dep : (dep?.name || dep?.id || '');
          const needle = (depStr || '').toLowerCase();
          const match = (records || []).find(
            (m) =>
              m.id !== mod.id &&
              ((getModName(m) || '').toLowerCase().includes(needle) ||
                (m.sourceArchiveName || '').toLowerCase().includes(needle) ||
                needle.includes((getModName(m) || '').toLowerCase()))
          );
          if (match) {
            const pair = [mod.id, match.id].sort().join(',');
            if (!suggestions.some((s) => s.modIds.length === 2 && [...s.modIds].sort().join(',') === pair)) {
              suggestions.push({
                modIds: [mod.id, match.id],
                reason: `Dependency: ${getModName(mod)} depends on ${getModName(match)}`,
                confidence: 'high',
              });
            }
          }
        }
      }
    }
  }

  return suggestions;
}

/**
 * Apply customization (category, tags) to all mods in a group.
 * @param {string} groupId
 * @param {{ category?: string, tags?: string[] }} data
 * @param {Function} setCustomization - (modId, data) => void
 */
function applyToGroup(groupId, data, setCustomization) {
  const g = getGroups().find((x) => x.id === groupId);
  if (!g) return { ok: false, error: 'Group not found' };
  for (const modId of g.modIds) {
    setCustomization(modId, data);
  }
  return { ok: true, count: g.modIds.length };
}

module.exports = {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  addModToGroup,
  removeModFromGroup,
  getGroupForMod,
  suggestRelatedMods,
  applyToGroup,
};
