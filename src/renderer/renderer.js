const statusEl = document.getElementById('game-status');
const pathEl = document.getElementById('game-path');
const downloadPathEl = document.getElementById('download-folder-path');

let loadingCount = 0;
const loadingEl = document.getElementById('loading-indicator');
const loadingTextEl = loadingEl ? loadingEl.querySelector('.loading-text') : null;
const MIN_LOADING_VISIBLE_MS = 1500;
let loadingShownAt = 0;
let hideTimer = null;
const contextMenuEl = document.getElementById('mod-context-menu');
const contextShowFilesAppBtn = document.getElementById('ctx-show-files-app');
const contextShowFilesExplorerBtn = document.getElementById('ctx-show-files-explorer');
const contextUninstallBtn = document.getElementById('ctx-uninstall-mod');
let contextMenuMod = null;
const depsReportModalEl = document.getElementById('deps-report-modal');
const depsReportContentEl = document.getElementById('deps-report-content');
const depsReportCloseBtn = document.getElementById('deps-report-close');
const modFilesModalEl = document.getElementById('mod-files-modal');
const modFilesTitleEl = document.getElementById('mod-files-title');
const modFilesContentEl = document.getElementById('mod-files-content');
const modFilesCloseBtn = document.getElementById('mod-files-close');

function showLoading(message) {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  loadingCount += 1;
  if (loadingEl) {
    if (loadingTextEl) loadingTextEl.textContent = message || 'Working...';
    loadingEl.classList.add('visible');
    loadingEl.setAttribute('aria-hidden', 'false');
    if (loadingCount === 1) loadingShownAt = Date.now();
  }
}

function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0 && loadingEl) {
    const elapsed = Date.now() - loadingShownAt;
    const remaining = Math.max(0, MIN_LOADING_VISIBLE_MS - elapsed);
    hideTimer = setTimeout(() => {
      loadingEl.classList.remove('visible');
      loadingEl.setAttribute('aria-hidden', 'true');
      hideTimer = null;
    }, remaining);
  }
}

function withLoading(labelOrFn, maybeFn) {
  const label = typeof labelOrFn === 'string' ? labelOrFn : 'Working...';
  const fn = typeof labelOrFn === 'function' ? labelOrFn : maybeFn;
  return async (...args) => {
    showLoading(label);
    try {
      return await fn(...args);
    } finally {
      hideLoading();
    }
  };
}

function hideModContextMenu() {
  contextMenuMod = null;
  if (contextMenuEl) {
    contextMenuEl.classList.remove('visible');
    contextMenuEl.setAttribute('aria-hidden', 'true');
  }
}

function showModContextMenu(mod, x, y) {
  if (!contextMenuEl) return;
  contextMenuMod = mod;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = 190;
  const height = 128;
  const left = Math.min(Math.max(8, x), vw - width - 8);
  const top = Math.min(Math.max(8, y), vh - height - 8);
  contextMenuEl.style.left = `${left}px`;
  contextMenuEl.style.top = `${top}px`;
  contextMenuEl.classList.add('visible');
  contextMenuEl.setAttribute('aria-hidden', 'false');
}

function showModFilesModal(mod) {
  if (!modFilesModalEl || !modFilesContentEl || !modFilesTitleEl) return;
  const name = mod.displayName || mod.id;
  modFilesTitleEl.textContent = `Files for ${name}`;
  const lines = (mod.files || []).length
    ? mod.files.map((f) => `- ${f}`).join('\n')
    : 'No tracked files recorded for this mod.';
  modFilesContentEl.textContent = lines;
  modFilesModalEl.classList.add('visible');
  modFilesModalEl.setAttribute('aria-hidden', 'false');
}

function hideModFilesModal() {
  if (!modFilesModalEl) return;
  modFilesModalEl.classList.remove('visible');
  modFilesModalEl.setAttribute('aria-hidden', 'true');
}

function showDepsReport(text) {
  if (!depsReportModalEl || !depsReportContentEl) return;
  depsReportContentEl.textContent = text;
  depsReportModalEl.classList.add('visible');
  depsReportModalEl.setAttribute('aria-hidden', 'false');
}

