const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');
const AdmZip = require('adm-zip');
const { GAME_ROOT_FOLDERS, ARCHIVE_EXTENSIONS } = require('../shared/constants');
const modRegistry = require('./mod-registry');

function isDuplicateInstall(archiveName, displayName) {
  if (modRegistry.isAlreadyInstalled(archiveName)) return true;
  const records = modRegistry.loadRecords();
  const displayNeedle = (displayName || '').trim().toLowerCase();
  return records.some((r) => (r.displayName || '').trim().toLowerCase() === displayNeedle);
}

function getFoundationalModsPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'Foundational Mods');
  }
  return path.join(path.dirname(path.dirname(path.dirname(__dirname))), 'Foundational Mods');
}

/**
 * Extract zip to a temp directory and return the path.
 * @param {string} zipPath
 * @returns {string} temp dir path
 */
function extractZipToTemp(zipPath) {
  const zip = new AdmZip(zipPath);
  const tempDir = path.join(os.tmpdir(), `cp2077-mod-${Date.now()}`);
  zip.extractAllTo(tempDir, true);
  return tempDir;
}

/**
 * Get top-level names (files or folders) in a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function getTopLevelNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
}

/**
 * Check if dir contains a file at relative path.
 */
function hasFile(dir, relPath) {
  return fs.existsSync(path.join(dir, relPath));
}

/**
 * Recursively list all files in a directory (relative paths).
 * @param {string} dir
 * @param {string} prefix
 * @returns {string[]}
 */
function listFilesRecursive(dir, prefix = '') {
  const result = [];
  const names = fs.readdirSync(path.join(dir, prefix));
  for (const name of names) {
    const rel = prefix ? `${prefix}/${name}` : name;
    const full = path.join(dir, rel);
    if (fs.statSync(full).isDirectory()) {
      result.push(...listFilesRecursive(dir, rel));
    } else {
      result.push(rel.replace(/\\/g, '/'));
    }
  }
  return result;
}

/**
 * Copy a file from src to dest (creates parent dirs).
 */
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/**
 * Install from a zip archive into game root. Supports:
 * - Merge: zip has top-level archive, bin, r6, red4ext, or mods -> merge into game root.
 * - REDmod: single top-level folder with info.json -> extract to gameRoot/mods/<folderName>.
 * - Archive: .archive file(s) at root or under archive/pc/mod -> extract to gameRoot/archive/pc/mod.
 * @param {string} zipPath - absolute path to .zip
 * @param {string} gameRoot - absolute path to game root
 * @param {string} [sourceArchiveName] - filename of the zip for the mod record
 * @returns {{ ok: boolean, files?: string[], error?: string }}
 */
function installFromZip(zipPath, gameRoot, sourceArchiveName) {
  const archiveName = sourceArchiveName || path.basename(zipPath);
  const displayName = path.basename(archiveName, path.extname(archiveName));
  if (isDuplicateInstall(archiveName, displayName)) {
    return { ok: false, error: `Mod "${displayName}" appears to be already installed` };
  }
  let tempDir;
  try {
    tempDir = extractZipToTemp(zipPath);
    const topLevel = getTopLevelNames(tempDir);

    const hasGameRootFolder = topLevel.some((n) => GAME_ROOT_FOLDERS.includes(n.toLowerCase()));
    const singleFolder = topLevel.length === 1 && fs.statSync(path.join(tempDir, topLevel[0])).isDirectory();
    const singleFolderHasInfo = singleFolder && hasFile(tempDir, `${topLevel[0]}/info.json`);

    let filesToCopy = []; // array of { src, relDest } where relDest is relative to game root

    if (hasGameRootFolder) {
      // Merge: every file under temp goes to gameRoot/<same path>
      const allFiles = listFilesRecursive(tempDir);
      filesToCopy = allFiles.map((rel) => ({
        src: path.join(tempDir, rel),
        relDest: rel,
      }));
    } else if (singleFolderHasInfo) {
      // REDmod: one folder with info.json -> mods/<folderName>
      const folderName = topLevel[0];
      const subFiles = listFilesRecursive(tempDir, folderName);
      filesToCopy = subFiles.map((rel) => ({
        src: path.join(tempDir, rel),
        relDest: `mods/${rel}`,
      }));
    } else {
      // Check for .archive at root or under archive/pc/mod
      const allFiles = listFilesRecursive(tempDir);
      const archiveFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.archive'));
      if (archiveFiles.length > 0) {
        const base = allFiles.some((f) => f.startsWith('archive/')) ? '' : 'archive/pc/mod';
        filesToCopy = allFiles.map((rel) => {
          const dest = base ? `${base}/${path.basename(rel)}` : rel;
          return { src: path.join(tempDir, rel), relDest: dest };
        });
      } else {
        // Fallback: merge everything under first segment if it looks like game structure
        const first = topLevel[0];
        if (topLevel.length === 1 && fs.statSync(path.join(tempDir, first)).isDirectory()) {
          const subFiles = listFilesRecursive(tempDir, first);
          filesToCopy = subFiles.map((rel) => ({
            src: path.join(tempDir, rel),
            relDest: rel,
          }));
        } else {
          fs.rmSync(tempDir, { recursive: true, force: true });
          return { ok: false, error: 'Could not determine mod structure. Expected game root folders (archive, bin, r6, mods), REDmod folder with info.json, or .archive files.' };
        }
      }
    }

    const written = [];
    for (const { src, relDest } of filesToCopy) {
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
      const dest = path.join(gameRoot, relDest);
      copyFile(src, dest);
      written.push(relDest);
    }

    fs.rmSync(tempDir, { recursive: true, force: true });

    const modId = `${archiveName.replace(/\.[^.]+$/, '').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
    modRegistry.addRecord({
      id: modId,
      displayName,
      type: singleFolderHasInfo ? 'redmod' : hasGameRootFolder ? 'hybrid' : 'archive',
      enabled: true,
      installedAt: Date.now(),
      files: written,
      sourceArchiveName: archiveName,
    });

    return { ok: true, files: written };
  } catch (err) {
    if (tempDir && fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
    return { ok: false, error: err.message };
  }
}

/**
 * Install all archives from the Foundational Mods folder. Only .zip supported for now.
 * @param {string} gameRoot
 * @returns {{ ok: boolean, installed: string[], errors: { file: string, error: string }[] }}
 */
function installFoundationalMods(gameRoot) {
  const base = getFoundationalModsPath();
  const installed = [];
  const errors = [];
  if (!fs.existsSync(base)) {
    return { ok: false, installed: [], errors: [{ file: base, error: 'Foundational Mods folder not found' }] };
  }
  const names = fs.readdirSync(base);
  const zips = names.filter((n) => ARCHIVE_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext)));
  for (const name of zips) {
    const fullPath = path.join(base, name);
    const displayName = path.basename(name, path.extname(name));
    if (isDuplicateInstall(name, displayName)) {
      errors.push({ file: name, error: 'Already installed (duplicate skipped)' });
      continue;
    }
    if (!name.toLowerCase().endsWith('.zip')) {
      errors.push({ file: name, error: 'Only .zip supported for now' });
      continue;
    }
    const result = installFromZip(fullPath, gameRoot, name);
    if (result.ok) installed.push(name);
    else errors.push({ file: name, error: result.error || 'Unknown error' });
  }
  return { ok: errors.length === 0, installed, errors };
}

module.exports = {
  installFromZip,
  extractZipToTemp,
  installFoundationalMods,
  getFoundationalModsPath,
};
