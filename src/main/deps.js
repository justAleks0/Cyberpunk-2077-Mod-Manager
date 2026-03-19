const fs = require('fs');
const path = require('path');

/**
 * Find a REDmod info.json path from a ModRecord's file list.
 * @param {string[]} files
 * @returns {string|null} relative path like "mods/MyMod/info.json"
 */
function findRedmodInfoRelPath(files) {
  const info = (files || []).find((f) => f.toLowerCase().startsWith('mods/') && f.toLowerCase().endsWith('/info.json'));
  return info || null;
}

/**
 * Basic dependency check for a tracked REDmod based on its info.json.
 * This is best-effort: different mods use different schemas.
 *
 * @param {string} gameRoot
 * @param {import('./mod-registry').ModRecord} mod
 * @param {import('./mod-registry').ModRecord[]} allMods
 * @returns {{ ok: boolean, modId: string, dependencies: any[], missing: any[], warnings: string[] }}
 */
function checkRedmodDependencies(gameRoot, mod, allMods) {
  const warnings = [];
  const dependencies = [];
  const missing = [];

  const relInfo = findRedmodInfoRelPath(mod.files);
  if (!relInfo) {
    return { ok: true, modId: mod.id, dependencies: [], missing: [], warnings: ['No info.json found for this mod record'] };
  }

  const infoPath = path.join(gameRoot, relInfo);
  if (!fs.existsSync(infoPath)) {
    return { ok: false, modId: mod.id, dependencies: [], missing: [], warnings: [`info.json missing at ${relInfo}`] };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  } catch (e) {
    return { ok: false, modId: mod.id, dependencies: [], missing: [], warnings: ['Failed to parse info.json'] };
  }

  const rawDeps = parsed.dependencies || parsed.dependsOn || [];
  if (Array.isArray(rawDeps)) {
    dependencies.push(...rawDeps);
  } else if (rawDeps && typeof rawDeps === 'object') {
    dependencies.push(...Object.keys(rawDeps));
  }

  // Heuristic matching: try to match dependency strings to enabled mod displayName or sourceArchiveName.
  const enabled = allMods.filter((m) => m.enabled);
  const enabledNames = enabled.map((m) => ({
    id: m.id,
    displayName: (m.displayName || '').toLowerCase(),
    sourceArchiveName: (m.sourceArchiveName || '').toLowerCase(),
  }));

  for (const dep of dependencies) {
    const depStr = typeof dep === 'string' ? dep : (dep?.name || dep?.id || JSON.stringify(dep));
    const needle = (depStr || '').toLowerCase();
    if (!needle) continue;
    const found = enabledNames.some((m) => m.displayName.includes(needle) || m.sourceArchiveName.includes(needle));
    if (!found) missing.push(dep);
  }

  if (dependencies.length === 0) warnings.push('No dependencies declared in info.json');

  return { ok: missing.length === 0, modId: mod.id, dependencies, missing, warnings };
}

module.exports = {
  checkRedmodDependencies,
};