function hideDepsReport() {
  if (!depsReportModalEl) return;
  depsReportModalEl.classList.remove('visible');
  depsReportModalEl.setAttribute('aria-hidden', 'true');
}

async function refreshGameStatus() {
  const path = await window.cp2077.getGamePath();
  const launchBtn = document.getElementById('btn-launch-game');
  const pushBtn = document.getElementById('btn-push-mods');
  if (path) {
    statusEl.textContent = 'Game found';
    statusEl.className = 'status ok';
    pathEl.textContent = path;
    if (launchBtn) launchBtn.disabled = false;
    if (pushBtn) pushBtn.disabled = false;
  } else {
    statusEl.textContent = 'Game not set. Use Auto-detect or Select folder.';
    statusEl.className = 'status error';
    pathEl.textContent = '';
    if (launchBtn) launchBtn.disabled = true;
    if (pushBtn) pushBtn.disabled = true;
  }
}

async function refreshDownloadFolder() {
  const path = await window.cp2077.getDownloadFolder();
  downloadPathEl.textContent = path || 'Not set';
}

document.getElementById('btn-detect-game').addEventListener('click', withLoading('Detecting game folder...', async () => {
  statusEl.textContent = 'Detecting…';
  const result = await window.cp2077.detectGame();
  if (result.ok) {
    await refreshGameStatus();
    await refreshModList();
  } else {
    statusEl.textContent = 'Could not auto-detect game. Try "Select folder".';
    statusEl.className = 'status error';
    pathEl.textContent = '';
  }
}));

document.getElementById('btn-select-game').addEventListener('click', withLoading('Validating selected game folder...', async () => {
  const result = await window.cp2077.selectGameFolder();
  if (result.canceled) return;
  if (result.ok) {
    await refreshGameStatus();
    await refreshModList();
  } else {
    statusEl.textContent = result.error || 'Invalid folder';
    statusEl.className = 'status error';
  }
}));

document.getElementById('btn-launch-game').addEventListener('click', withLoading('Launching Cyberpunk 2077...', async () => {
  const result = await window.cp2077.launchGame();
  if (!result.ok) {
    alert(result.error || 'Could not launch game.');
  }
}));

document.getElementById('btn-set-download-folder').addEventListener('click', withLoading('Setting mods download folder...', async () => {
  const result = await window.cp2077.selectDownloadFolder();
  if (result.canceled) return;
  if (result.ok) await refreshDownloadFolder();
}));

document.getElementById('btn-install-file').addEventListener('click', withLoading('Installing mod from archive...', async () => {
  const result = await window.cp2077.installFromFile();
  if (result.needGamePath) {
    const sel = await window.cp2077.selectGameFolder();
    if (sel.canceled || !sel.ok) return;
    await refreshGameStatus();
    const installResult = await window.cp2077.installFromFile();
    if (installResult.ok) await refreshModList();
    else if (!installResult.canceled) alert(installResult.error || 'Install failed');
  } else if (result.ok) {
    await refreshModList();
  } else if (!result.canceled && result.error) {
    alert(result.error);
  }
}));

document.getElementById('btn-install-foundational').addEventListener('click', withLoading('Installing foundational mods...', async () => {
  const gamePath = await window.cp2077.getGamePath();
  if (!gamePath) {
    const sel = await window.cp2077.selectGameFolder();
    if (sel.canceled || !sel.ok) return;
    await refreshGameStatus();
  }
  const result = await window.cp2077.installFoundational();
  if (result.error) alert(result.error);
  else {
    if (result.installed && result.installed.length) await refreshModList();
    if (result.errors && result.errors.length) alert(`Some failed: ${result.errors.map((e) => `${e.file}: ${e.error}`).join('\n')}`);
  }
}));

