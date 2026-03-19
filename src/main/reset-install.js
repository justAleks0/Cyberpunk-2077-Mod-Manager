const fs = require('fs');
const path = require('path');
const modRegistry = require('./mod-registry');

const BACKUP_ROOT_NAME = '_MOD_REMOVER_BACKUPS';
const DELETE_PATHS = ['V2077'];
const RESET_PATHS = [
  'archive/pc/mod',
  'mods',
  'bin/x64/plugins',
  'red4ext',
  'engine/tools',
  'engine/config/platform/pc',
  'bin/x64/LICENSE',
  'bin/x64/global.ini',
  'bin/x64/d3d11.dll',
  'bin/x64/powrprof.dll',
  'bin/x64/winmm.dll',
  'bin/x64/version.dll',
  'engine/config/base',
  'engine/config/galaxy',
  'r6/scripts',
  'r6/tweaks',
  'r6/storages',
  'r6/cache',
  'r6/config',
  'r6/input',
  'r6/audioware',
];

function formatTimestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}

function ensureCyberpunkRoot(gameRoot) {
  const exe = path.join(gameRoot, 'bin', 'x64', 'Cyberpunk2077.exe');
  if (!fs.existsSync(exe)) {
    return { ok: false, error: `File not found ${exe}` };
  }
  return { ok: true };
}

function copyPath(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function clearSourceKeepFolder(src) {
  if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
    fs.rmSync(src, { recursive: true, force: true });
    fs.mkdirSync(src, { recursive: true });
  } else {
    fs.rmSync(src, { recursive: true, force: true });
  }
}

function pruneBackups(backupsRoot, keepLast = 5) {
  const dirs = fs.existsSync(backupsRoot)
    ? fs.readdirSync(backupsRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    : [];
  const toDelete = Math.max(0, dirs.length - keepLast);
  for (let i = 0; i < toDelete; i += 1) {
    fs.rmSync(path.join(backupsRoot, dirs[i]), { recursive: true, force: true });
  }
}

function writeReport(logPath, backupDir, moved, deleted) {
  const lines = [];
  lines.push('Cyberpunk 2077 Mod Manager - Reset Install Report');
  lines.push('----------------------------------------------------------------');
  lines.push(`Backup directory: ${backupDir}`);
  lines.push('');
  if (moved.length) {
    lines.push('Backed up and reset paths:');
    for (const rel of moved) lines.push(`  - ${rel}`);
  } else {
    lines.push('No modded paths were found to back up.');
  }
  lines.push('');
  if (deleted.length) {
    lines.push('Deleted outdated paths:');
    for (const rel of deleted) lines.push(`  - ${rel}`);
  }
  lines.push('');
  lines.push('Help: https://wiki.redmodding.org/cyberpunk-2077-modding/for-mod-users/user-guide-troubleshooting#a-fresh-install-starting-from-scratch');
  fs.writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8');
}

function resetInstallToVanilla(gameRoot) {
  const valid = ensureCyberpunkRoot(gameRoot);
  if (!valid.ok) return valid;

  try {
    const backupsRoot = path.join(gameRoot, BACKUP_ROOT_NAME);
    fs.mkdirSync(backupsRoot, { recursive: true });
    pruneBackups(backupsRoot, 5);

    const backupDir = path.join(backupsRoot, formatTimestamp());
    fs.mkdirSync(backupDir, { recursive: true });
    const logPath = path.join(backupDir, 'disable_all_mods.txt');

    const moved = [];
    for (const rel of RESET_PATHS) {
      const src = path.join(gameRoot, ...rel.split('/'));
      if (!fs.existsSync(src)) continue;
      const dest = path.join(backupDir, ...rel.split('/'));
      copyPath(src, dest);
      clearSourceKeepFolder(src);
      moved.push(rel);
    }

    const deleted = [];
    for (const rel of DELETE_PATHS) {
      const abs = path.join(gameRoot, ...rel.split('/'));
      if (!fs.existsSync(abs)) continue;
      fs.rmSync(abs, { recursive: true, force: true });
      deleted.push(rel);
    }

    writeReport(logPath, backupDir, moved, deleted);
    // Also clear manager-side state so removed mods don't keep showing as installed.
    try {
      modRegistry.saveRecords([]);
      const stashBase = modRegistry.getStashBase();
      if (fs.existsSync(stashBase)) fs.rmSync(stashBase, { recursive: true, force: true });
    } catch (_) {}
    return { ok: true, backupDir, logPath, moved, deleted };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to reset install' };
  }
}

module.exports = {
  resetInstallToVanilla,
};

