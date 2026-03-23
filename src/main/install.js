const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');
const AdmZip = require('adm-zip');
const { GAME_ROOT_FOLDERS, ARCHIVE_EXTENSIONS } = require('../shared/constants');
const modRegistry = require('./mod-registry');
const { extractWith7za } = require('./seven-extract');

/**
 * Extract .7z or .rar to temp directory using 7-Zip (spawn, not node-7z; avoids detached:true issues on Windows).
 * @param {string} archivePath
 * @returns {Promise<string>} temp dir path
 */
async function extract7zOrRarToTemp(archivePath) {
  const tempDir = path.join(os.tmpdir(), `cp2077-mod-${Date.now()}`);
  await extractWith7za(archivePath, tempDir);
  return tempDir;
}

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
 * Extract mod display name from metadata inside the archive.
 * Looks for REDmod info.json (name) and Thunderstore manifest.json (name with underscores → spaces).
 * @param {string} tempDir
 * @param {string[]} allFiles - relative paths from listFilesRecursive
 * @returns {string|null}
 */
function extractModNameFromArchive(tempDir, allFiles) {
  for (const rel of allFiles) {
    const lower = rel.toLowerCase();
    if (lower.endsWith('/info.json') || lower === 'info.json') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(tempDir, rel), 'utf8'));
        const name = data.name || data.friendlyName;
        if (name && typeof name === 'string' && name.trim()) return name.trim();
      } catch (_) {}
    }
    if (lower === 'manifest.json') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(tempDir, rel), 'utf8'));
        const name = data.name;
        if (name && typeof name === 'string' && name.trim()) {
          return name.replace(/_/g, ' ').trim();
        }
      } catch (_) {}
    }
  }
  return null;
}

/**
 * Derive a clean display name from archive filename.
 * Strips extension and Nexus-style suffix (e.g. -3850-3-1-5-1760299171).
 * @param {string} archiveName
 * @returns {string}
 */
function cleanArchiveDisplayName(archiveName) {
  const base = path.basename(archiveName, path.extname(archiveName));
  return base.replace(/-\d+(-\d+){3,}$/, '').trim() || base;
}

/**
 * Install from an extracted folder into game root.
 * @param {string} tempDir - path to extracted folder
 * @param {string} archiveName - original archive filename for the mod record
 * @param {string} gameRoot - absolute path to game root
 * @returns {{ ok: boolean, files?: string[], error?: string }}
 */
