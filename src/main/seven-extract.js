/**
 * Extract .7z / .rar using bundled 7za. Falls back to node-unrar-js for .rar when 7za fails.
 * Uses child_process.spawn with detached:false (node-7z uses detached:true which breaks on Windows).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function get7zaPath() {
  const sevenBin = require('7zip-bin');
  let bin = sevenBin.path7za;
  if (app.isPackaged && bin.includes('app.asar') && !bin.includes('app.asar.unpacked')) {
    bin = bin.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
  }
  return bin;
}

const SEVEN_ZIP_RAR_ERRORS = [
  'cannot open the file as archive',
  'unsupported archive type',
];

function is7zaRarFailure(err) {
  const msg = (err && err.message || '').toLowerCase();
  return SEVEN_ZIP_RAR_ERRORS.some((s) => msg.includes(s));
}

async function extractRarWithUnrarJs(archivePath, outputDir) {
  const { createExtractorFromFile } = require('node-unrar-js');
  const absArchive = path.resolve(archivePath);
  const absOut = path.resolve(outputDir);
  fs.mkdirSync(absOut, { recursive: true });
  const extractor = await createExtractorFromFile({
    filepath: absArchive,
    targetPath: absOut,
  });
  for (const _ of extractor.extract().files) {
    /* consume iterator to extract all files */
  }
}

/**
 * @param {string} archivePath - absolute path to .7z or .rar
 * @param {string} outputDir - directory to extract into (created if missing)
 * @returns {Promise<void>}
 */
async function extractWith7za(archivePath, outputDir) {
  const ext = path.extname(archivePath).toLowerCase();
  const try7za = () =>
    new Promise((resolve, reject) => {
      const bin = get7zaPath();
      if (!fs.existsSync(bin)) {
        reject(new Error(`7-Zip executable not found at ${bin}`));
        return;
      }
      fs.mkdirSync(outputDir, { recursive: true });
      const absArchive = path.resolve(archivePath);
      const absOut = path.resolve(outputDir);
      const args = ext === '.rar'
        ? ['x', '-tRar', absArchive, `-o${absOut}`, '-y']
        : ['x', absArchive, `-o${absOut}`, '-y'];
      const proc = spawn(bin, args, {
        windowsHide: true,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.stdout.on('data', () => {});
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `7-Zip exited with code ${code}`));
      });
    });

  try {
    await try7za();
  } catch (err) {
    if (ext === '.rar' && is7zaRarFailure(err)) {
      try {
        await extractRarWithUnrarJs(archivePath, outputDir);
        return;
      } catch (fallbackErr) {
        throw new Error(
          `7-Zip failed: ${err.message}. UnRAR fallback also failed: ${fallbackErr.message}. The file may be corrupted—try re-downloading or converting to ZIP.`
        );
      }
    }
    throw err;
  }
}

module.exports = { get7zaPath, extractWith7za };