document.getElementById('btn-reset-install').addEventListener('click', withLoading('Resetting install and backing up mods...', async () => {
  const gamePath = await window.cp2077.getGamePath();
  if (!gamePath) {
    alert('Game path not set.');
    return;
  }
  const sure = confirm(
    'This will back up and remove modded files/folders from your Cyberpunk 2077 install.\n\nPress OK to continue.'
  );
  if (!sure) return;
  const result = await window.cp2077.resetInstall();
  if (!result.ok) {
    alert(result.error || 'Reset failed.');
    return;
  }
  const moved = Array.isArray(result.moved) ? result.moved.length : 0;
  const deleted = Array.isArray(result.deleted) ? result.deleted.length : 0;
  showDepsReport(
    `Installation reset complete.\n\nVERIFY YOUR GAME FILES NOW.\n\nBacked up + reset paths: ${moved}\nDeleted outdated paths: ${deleted}\n\nBackup folder:\n${result.backupDir}\n\nLog file:\n${result.logPath}`
  );
  await refreshModList();
  await refreshLoadOrder();
}));

document.getElementById('btn-push-mods').addEventListener('click', withLoading('Pushing active mods to game...', async () => {
  const result = await window.cp2077.pushMods();
  if (!result.ok) {
    alert(result.error || 'Failed to push mods.');
    return;
  }
  await refreshModList();
  await refreshLoadOrder();
}));

contextUninstallBtn.addEventListener('click', withLoading('Uninstalling mod...', async () => {
  if (!contextMenuMod) return;
  const modId = contextMenuMod.id;
  const name = contextMenuMod.displayName || contextMenuMod.id;
  hideModContextMenu();
  if (!confirm(`Uninstall "${name}"? This will remove tracked files and remove it from the manager.`)) return;
  const result = await window.cp2077.uninstallMod(modId);
  if (!result.ok) {
    alert(result.error || 'Failed to uninstall mod.');
    return;
  }
  await refreshModList();
  await refreshLoadOrder();
}));

contextShowFilesAppBtn.addEventListener('click', () => {
  if (!contextMenuMod) return;
  const mod = contextMenuMod;
  hideModContextMenu();
  showModFilesModal(mod);
});

contextShowFilesExplorerBtn.addEventListener('click', withLoading('Opening mod files in file explorer...', async () => {
  if (!contextMenuMod) return;
  const modId = contextMenuMod.id;
  hideModContextMenu();
  const res = await window.cp2077.showFilesInExplorer(modId);
  if (!res.ok) alert(res.error || 'Could not open file location.');
}));

async function checkDownloadFolderAndPrompt() {
  const { pending, folder } = await window.cp2077.checkDownloadFolder();
  if (!folder || pending.length === 0) return;
  const install = confirm(`${pending.length} new mod(s) found in the mods download folder. Install them?`);
  if (!install) return;
  for (const p of pending) {
    const result = await window.cp2077.installFromPath(p);
    if (!result.ok) alert(`Failed: ${p}\n${result.error}`);
  }
  await refreshModList();
}

document.getElementById('btn-check-download-folder').addEventListener('click', withLoading('Scanning mods download folder...', checkDownloadFolderAndPrompt));

document.getElementById('btn-check-deps').addEventListener('click', withLoading('Checking dependencies for all mods...', async () => {
  const mods = await window.cp2077.listMods();
  if (!mods.length) {
    showDepsReport('No mods installed.');
    return;
  }
  const missingByMod = [];
  const infoByMod = [];
  for (const mod of mods) {
    const res = await window.cp2077.checkRedmodDeps(mod.id);
    if (res.error) {
      infoByMod.push(`${mod.displayName || mod.id}: ${res.error}`);
      continue;
    }
    if (res.missing && res.missing.length) {
      missingByMod.push(`${mod.displayName || mod.id}: ${res.missing.map((d) => JSON.stringify(d)).join(', ')}`);
    }
    if (res.warnings && res.warnings.length) {
      const normalized = res.warnings.map((w) => {
        if (w.toLowerCase().includes('no info.json')) {
          return 'Info: Not a REDmod package (skipped REDmod dependency check)';
        }
        if (w.toLowerCase().includes('no dependencies declared')) {
          return 'Info: REDmod package declares no dependencies';
        }
        return `Info: ${w}`;
      });
      infoByMod.push(`${mod.displayName || mod.id}: ${normalized.join('; ')}`);
    }
  }
  if (!missingByMod.length && !infoByMod.length) {
    showDepsReport('No missing dependencies found for installed mods.');
    return;
  }
  const parts = [];
  if (missingByMod.length) parts.push(`Missing dependencies:\n${missingByMod.join('\n')}`);
  if (infoByMod.length) parts.push(`Info:\n${infoByMod.join('\n')}`);
  showDepsReport(parts.join('\n\n'));
}));