function installFromExtractedFolder(tempDir, archiveName, gameRoot) {
  const topLevel = getTopLevelNames(tempDir);
  const allFilesInArchive = listFilesRecursive(tempDir);
  const displayName = extractModNameFromArchive(tempDir, allFilesInArchive) || cleanArchiveDisplayName(archiveName);
  if (isDuplicateInstall(archiveName, displayName)) {
    return { ok: false, error: `Mod "${displayName}" appears to be already installed` };
  }

  const hasGameRootFolder = topLevel.some((n) => GAME_ROOT_FOLDERS.includes(n.toLowerCase()));
  const singleFolder = topLevel.length === 1 && fs.statSync(path.join(tempDir, topLevel[0])).isDirectory();
  const singleFolderHasInfo = singleFolder && hasFile(tempDir, `${topLevel[0]}/info.json`);

  let filesToCopy = [];

  if (hasGameRootFolder) {
    const allFiles = listFilesRecursive(tempDir);
    filesToCopy = allFiles.map((rel) => ({
      src: path.join(tempDir, rel),
      relDest: rel,
    }));
  } else if (singleFolderHasInfo) {
    const folderName = topLevel[0];
    const subFiles = listFilesRecursive(tempDir, folderName);
    filesToCopy = subFiles.map((rel) => ({
      src: path.join(tempDir, rel),
      relDest: `mods/${rel}`,
    }));
  } else {
    const allFiles = listFilesRecursive(tempDir);
    const archiveFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.archive'));
    if (archiveFiles.length > 0) {
      const base = allFiles.some((f) => f.startsWith('archive/')) ? '' : 'archive/pc/mod';
      filesToCopy = allFiles.map((rel) => {
        const dest = base ? `${base}/${path.basename(rel)}` : rel;
        return { src: path.join(tempDir, rel), relDest: dest };
      });
    } else {
      const first = topLevel[0];
      if (topLevel.length === 1 && fs.statSync(path.join(tempDir, first)).isDirectory()) {
        const subFiles = listFilesRecursive(tempDir, first);
        filesToCopy = subFiles.map((rel) => ({
          src: path.join(tempDir, rel),
          relDest: rel,
        }));
      } else {
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

  return { ok: true, files: written, modId };
}

/**
 * Install from a zip archive into game root. Supports:
 * - Merge: archive has top-level archive, bin, r6, red4ext, or mods -> merge into game root.
 * - REDmod: single top-level folder with info.json -> extract to gameRoot/mods/<folderName>.
 * - Archive: .archive file(s) at root or under archive/pc/mod -> extract to gameRoot/archive/pc/mod.
 * @param {string} zipPath - absolute path to .zip
 * @param {string} gameRoot - absolute path to game root
 * @param {string} [sourceArchiveName] - filename of the archive for the mod record
 * @returns {{ ok: boolean, files?: string[], error?: string }}
 */
function installFromZip(zipPath, gameRoot, sourceArchiveName) {
  const archiveName = sourceArchiveName || path.basename(zipPath);
  if (modRegistry.isAlreadyInstalled(archiveName)) {
    return { ok: false, error: 'This archive appears to be already installed' };
  }
  let tempDir;
  try {
    tempDir = extractZipToTemp(zipPath);
    const result = installFromExtractedFolder(tempDir, archiveName, gameRoot);
    fs.rmSync(tempDir, { recursive: true, force: true });
    return result;
  } catch (err) {
    if (tempDir && fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
    return { ok: false, error: err.message };
  }
}

/**
 * Install from .zip, .7z, or .rar archive. Async for 7z/rar extraction.
 * @param {string} archivePath - absolute path to archive
 * @param {string} gameRoot - absolute path to game root
 * @param {string} [sourceArchiveName] - filename of the archive for the mod record
 * @returns {Promise<{ ok: boolean, files?: string[], error?: string }>}
 */
async function installFromArchive(archivePath, gameRoot, sourceArchiveName) {
  const archiveName = sourceArchiveName || path.basename(archivePath);
  if (modRegistry.isAlreadyInstalled(archiveName)) {
    return { ok: false, error: 'This archive appears to be already installed' };
  }

  const ext = path.extname(archivePath).toLowerCase();
  let tempDir;

  try {
    if (ext === '.zip') {
      tempDir = extractZipToTemp(archivePath);
    } else if (ext === '.7z' || ext === '.rar') {
      tempDir = await extract7zOrRarToTemp(archivePath);
    } else {
      return { ok: false, error: `Unsupported format: ${ext}. Use .zip, .7z, or .rar.` };
    }

    const result = installFromExtractedFolder(tempDir, archiveName, gameRoot);
    fs.rmSync(tempDir, { recursive: true, force: true });
    return result;
  } catch (err) {
    if (tempDir && fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
    return { ok: false, error: err.message };
  }
}

/**
 * Install all archives from the Foundational Mods folder. Supports .zip, .7z, .rar.
 * @param {string} gameRoot
 * @returns {Promise<{ ok: boolean, installed: string[], skipped: { file: string }[], failed: { file: string, reason: string }[] }>}
 */
async function installFoundationalMods(gameRoot) {
  const base = getFoundationalModsPath();
  const installed = [];
  const skipped = [];
  const failed = [];
  if (!fs.existsSync(base)) {
    return {
      ok: false,
      installed: [],
      skipped: [],
      failed: [{ file: 'Foundational Mods folder', reason: 'Folder not found' }],
    };
  }
  const names = fs.readdirSync(base);
  const archives = names.filter((n) => ARCHIVE_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext)));
  for (const name of archives) {
    const fullPath = path.join(base, name);
    const displayName = path.basename(name, path.extname(name));
    if (isDuplicateInstall(name, displayName)) {
      skipped.push({ file: name });
      continue;
    }
    const result = await installFromArchive(fullPath, gameRoot, name);
    if (result.ok) installed.push(name);
    else
      failed.push({
        file: name,
        reason: result.error || 'Installation failed',
      });
  }
  return {
    ok: failed.length === 0,
    installed,
    skipped,
    failed,
  };
}

module.exports = {
  installFromZip,
  installFromArchive,
  extractZipToTemp,
  installFoundationalMods,
  getFoundationalModsPath,
};
