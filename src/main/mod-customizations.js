const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CUSTOMIZATIONS_DIR = 'mod-customizations';
const MOD_JSON_FILENAME = 'mod.json';
const LEGACY_FILENAME = 'mod_customizations.json';

function getCustomizationsBaseDir() {
  return path.join(app.getPath('userData'), CUSTOMIZATIONS_DIR);
}

function getModCustomizationsDir(modId) {
  return path.join(getCustomizationsBaseDir(), sanitizeModId(modId));
}

function getModJsonPath(modId) {
  return path.join(getModCustomizationsDir(modId), MOD_JSON_FILENAME);
}

function sanitizeModId(modId) {
  return String(modId || '').replace(/[<>:"/\\|?*]/g, '_') || 'unknown';
}

function sanitizeFilename(name) {
  return String(name || 'image')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 100) || 'image';
}

/**
 * Migrate from legacy single mod_customizations.json to per-mod JSON files.
 * Run once on startup if legacy file exists.
 */
function migrateFromLegacy() {
  const legacyPath = path.join(app.getPath('userData'), LEGACY_FILENAME);
  if (!fs.existsSync(legacyPath)) return;

  try {
    const data = fs.readFileSync(legacyPath, 'utf8');
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return;

    for (const [modId, custom] of Object.entries(parsed)) {
      if (!custom || typeof custom !== 'object') continue;
      const modDir = getModCustomizationsDir(modId);
      fs.mkdirSync(modDir, { recursive: true });
      const jsonPath = path.join(modDir, MOD_JSON_FILENAME);
      const withId = { ...custom, modId };
      fs.writeFileSync(jsonPath, JSON.stringify(withId, null, 2), 'utf8');
    }

    fs.renameSync(legacyPath, legacyPath + '.migrated');
  } catch (err) {
    console.error('Failed to migrate mod customizations', err);
  }
}

migrateFromLegacy();

/**
 * Load all customizations by scanning per-mod folders and reading each mod.json.
 * @returns {{ [modId: string]: { customName?: string, description?: string, tags?: string[], images?: string[], category?: string } }}
 */
function loadAll() {
  const base = getCustomizationsBaseDir();
  const result = {};
  if (!fs.existsSync(base)) return result;

  try {
    const dirs = fs.readdirSync(base, { withFileTypes: true });
    for (const ent of dirs) {
      if (!ent.isDirectory()) continue;
      const jsonPath = path.join(base, ent.name, MOD_JSON_FILENAME);
      if (!fs.existsSync(jsonPath)) continue;
      try {
        const data = fs.readFileSync(jsonPath, 'utf8');
        const parsed = JSON.parse(data);
        if (typeof parsed === 'object' && parsed !== null) {
          const modId = parsed.modId || ent.name;
          const { modId: _stored, ...rest } = parsed;
          result[modId] = rest;
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('Failed to load mod customizations', err);
  }
  return result;
}

/**
 * @param {string} modId
 * @returns {{ customName?: string, description?: string, tags?: string[], images?: string[], category?: string }}
 */
function getCustomization(modId) {
  const jsonPath = getModJsonPath(modId);
  try {
    if (fs.existsSync(jsonPath)) {
      const data = fs.readFileSync(jsonPath, 'utf8');
      const parsed = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null) {
        const { modId: _stored, ...rest } = parsed;
        return rest;
      }
    }
  } catch (err) {
    console.error('Failed to load customization for', modId, err);
  }
  return {};
}

/**
 * Copy an image file into the mod's customization folder.
 * @param {string} modId
 * @param {string} sourceFilePath
 * @returns {{ ok: boolean, filename?: string, error?: string }}
 */
function addModImage(modId, sourceFilePath) {
  const existing = getCustomization(modId);
  const existingImages = existing.images || [];
  if (existingImages.length >= 3) return { ok: false, error: 'Maximum 3 images per mod.' };
  if (!fs.existsSync(sourceFilePath)) return { ok: false, error: 'File not found.' };

  const modDir = getModCustomizationsDir(modId);
  fs.mkdirSync(modDir, { recursive: true });
  const ext = path.extname(sourceFilePath).toLowerCase() || '.png';
  const base = sanitizeFilename(path.basename(sourceFilePath, ext));
  let destName = `${base}${ext}`;
  let idx = 0;
  while (existingImages.includes(destName)) {
    idx += 1;
    destName = `${base}_${idx}${ext}`;
  }
  const destPath = path.join(modDir, destName);
  try {
    fs.copyFileSync(sourceFilePath, destPath);
    return { ok: true, filename: destName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * @param {string} modId
 * @param {{ customName?: string, description?: string, tags?: string[], images?: string[], category?: string }} data
 */
function setCustomization(modId, data) {
  const modDir = getModCustomizationsDir(modId);
  const existing = getCustomization(modId);
  const oldImages = existing.images || [];
  const newImages = Array.isArray(data.images) ? data.images : oldImages;

  for (const name of oldImages) {
    if (!newImages.includes(name)) {
      const filePath = path.join(modDir, name);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_) {}
    }
  }

  const updated = {
    modId,
    ...existing,
    ...data,
    images: newImages,
  };
  if (updated.customName === '') delete updated.customName;
  if (updated.description === '') delete updated.description;
  if (updated.category === '') delete updated.category;
  if (!updated.childAddonName) delete updated.childAddonName;
  if (!updated.childAddonDescription) delete updated.childAddonDescription;
  if (!updated.parentModId) delete updated.parentModId;
  if (!Array.isArray(updated.tags) || updated.tags.length === 0) delete updated.tags;
  if (!Array.isArray(updated.images) || updated.images.length === 0) delete updated.images;

  const jsonPath = getModJsonPath(modId);
  const hasContent = [updated.customName, updated.description, updated.category, updated.childAddonName, updated.childAddonDescription].some(Boolean) ||
    (Array.isArray(updated.tags) && updated.tags.length > 0) ||
    (Array.isArray(updated.images) && updated.images.length > 0) ||
    updated.nexusModId != null ||
    (updated.nexusUrl && updated.nexusUrl.trim()) ||
    (updated.parentModId && updated.parentModId.trim());
  if (!hasContent) {
    try {
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
      if (fs.existsSync(modDir) && fs.readdirSync(modDir).length === 0) {
        fs.rmdirSync(modDir);
      }
    } catch (_) {}
    return;
  }

  try {
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(updated, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save mod customization', err);
    throw err;
  }
}

function getCustomizationsPath() {
  return getCustomizationsBaseDir();
}

module.exports = {
  getCustomization,
  setCustomization,
  addModImage,
  getCustomizationsPath,
  getModCustomizationsDir,
  loadAll,
};