async function refreshLoadOrder() {
  const names = await window.cp2077.getLoadOrder();
  const listEl = document.getElementById('load-order-list');
  listEl.innerHTML = '';
  let draggedIndex = -1;
  names.forEach((n, index) => {
    const li = document.createElement('li');
    li.textContent = n;
    li.draggable = true;
    li.dataset.index = String(index);
    li.addEventListener('dragstart', (ev) => {
      draggedIndex = Number(li.dataset.index);
      ev.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      li.classList.add('drag-over-row');
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over-row');
    });
    li.addEventListener('drop', (ev) => {
      ev.preventDefault();
      li.classList.remove('drag-over-row');
      const targetIndex = Number(li.dataset.index);
      if (Number.isNaN(draggedIndex) || draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return;
      const [moved] = names.splice(draggedIndex, 1);
      names.splice(targetIndex, 0, moved);
      listEl.dataset.order = JSON.stringify(names);
      names.forEach((name, i) => {
        if (listEl.children[i]) {
          listEl.children[i].textContent = name;
          listEl.children[i].dataset.index = String(i);
        }
      });
      draggedIndex = -1;
    });
    listEl.appendChild(li);
  });
  listEl.dataset.order = JSON.stringify(names);
}

document.getElementById('btn-refresh-load-order').addEventListener('click', withLoading('Refreshing archive load order...', refreshLoadOrder));
document.getElementById('btn-apply-load-order').addEventListener('click', withLoading('Applying archive load order...', async () => {
  const listEl = document.getElementById('load-order-list');
  const order = JSON.parse(listEl.dataset.order || '[]');
  const result = await window.cp2077.applyLoadOrder(order);
  if (result && !result.ok) alert(result.error || 'Failed to apply');
}));

async function refreshProfiles() {
  const state = await window.cp2077.listProfiles();
  const select = document.getElementById('profile-select');
  select.innerHTML = '';
  (state.profiles || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (state.currentProfileId && p.id === state.currentProfileId) opt.selected = true;
    select.appendChild(opt);
  });
}

document.getElementById('btn-profile-create').addEventListener('click', withLoading('Creating profile...', async () => {
  const name = prompt('Profile name?');
  if (!name) return;
  const res = await window.cp2077.createProfile(name);
  if (!res.ok) alert(res.error || 'Failed');
  await refreshProfiles();
}));

document.getElementById('btn-profile-save').addEventListener('click', withLoading('Saving current profile...', async () => {
  const id = document.getElementById('profile-select').value;
  if (!id) return;
  const res = await window.cp2077.saveProfile(id);
  if (!res.ok) alert(res.error || 'Failed');
  await refreshProfiles();
}));

document.getElementById('btn-profile-switch').addEventListener('click', withLoading('Switching profile and syncing mods...', async () => {
  const id = document.getElementById('profile-select').value;
  if (!id) return;
  const res = await window.cp2077.switchProfile(id);
  if (!res.ok) alert(res.error || 'Failed');
  await refreshModList();
  await refreshLoadOrder();
  await refreshProfiles();
}));

document.getElementById('btn-profile-delete').addEventListener('click', withLoading('Deleting profile...', async () => {
  const id = document.getElementById('profile-select').value;
  if (!id) return;
  if (!confirm('Delete this profile?')) return;
  const res = await window.cp2077.deleteProfile(id);
  if (!res.ok) alert(res.error || 'Failed');
  await refreshProfiles();
}));


