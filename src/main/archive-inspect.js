/**
 * Inspect archive contents (zip, 7z, rar) before adding mods.
 * Extracts metadata: name, category, images, structure, mod type.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { GAME_ROOT_FOLDERS, ARCHIVE_EXTENSIONS } = require('../shared/constants');
const { extractWith7za } = require('./seven-extract');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/** Normalize path separators to forward slash for consistent matching. */
function normSlash(s) {
  return (s || '').replace(/\\/g, '/');
}

/**
 * Recursively list all files in a directory (relative paths).
 */
function listFilesRecursive(dir, prefix = '') {
  const result = [];
  const full = path.join(dir, prefix);
  if (!fs.existsSync(full)) return result;
  const names = fs.readdirSync(full);
  for (const name of names) {
    const rel = prefix ? `${prefix}/${name}` : name;
    const fullPath = path.join(dir, rel);
    if (fs.statSync(fullPath).isDirectory()) {
      result.push(...listFilesRecursive(dir, rel));
    } else {
      result.push(normSlash(rel));
    }
  }
  return result;
}

/**
 * Get top-level names (files or folders) in a directory.
 */
function getTopLevelNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
}

/**
 * Extract mod name from info.json (REDmod) or manifest.json (Thunderstore).
 */
function extractModNameFromFiles(tempDir, allFiles) {
  for (const rel of allFiles) {
    const lower = normSlash(rel).toLowerCase();
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
 * Extract category from info.json or manifest.json if present.
 */
function extractCategoryFromFiles(tempDir, allFiles) {
  for (const rel of allFiles) {
    const lower = normSlash(rel).toLowerCase();
    if (lower.endsWith('/info.json') || lower === 'info.json') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(tempDir, rel), 'utf8'));
        const cat = data.category || data.Category;
        if (cat && typeof cat === 'string' && cat.trim()) return cat.trim();
      } catch (_) {}
    }
    if (lower === 'manifest.json') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(tempDir, rel), 'utf8'));
        const cats = data.categories;
        if (Array.isArray(cats) && cats.length) {
          const first = cats[0];
          if (typeof first === 'string' && first.trim()) return first.trim();
        }
        const cat = data.category;
        if (cat && typeof cat === 'string' && cat.trim()) return cat.trim();
      } catch (_) {}
    }
  }
  return null;
}

/**
 * Derive display name from archive filename (strip extension and Nexus-style suffix).
 */
function cleanArchiveDisplayName(archiveName) {
  const base = path.basename(archiveName, path.extname(archiveName));
  return base.replace(/-\d+(-\d+){3,}$/, '').trim() || base;
}

/**
 * Infer mod type from structure.
 */
function inferModType(topLevel, tempDir, allFiles) {
  const hasGameRootFolder = topLevel.some((n) => GAME_ROOT_FOLDERS.includes(n.toLowerCase()));
  const singleFolder =
    topLevel.length === 1 && fs.statSync(path.join(tempDir, topLevel[0])).isDirectory();
  const singleFolderHasInfo =
    singleFolder && allFiles.some((f) => normSlash(f).toLowerCase().endsWith('/info.json') || normSlash(f).toLowerCase() === 'info.json');

  if (singleFolderHasInfo) return 'redmod';
  if (hasGameRootFolder) return 'hybrid';
  const hasArchive = allFiles.some((f) => f.toLowerCase().endsWith('.archive'));
  return hasArchive ? 'archive' : 'unknown';
}

/**
 * Inspect an extracted folder and return metadata.
 */
function inspectExtractedFolder(tempDir, archiveName) {
  const allFiles = listFilesRecursive(tempDir);
  const topLevel = getTopLevelNames(tempDir);
  const name = extractModNameFromFiles(tempDir, allFiles) || cleanArchiveDisplayName(archiveName);
  const category = extractCategoryFromFiles(tempDir, allFiles);
  const imagePaths = allFiles.filter((rel) => {
    const ext = path.extname(rel).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
  });
  const modType = inferModType(topLevel, tempDir, allFiles);
  return {
    name,
    category: category || null,
    hasImages: imagePaths.length > 0,
    imagePaths,
    topLevel,
    fileCount: allFiles.length,
    modType,
    supported: true, // structure looks valid for install
  };
}

/**
 * Inspect a .zip archive. Uses AdmZip - no extraction needed for listing,
 * but we extract to temp to read JSON files (simplifies shared logic).
 */
function inspectZip(zipPath, archiveName) {
  const tempDir = path.join(os.tmpdir(), `cp2077-inspect-${Date.now()}`);
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);
    return inspectExtractedFolder(tempDir, archiveName);
  } finally {
    try {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

/**
 * Inspect .7z or .rar archive. Uses bundled 7za via seven-extract.
 */
async function inspect7zOrRar(archivePath, archiveName) {
  const tempDir = path.join(os.tmpdir(), `cp2077-inspect-${Date.now()}`);
  try {
    await extractWith7za(archivePath, tempDir);
    return inspectExtractedFolder(tempDir, archiveName);
  } catch (err) {
    return {
      name: cleanArchiveDisplayName(archiveName),
      category: null,
      hasImages: null,
      imagePaths: [],
      topLevel: [],
      fileCount: 0,
      modType: 'unknown',
      supported: false,
      error: err.message || 'Failed to inspect archive',
    };
  } finally {
    try {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

/**
 * Inspect an archive (zip, 7z, rar) and return metadata.
 * @param {string} archivePath - absolute path to the archive
 * @returns {Promise<{name, category, hasImages, imagePaths, topLevel, fileCount, modType, supported, error?}>}
 */
async function inspectArchive(archivePath) {
  const normalized = path.normalize(archivePath);
  if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) {
    return {
      name: path.basename(archivePath, path.extname(archivePath)),
      category: null,
      hasImages: null,
      imagePaths: [],
      topLevel: [],
      fileCount: 0,
      modType: 'unknown',
      supported: false,
      error: 'File not found or not a file',
    };
  }

  const ext = path.extname(normalized).toLowerCase();
  const archiveName = path.basename(normalized);

  if (ext === '.zip') {
    try {
      return inspectZip(normalized, archiveName);
    } catch (err) {
      return {
        name: cleanArchiveDisplayName(archiveName),
        category: null,
        hasImages: null,
        imagePaths: [],
        topLevel: [],
        fileCount: 0,
        modType: 'unknown',
        supported: false,
        error: err.message || 'Failed to inspect zip',
      };
    }
  }

  if (ext === '.7z' || ext === '.rar') {
    return inspect7zOrRar(normalized, archiveName);
  }

  return {
    name: cleanArchiveDisplayName(archiveName),
    category: null,
    hasImages: null,
    imagePaths: [],
    topLevel: [],
    fileCount: 0,
    modType: 'unknown',
    supported: false,
    error: `Unsupported archive format: ${ext}. Use .zip, .7z, or .rar.`,
  };
}

module.exports = { inspectArchive, cleanArchiveDisplayName };
