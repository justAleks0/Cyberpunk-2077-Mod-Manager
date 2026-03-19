const path = require('path');
const fs = require('fs');
const { DEFAULT_GAME_PATHS, GAME_LAUNCHER_EXE, GAME_FALLBACK_EXE } = require('../shared/constants');

/**
 * Get list of default paths to check for the game (in order).
 * @returns {string[]}
 */
function getDefaultPaths() {
  const candidates = [
    DEFAULT_GAME_PATHS.steam,
    DEFAULT_GAME_PATHS.gog,
    DEFAULT_GAME_PATHS.epic,
    DEFAULT_GAME_PATHS.steamLibraryCommon,
  ].filter(Boolean);

  // Additional SteamLibrary locations on other drives (e.g. D:\SteamLibrary\...)
  const systemDrive = process.env.SystemDrive?.[0];
  const drives = new Set();
  if (systemDrive) drives.add(systemDrive.toUpperCase());
  for (let code = 65; code <= 90; code++) drives.add(String.fromCharCode(code));

  for (const letter of drives) {
    const p = `${letter}:\\SteamLibrary\\steamapps\\common\\Cyberpunk 2077`;
    candidates.push(p);
  }

  // Deduplicate while preserving order
  const seen = new Set();
  return candidates.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
}

/**
 * Check if a path looks like a valid Cyberpunk 2077 game root.
 * @param {string} gamePath
 * @returns {{ valid: boolean, exePath?: string, error?: string }}
 */
function validateGamePath(gamePath) {
  if (!gamePath || typeof gamePath !== 'string') {
    return { valid: false, error: 'No path provided' };
  }
  const normalized = path.normalize(gamePath.trim());
  if (!path.isAbsolute(normalized)) {
    return { valid: false, error: 'Path must be absolute' };
  }
  try {
    if (!fs.existsSync(normalized)) {
      return { valid: false, error: 'Folder does not exist' };
    }
    if (!fs.statSync(normalized).isDirectory()) {
      return { valid: false, error: 'Path is not a folder' };
    }

    const launcherPath = path.join(normalized, GAME_LAUNCHER_EXE);
    const fallbackPath = path.join(normalized, GAME_FALLBACK_EXE);

    if (fs.existsSync(launcherPath)) {
      return { valid: true, exePath: launcherPath, required: GAME_LAUNCHER_EXE };
    }
    if (fs.existsSync(fallbackPath)) {
      return { valid: true, exePath: fallbackPath, required: GAME_FALLBACK_EXE };
    }

    return { valid: false, error: `Could not find ${GAME_LAUNCHER_EXE} (or fallback ${GAME_FALLBACK_EXE}) in this folder` };
  } catch (err) {
    return { valid: false, error: err.message || 'Invalid path' };
  }
}

/**
 * Auto-detect game path by checking default locations.
 * @returns {{ found: string | null, checked: string[] }}
 */
function detectGamePath() {
  const checked = getDefaultPaths();
  for (const candidate of checked) {
    const result = validateGamePath(candidate);
    if (result.valid) {
      return { found: path.normalize(candidate), checked };
    }
  }
  return { found: null, checked };
}

module.exports = {
  getDefaultPaths,
  validateGamePath,
  detectGamePath,
};
