/**
 * Detect and resolve file conflicts between mods.
 * Two mods conflict when they both install the same file path.
 */
const path = require('path');
const modRegistry = require('./mod-registry');

/** Normalize path for comparison (forward slashes, lowercase) */
function normPath(p) {
  return (p || '').replace(/\\/g, '/').toLowerCase();
}

/**
 * Detect conflicts between enabled mods.
 * @param {Array<{id: string, displayName: string, enabled: boolean, files?: string[], disabledFiles?: string[]}>} mods
 * @returns {Array<{ modA: {id, displayName}, modB: {id, displayName}, conflictingPaths: string[] }>}
 */
function detectConflicts(mods) {
  const enabled = (mods || []).filter((m) => m.enabled && (m.files || []).length > 0);
  const fileToMods = new Map();

  for (const mod of enabled) {
    const disabled = new Set((mod.disabledFiles || []).map(normPath));
    for (const f of mod.files || []) {
      const n = normPath(f);
      if (disabled.has(n)) continue;
      if (!fileToMods.has(n)) fileToMods.set(n, []);
      if (!fileToMods.get(n).some((m) => m.id === mod.id)) {
        fileToMods.get(n).push(mod);
      }
    }
  }

  const pairToPaths = new Map();
  for (const [normedPath, modList] of fileToMods) {
    if (modList.length < 2) continue;
    const origPath = (modList[0].files || []).find((p) => normPath(p) === normedPath) || normedPath;
    for (let i = 0; i < modList.length; i++) {
      for (let j = i + 1; j < modList.length; j++) {
        const a = modList[i];
        const b = modList[j];
        const pairKey = [a.id, b.id].sort().join('::');
        if (!pairToPaths.has(pairKey)) {
          pairToPaths.set(pairKey, { a, b, paths: [] });
        }
        const entry = pairToPaths.get(pairKey);
        if (!entry.paths.some((p) => normPath(p) === normedPath)) {
          entry.paths.push(origPath);
        }
      }
    }
  }

  return [...pairToPaths.values()].map(({ a, b, paths }) => ({
    modA: { id: a.id, displayName: a.displayName || a.id },
    modB: { id: b.id, displayName: b.displayName || b.id },
    conflictingPaths: paths,
  }));
}

/**
 * Resolve a conflict with the chosen strategy.
 * @param {string} gameRoot
 * @param {{ modA: {id}, modB: {id}, conflictingPaths: string[] }} conflict
 * @param {'keepA'|'keepB'|'both'|'merge'|'keepA_disableB_conflicts'|'keepB_disableA_conflicts'} choice
 * @returns {{ ok: boolean, error?: string }}
 */
function resolveConflict(gameRoot, conflict, choice) {
  const records = modRegistry.loadRecords();
  const modA = records.find((r) => r.id === conflict.modA.id);
  const modB = records.find((r) => r.id === conflict.modB.id);
  if (!modA || !modB) return { ok: false, error: 'Mod not found' };

  const paths = new Set((conflict.conflictingPaths || []).map((p) => normPath(p)));

  switch (choice) {
    case 'keepA': {
      const r = modRegistry.disableMod(modB.id, gameRoot);
      if (!r.ok) return r;
      return modRegistry.enableMod(modA.id, gameRoot);
    }
    case 'keepB': {
      const r = modRegistry.disableMod(modA.id, gameRoot);
      if (!r.ok) return r;
      return modRegistry.enableMod(modB.id, gameRoot);
    }
    case 'both':
      return { ok: true };

    case 'merge':
      return { ok: false, error: 'Merge is not supported for these file types. Use another option.' };

    case 'keepA_disableB_conflicts': {
      const disabledB = [...new Set([...(modB.disabledFiles || []), ...conflict.conflictingPaths])];
      modB.disabledFiles = disabledB;
      modRegistry.addRecord(modB);
      const r = modRegistry.disableMod(modB.id, gameRoot);
      if (!r.ok) return r;
      const r2 = modRegistry.enableMod(modA.id, gameRoot);
      if (!r2.ok) return r2;
      return modRegistry.enableMod(modB.id, gameRoot);
    }
    case 'keepB_disableA_conflicts': {
      const disabledA = [...new Set([...(modA.disabledFiles || []), ...conflict.conflictingPaths])];
      modA.disabledFiles = disabledA;
      modRegistry.addRecord(modA);
      const r = modRegistry.disableMod(modA.id, gameRoot);
      if (!r.ok) return r;
      const r2 = modRegistry.enableMod(modB.id, gameRoot);
      if (!r2.ok) return r2;
      return modRegistry.enableMod(modA.id, gameRoot);
    }
    default:
      return { ok: false, error: 'Unknown resolution choice' };
  }
}

/**
 * Check if a mod-to-install would conflict with existing enabled mods.
 * @param {string[]} filesToInstall - paths the new mod would install
 * @param {Array<{id, displayName, enabled, files?, disabledFiles?}>} existingMods
 * @returns {Array<{ mod: {id, displayName}, conflictingPaths: string[] }>}
 */
function detectInstallConflicts(filesToInstall, existingMods) {
  const newPaths = new Set((filesToInstall || []).map(normPath));
  const result = [];
  for (const mod of existingMods || []) {
    if (!mod.enabled) continue;
    const disabled = new Set((mod.disabledFiles || []).map(normPath));
    const conflicts = (mod.files || []).filter((f) => {
      const n = normPath(f);
      return !disabled.has(n) && newPaths.has(n);
    });
    if (conflicts.length) {
      result.push({ mod: { id: mod.id, displayName: mod.displayName || mod.id }, conflictingPaths: conflicts });
    }
  }
  return result;
}

module.exports = {
  detectConflicts,
  resolveConflict,
  detectInstallConflicts,
};