async function refreshModList() {
  const mods = await window.cp2077.listMods();
  const activeListEl = document.getElementById('mod-list-active');
  const inactiveListEl = document.getElementById('mod-list-inactive');
  const hintEl = document.getElementById('mods-hint');
  activeListEl.innerHTML = '';
  inactiveListEl.innerHTML = '';
  if (mods.length === 0) {
    hintEl.style.display = 'block';
    return;
  }
  hintEl.style.display = 'none';

  function makeDropHandler(targetEnabled) {
    return withLoading(
      targetEnabled ? 'Enabling mod and moving files to game...' : 'Disabling mod and stashing files...',
      async (ev) => {
      ev.preventDefault();
      const modId = ev.dataTransfer?.getData('text/mod-id');
      if (!modId) return;
      const result = targetEnabled
        ? await window.cp2077.enableMod(modId)
        : await window.cp2077.disableMod(modId);
      if (!result.ok) {
        alert(result.error || 'Failed');
        return;
      }
      await refreshModList();
    });
  }

  function addDropZoneEvents(el, targetEnabled) {
    if (el.dataset.dropBound === '1') return;
    el.dataset.dropBound = '1';
    el.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', async (ev) => {
      el.classList.remove('drag-over');
      await makeDropHandler(targetEnabled)(ev);
    });
  }

  addDropZoneEvents(activeListEl, true);
  addDropZoneEvents(inactiveListEl, false);

  for (const mod of mods) {
    const li = document.createElement('li');
    li.className = 'mod-item';
    li.draggable = true;
    li.innerHTML = `
      <span class="mod-name">${escapeHtml(mod.displayName || mod.id)}</span>
      <span class="mod-type">${escapeHtml(mod.type || '')}</span>
      <span class="${mod.enabled ? 'mod-enabled' : 'mod-disabled'}">${mod.enabled ? 'active' : 'inactive'}</span>
    `;
    li.addEventListener('dragstart', (ev) => {
      ev.dataTransfer?.setData('text/mod-id', mod.id);
      ev.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showModContextMenu(mod, ev.clientX, ev.clientY);
    });
    if (mod.enabled) activeListEl.appendChild(li);
    else inactiveListEl.appendChild(li);
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

(function applyBrandingAssets() {
  // Use relative asset paths so branding works in dev and packaged builds.
  const wordmarkPrimary = '../../assets/Wordmark-logo.png';
  const wordmarkFallback = '../../assets/Wordmark-logo.bmp';
  const wordmarkEl = document.getElementById('header-wordmark');
  const gameWordmarkEl = document.getElementById('game-wordmark');
  if (wordmarkEl) {
    wordmarkEl.src = wordmarkPrimary;
    wordmarkEl.onerror = () => { wordmarkEl.src = wordmarkFallback; };
    wordmarkEl.style.display = '';
  }
  if (gameWordmarkEl) {
    gameWordmarkEl.src = wordmarkPrimary;
    gameWordmarkEl.onerror = () => { gameWordmarkEl.src = wordmarkFallback; };
    gameWordmarkEl.style.display = '';
  }
  const fallback = document.querySelector('.header-title-fallback');
  if (fallback) fallback.style.display = 'none';
  document.documentElement.style.setProperty(
    '--bg-noise-url',
    'url(../../assets/Background-noise.bmp)'
  );
  document.documentElement.style.setProperty(
    '--app-icon-url',
    'url(../../assets/icon.png)'
  );
})();

withLoading('Loading game paths, mods, profiles, and settings...', async () => {
  let path = await window.cp2077.getGamePath();
  if (!path) {
    const result = await window.cp2077.detectGame();
    if (!result.ok) {
      statusEl.textContent = "The app couldn't auto-detect the game. Please select its location.";
      statusEl.className = 'status error';
    }
  }
  await refreshGameStatus();
  await refreshDownloadFolder();
  await refreshModList();
  await refreshLoadOrder();
  await refreshProfiles();
  const downloadFolder = await window.cp2077.getDownloadFolder();
  if (downloadFolder) await checkDownloadFolderAndPrompt();
})();

document.addEventListener('click', () => hideModContextMenu());
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    hideModContextMenu();
    hideDepsReport();
    hideModFilesModal();
  }
});
depsReportCloseBtn.addEventListener('click', () => hideDepsReport());
depsReportModalEl.addEventListener('click', (ev) => {
  if (ev.target === depsReportModalEl) hideDepsReport();
});
modFilesCloseBtn.addEventListener('click', () => hideModFilesModal());
modFilesModalEl.addEventListener('click', (ev) => {
  if (ev.target === modFilesModalEl) hideModFilesModal();
});
