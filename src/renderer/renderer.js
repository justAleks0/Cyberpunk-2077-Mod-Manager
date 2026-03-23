// --- Navigation ---
let currentPage = 'mods';
let selectedMod = null;
let selectedFoundational = null;
const selectedModIds = new Set();

function switchPage(pageId) {
  currentPage = pageId;
  const sidebarBtns = document.querySelectorAll('.sidebar-btn[data-page]');
  const pages = document.querySelectorAll('.center-panel .page');
  const activeNav = pageId === 'load-order' ? 'options' : pageId;
  sidebarBtns.forEach((b) => b.classList.toggle('active', b.dataset.page === activeNav));
  pages.forEach((p) => {
    const isTarget = p.id === `page-${pageId}`;
    p.classList.toggle('active', isTarget);
  });
  // Left panel: mod details on mods, foundational details on downloads
  const placeholder = document.getElementById('left-panel-placeholder');
  const modContent = document.getElementById('left-panel-content');
  const downloadsContent = document.getElementById('left-panel-downloads');
  const showModPanel = pageId === 'mods';
  const showDownloadsPanel = pageId === 'downloads';
  const showAiPanel = pageId === 'ai';
  const showNexusPanel = pageId === 'nexus';
  if (showModPanel) {
    updateLeftPanelMod(selectedMod);
  } else if (showDownloadsPanel) {
    updateLeftPanelFoundational(selectedFoundational);
  } else if (showAiPanel) {
    modContent.style.display = 'none';
    modContent.setAttribute('aria-hidden', 'true');
    downloadsContent.style.display = 'none';
    downloadsContent.setAttribute('aria-hidden', 'true');
    placeholder.textContent = 'AI features';
    placeholder.style.display = 'block';
  } else if (showNexusPanel) {
    modContent.style.display = 'none';
    modContent.setAttribute('aria-hidden', 'true');
    downloadsContent.style.display = 'none';
    downloadsContent.setAttribute('aria-hidden', 'true');
    placeholder.textContent = 'Browse Nexus Mods in the main area. Downloads default to your mods folder.';
    placeholder.style.display = 'block';
  } else {
    modContent.style.display = 'none';
    modContent.setAttribute('aria-hidden', 'true');
    downloadsContent.style.display = 'none';
    downloadsContent.setAttribute('aria-hidden', 'true');
    placeholder.textContent = '';
    placeholder.style.display = 'block';
  }
  if (pageId === 'options') {
    renderOptionsSub();
  }
  if (pageId === 'downloads') {
    refreshFoundationalList();
  }
  if (pageId === 'nexus') {
    initNexusPage();
  }
}

async function refreshFoundationalList() {
  const { files } = await window.cp2077.listFoundationalMods();
  const listEl = document.getElementById('foundational-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  for (const item of files) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'foundational-item' + (selectedFoundational && selectedFoundational.name === item.name ? ' selected' : '');
    btn.textContent = item.name;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.foundational-item').forEach((r) => r.classList.remove('selected'));
      btn.classList.add('selected');
      updateLeftPanelFoundational(item);
    });
    listEl.appendChild(btn);
  }
}

function initNavigation() {
  document.querySelectorAll('.sidebar-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pageId = btn.dataset.page;
      switchPage(pageId);
    });
  });
}
initNavigation();

let nexusTabInitialized = false;
const NEXUS_PAGE_SIZE = 24;
let nexusPaginatedModIds = [];
let nexusPaginatedFullMods = []; // When set, use these instead of fetching (Latest Added, etc.)
let nexusPaginatedPage = 0;

function initNexusPage() {
  if (nexusTabInitialized) return;
  nexusTabInitialized = true;
  document.querySelectorAll('.nexus-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nexus-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      loadNexusTab(btn.dataset.tab);
    });
  });
  const grid = document.getElementById('nexus-mod-grid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.nexus-btn-view, .nexus-btn-install');
      const card = e.target.closest('.nexus-mod-card');
      const modId = btn?.dataset?.modId ?? card?.dataset?.modId;
      if (!modId) return;
      if (btn?.classList.contains('nexus-btn-install')) {
        installNexusMod(modId);
      } else {
        openNexusModDetail(modId);
      }
    });
  }
  document.getElementById('nexus-pagination-prev')?.addEventListener('click', () => {
    const total = nexusPaginatedFullMods.length || nexusPaginatedModIds.length;
    if (total && nexusPaginatedPage > 0) {
      nexusPaginatedPage--;
      loadNexusPaginatedPage(nexusPaginatedPage);
    }
  });
  document.getElementById('nexus-pagination-next')?.addEventListener('click', () => {
    const total = nexusPaginatedFullMods.length || nexusPaginatedModIds.length;
    const maxPage = Math.ceil(total / NEXUS_PAGE_SIZE) - 1;
    if (total && nexusPaginatedPage < maxPage) {
      nexusPaginatedPage++;
      loadNexusPaginatedPage(nexusPaginatedPage);
    }
  });
  loadNexusTab('latest_added');
}

function normalizeNexusMod(raw) {
  const m = raw?.mod_id != null ? raw : (raw?.mod || raw);
  if (!m) return null;
  const id = m.mod_id ?? m.id ?? m.modId;
  const name = m.name ?? m.mod_name ?? m.title ?? String(id);
  const summary = m.summary ?? m.description ?? '';
  const endorsements = m.endorsements ?? m.endorsement_count ?? 0;
  const author = m.author ?? m.uploaded_by ?? m.user?.name ?? m.member?.name ?? '';
  const thumb = m.picture_url ?? m.thumbnail ?? m.image ?? m.thumbnail_url ?? '';
  const created = m.created_time ?? m.created ?? '';
  const updated = m.updated_time ?? m.updated ?? m.last_update ?? '';
  return { id, name, summary, endorsements, author, thumb, created, updated, version: m.version };
}

function extractModsFromResponse(data) {
  if (Array.isArray(data)) return data;
  if (data?.mods) return data.mods;
  if (data?.files) return data.files;
  if (data?.data && Array.isArray(data.data)) return data.data;
  if (data?.updates && Array.isArray(data.updates)) return data.updates.map((u) => u.mod || u);
  return [];
}

/** Extract mod IDs from updated/period response (may return IDs only, not full mod objects). */
function extractModIdsFromUpdatedResponse(data) {
  if (!data) return [];
  if (Array.isArray(data.mod_ids)) return data.mod_ids;
  const arr = Array.isArray(data)
    ? data
    : (data?.updates ?? data?.last_update ?? data?.data ?? data?.mods ?? []);
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => x?.mod_id ?? x?.modId ?? x?.id ?? (typeof x === 'number' ? x : null))
    .filter((id) => id != null && id !== '');
}

async function loadNexusTab(tabId) {
  const grid = document.getElementById('nexus-mod-grid');
  const loadingEl = document.getElementById('nexus-loading');
  const errorEl = document.getElementById('nexus-error');
  const rateLimitEl = document.getElementById('nexus-rate-limit');
  if (!grid) return;

  const hasKey = await window.cp2077?.nexusHasKey?.();
  if (!hasKey) {
    grid.innerHTML = '';
    if (loadingEl) loadingEl.setAttribute('aria-hidden', 'true');
    errorEl.textContent = 'Set your Nexus API key in Options to browse mods.';
    errorEl.style.display = 'block';
    rateLimitEl.textContent = '';
    return;
  }

  errorEl.style.display = 'none';
  if (loadingEl) {
    loadingEl.setAttribute('aria-hidden', 'false');
  }
  grid.innerHTML = '';

  let res;
  if (tabId === 'latest_added') res = await window.cp2077.nexusGetLatestAdded();
  else if (tabId === 'latest_updated') res = await window.cp2077.nexusGetLatestUpdated();
  else if (tabId === 'trending') res = await window.cp2077.nexusGetTrending();
  else if (tabId === 'tracked') res = await window.cp2077.nexusGetTracked();
  else if (tabId.startsWith('updated_')) {
    const period = tabId.replace('updated_', '');
    res = await window.cp2077.nexusGetUpdated(period);
  } else {
    res = { ok: false, error: 'Unknown tab' };
  }

  if (res.rateLimit && rateLimitEl) {
    const daily = res.rateLimit.dailyRemaining;
    const hourly = res.rateLimit.hourlyRemaining;
    const parts = [];
    if (daily != null) parts.push(`~${daily} daily`);
    if (hourly != null) parts.push(`~${hourly} hourly`);
    rateLimitEl.textContent = parts.length ? `API: ${parts.join(', ')} remaining` : '';
  }

  if (!res.ok) {
    if (loadingEl) loadingEl.setAttribute('aria-hidden', 'true');
    errorEl.textContent = res.error || 'Failed to load.';
    errorEl.style.display = 'block';
    return;
  }

  let mods = extractModsFromResponse(res.data);
  const paginationEl = document.getElementById('nexus-pagination');
  if (paginationEl) paginationEl.style.display = 'none';

  if (tabId === 'latest_added' || tabId === 'latest_updated' || tabId === 'trending') {
    nexusPaginatedModIds = [];
    nexusPaginatedFullMods = mods.map(normalizeNexusMod).filter(Boolean);
    nexusPaginatedPage = 0;
    await loadNexusPaginatedPage(0);
    return;
  }
  if (tabId === 'tracked') {
    nexusPaginatedFullMods = [];
    const tracked = Array.isArray(res.data) ? res.data : (res.data?.mods ?? res.data?.tracked ?? []);
    const cp2077 = tracked.filter((t) => (t.domain_name ?? t.domain ?? t.game) === 'cyberpunk2077' || !t.domain_name);
    nexusPaginatedModIds = cp2077.map((t) => t.mod_id ?? t.modId ?? t.id);
    nexusPaginatedPage = 0;
    await loadNexusPaginatedPage(0);
    return;
  }
  if (tabId.startsWith('updated_')) {
    nexusPaginatedFullMods = [];
    const hasFullMods = mods.length > 0 && mods.some((m) => (m?.name ?? m?.mod_name ?? m?.title) != null);
    if (!hasFullMods) {
      nexusPaginatedModIds = extractModIdsFromUpdatedResponse(res.data);
      nexusPaginatedPage = 0;
      await loadNexusPaginatedPage(0);
      return;
    }
    const normalized = mods.map(normalizeNexusMod).filter(Boolean);
    nexusPaginatedFullMods = normalized;
    nexusPaginatedModIds = [];
    nexusPaginatedPage = 0;
    await loadNexusPaginatedPage(0);
    return;
  }
  if (loadingEl) loadingEl.setAttribute('aria-hidden', 'true');
  const normalized = mods.map(normalizeNexusMod).filter(Boolean);
  renderNexusModCards(grid, normalized);
}

function updateNexusPaginationUI(page, totalPages) {
  const info = document.getElementById('nexus-pagination-info');
  const prevBtn = document.getElementById('nexus-pagination-prev');
  const nextBtn = document.getElementById('nexus-pagination-next');
  if (info) info.textContent = `Page ${page + 1} of ${Math.max(1, totalPages)}`;
  if (prevBtn) prevBtn.disabled = page <= 0;
  if (nextBtn) nextBtn.disabled = page >= totalPages - 1 || totalPages <= 1;
}

async function loadNexusPaginatedPage(page) {
  const grid = document.getElementById('nexus-mod-grid');
  const loadingEl = document.getElementById('nexus-loading');
  const paginationEl = document.getElementById('nexus-pagination');
  const useFullMods = nexusPaginatedFullMods.length > 0;
  const totalCount = useFullMods ? nexusPaginatedFullMods.length : nexusPaginatedModIds.length;
  if (!grid || !totalCount) return;

  const start = page * NEXUS_PAGE_SIZE;

  if (useFullMods) {
    const pageMods = nexusPaginatedFullMods.slice(start, start + NEXUS_PAGE_SIZE);
    if (loadingEl) loadingEl.setAttribute('aria-hidden', 'true');
    grid.innerHTML = '';
    renderNexusModCards(grid, pageMods);
  } else {
    const ids = nexusPaginatedModIds.slice(start, start + NEXUS_PAGE_SIZE);
    if (loadingEl) loadingEl.setAttribute('aria-hidden', 'false');
    grid.innerHTML = '';

    const mods = [];
    for (const mid of ids) {
      const mres = await window.cp2077?.nexusGetMod?.(mid);
      if (mres?.ok && mres.data) mods.push(mres.data);
    }

    if (loadingEl) loadingEl.setAttribute('aria-hidden', 'true');
    const normalized = mods.map(normalizeNexusMod).filter(Boolean);
    renderNexusModCards(grid, normalized);
  }

  const totalPages = Math.ceil(totalCount / NEXUS_PAGE_SIZE);
  if (paginationEl) paginationEl.style.display = totalPages > 1 ? 'flex' : 'none';
  updateNexusPaginationUI(page, totalPages);
}

function renderNexusModCards(container, mods) {
  if (!container) return;
  container.innerHTML = '';
  for (const mod of mods) {
    const card = document.createElement('div');
    card.className = 'nexus-mod-card';
    card.dataset.modId = String(mod.id);
    card.style.cursor = 'pointer';
    const thumb = mod.thumb ? `<img src="${escapeHtml(mod.thumb)}" alt="" class="nexus-mod-thumb" loading="lazy" onerror="this.style.display='none'">` : '<div class="nexus-mod-thumb nexus-mod-thumb-placeholder"></div>';
    const summary = (mod.summary || '').slice(0, 120) + (mod.summary?.length > 120 ? '…' : '');
    card.innerHTML = `
      ${thumb}
      <div class="nexus-mod-info">
        <h4 class="nexus-mod-name">${escapeHtml(mod.name)}</h4>
        ${mod.author ? `<p class="nexus-mod-author">by ${escapeHtml(mod.author)}</p>` : ''}
        ${mod.endorsements ? `<p class="nexus-mod-endorsements">♥ ${mod.endorsements}</p>` : ''}
        ${summary ? `<p class="nexus-mod-summary">${escapeHtml(summary)}</p>` : ''}
        <div class="nexus-mod-actions">
          <button type="button" class="nexus-btn nexus-btn-view" data-mod-id="${mod.id}">View</button>
          <button type="button" class="nexus-btn nexus-btn-install" data-mod-id="${mod.id}">Install</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  }
}

function openNexusModDetail(modId) {
  showNexusModDetailModal(modId);
}

function installNexusMod(modId) {
  showNexusModDetailModal(modId);
}

let nexusModDetailMod = null;

function showNexusModDetailModal(modId) {
  const modal = document.getElementById('nexus-mod-detail-modal');
  const loadingEl = document.getElementById('nexus-mod-detail-loading');
  const contentEl = document.getElementById('nexus-mod-detail-content');
  if (!modal || !loadingEl || !contentEl) return;
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('visible');
  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';
  nexusModDetailMod = null;

  (async () => {
    const modRes = await window.cp2077?.nexusGetMod?.(modId);
    if (!modRes?.ok) {
      loadingEl.textContent = modRes?.error || 'Failed to load mod.';
      return;
    }
    const mod = modRes.data;
    nexusModDetailMod = mod;
    const modIdNum = mod.mod_id ?? mod.id ?? modId;

    const [filesRes, changelogRes] = await Promise.all([
      window.cp2077?.nexusGetFiles?.(modIdNum),
      window.cp2077?.nexusGetChangelogs?.(modIdNum),
    ]);

    const name = mod.name ?? mod.mod_name ?? `Mod ${modIdNum}`;
    document.getElementById('nexus-mod-detail-title').textContent = name;
    const nexusUrl = `https://www.nexusmods.com/cyberpunk2077/mods/${modIdNum}`;
    const linkEl = document.getElementById('nexus-mod-detail-link');
    linkEl.dataset.nexusUrl = nexusUrl;

    const thumb = mod.picture_url ?? mod.thumbnail ?? mod.image ?? '';
    const thumbEl = document.getElementById('nexus-mod-detail-thumb');
    if (thumb) {
      thumbEl.src = thumb;
      thumbEl.style.display = '';
    } else {
      thumbEl.style.display = 'none';
    }

    const summary = mod.summary ?? mod.description ?? '';
    document.getElementById('nexus-mod-detail-summary').innerHTML = escapeHtml(summary).replace(/\n/g, '<br>');

    let files = [];
    if (filesRes?.ok && filesRes.data) {
      const d = filesRes.data;
      files = Array.isArray(d) ? d : (d.files ?? extractModsFromResponse(d) ?? []);
    }
    const filesListEl = document.getElementById('nexus-mod-detail-files-list');
    filesListEl.innerHTML = '';
    for (const f of files) {
      const fid = f.file_id ?? f.id ?? f.fileId;
      const fname = f.name ?? f.file_name ?? f.filename ?? `File ${fid}`;
      const cat = f.category_name ?? f.category ?? '';
      const size = f.size ?? f.size_kb ?? '';
      const row = document.createElement('div');
      row.className = 'nexus-file-row';
      row.innerHTML = `
        <span class="nexus-file-name">${escapeHtml(fname)}</span>
        ${cat ? `<span class="nexus-file-cat">${escapeHtml(cat)}</span>` : ''}
        ${size ? `<span class="nexus-file-size">${escapeHtml(String(size))}</span>` : ''}
        <button type="button" class="nexus-btn nexus-file-install" data-mod-id="${modIdNum}" data-file-id="${fid}">Install</button>
      `;
      row.querySelector('.nexus-file-install')?.addEventListener('click', () => {
        installNexusModFile(modIdNum, fid);
      });
      filesListEl.appendChild(row);
    }
    if (files.length === 0) filesListEl.innerHTML = '<p class="nexus-no-files">No files available.</p>';

    const changelogs = changelogRes?.ok && changelogRes.data ? (Array.isArray(changelogRes.data) ? changelogRes.data : changelogRes.data.changelogs ?? []) : [];
    const changelogContent = document.getElementById('nexus-mod-detail-changelog-content');
    if (changelogs.length) {
      changelogContent.innerHTML = changelogs.map((c) => {
        const v = c.version ?? c.version_number ?? '';
        const text = c.changelog_html ?? c.changelog ?? c.content ?? '';
        return `<div class="nexus-changelog-entry"><strong>${escapeHtml(v)}</strong><div>${text}</div></div>`;
      }).join('');
    } else {
      changelogContent.textContent = 'No changelog available.';
    }

    const version = mod.version ?? mod.current_version?.version ?? '';
    const trackedRes = await window.cp2077?.nexusGetTracked?.();
    const trackedData = trackedRes?.ok && trackedRes.data ? trackedRes.data : null;
    const trackedList = Array.isArray(trackedData) ? trackedData : (trackedData?.mods ?? trackedData?.tracked ?? []);
    const isTracked = trackedList.some((t) => String(t.mod_id ?? t.id ?? t) === String(modIdNum));

    const trackEl = document.getElementById('nexus-mod-detail-track');
    const untrackEl = document.getElementById('nexus-mod-detail-untrack');
    if (trackEl) trackEl.style.display = isTracked ? 'none' : '';
    if (untrackEl) untrackEl.style.display = isTracked ? '' : 'none';

    modal.dataset.nexusModId = modIdNum;
    modal.dataset.nexusModVersion = version;

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  })();
}

function openNexusUrlInModal(url) {
  const filesWrap = document.getElementById('nexus-mod-detail-files-wrap');
  const webviewWrap = document.getElementById('nexus-mod-detail-webview-wrap');
  const webview = document.getElementById('nexus-mod-detail-webview');
  if (filesWrap) filesWrap.open = false;
  if (webviewWrap && webview) {
    webviewWrap.open = true;
    webview.src = url;
  }
}

function closeNexusModDetailModal() {
  const modal = document.getElementById('nexus-mod-detail-modal');
  if (modal) {
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('visible');
  }
  const webview = document.getElementById('nexus-mod-detail-webview');
  if (webview) webview.src = 'about:blank';
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

/**
 * Apply Nexus metadata (name, description, nexusModId, nexusUrl, images) to a mod after install.
 * @param {string} modId - installed mod id
 * @param {{ name: string, description?: string, nexusModId?: number, nexusUrl?: string, imageUrls?: string[] }} metadata
 */
async function applyNexusMetadataToMod(modId, metadata) {
  if (!modId || !metadata) return;
  const { name, description, nexusModId, nexusUrl, imageUrls = [] } = metadata;
  const plainDesc = htmlToPlainText(description || '');
  await window.cp2077?.setModCustomization?.(modId, {
    customName: name || undefined,
    description: plainDesc.trim() || undefined,
    nexusModId: nexusModId ?? undefined,
    nexusUrl: (nexusUrl || '').trim() || undefined,
  });
  for (let i = 0; i < Math.min(imageUrls.length, 3); i++) {
    const url = imageUrls[i];
    if (url && typeof url === 'string') {
      const res = await window.cp2077?.addModImageFromUrl?.(modId, url);
      if (res?.ok === false) break;
    }
  }
}

async function installNexusModFile(modId, fileId) {
  showLoading({ task: 'Downloading from Nexus…' });
  if (loadingProgressWrapEl) loadingProgressWrapEl.removeAttribute('aria-hidden');
  const progressHandler = (e) => {
    const { received, total } = e.detail || {};
    const pct = total > 0 ? Math.round((received / total) * 100) : 0;
    const label = total > 0
      ? `Downloading… ${formatBytes(received)} / ${formatBytes(total)}`
      : `Downloading… ${formatBytes(received)}`;
    updateLoadingProgress({ percent: pct, currentTask: label });
  };
  window.addEventListener('nexus-download-progress', progressHandler);
  try {
    const result = await window.cp2077?.nexusInstallFromNexus?.(modId, fileId);
    window.removeEventListener('nexus-download-progress', progressHandler);
    hideLoading();
    if (result?.ok) {
      if (result.nexusMetadata && result.modId) {
        try {
          await applyNexusMetadataToMod(result.modId, result.nexusMetadata);
        } catch (_) {}
      }
      showToast('Mod installed successfully.', 'success');
      closeNexusModDetailModal();
      refreshModList();
      if (typeof checkConflictsForNewMod === 'function') checkConflictsForNewMod();
    } else {
      showToast(result?.error || 'Install failed.', 'error');
      if (result?.premiumRequired) {
        openNexusUrlInModal(`https://www.nexusmods.com/cyberpunk2077/mods/${modId}?tab=files&file_id=${fileId}`);
      }
    }
  } catch (e) {
    window.removeEventListener('nexus-download-progress', progressHandler);
    hideLoading();
    showToast(e?.message || 'Install failed.', 'error');
  }
}

document.getElementById('nexus-mod-detail-close')?.addEventListener('click', closeNexusModDetailModal);
const nexusModDetailModalEl = document.getElementById('nexus-mod-detail-modal');
nexusModDetailModalEl?.addEventListener('click', async (e) => {
  if (e.target.id === 'nexus-mod-detail-modal') {
    closeNexusModDetailModal();
    return;
  }
  if (e.target.id === 'nexus-mod-detail-link') {
    const url = e.target.dataset?.nexusUrl;
    if (url) openNexusUrlInModal(url);
    return;
  }
  const modId = nexusModDetailModalEl?.dataset?.nexusModId;
  const version = nexusModDetailModalEl?.dataset?.nexusModVersion || '';
  if (!modId) return;
  const tid = e.target.id;
  if (tid === 'nexus-mod-detail-endorse') {
    const r = await window.cp2077?.nexusEndorse?.(modId, version);
    showToast(r?.ok ? 'Endorsed.' : (r?.error || 'Failed.'), r?.ok ? 'success' : 'error');
  } else if (tid === 'nexus-mod-detail-abstain') {
    const r = await window.cp2077?.nexusAbstain?.(modId, version);
    showToast(r?.ok ? 'Abstained.' : (r?.error || 'Failed.'), r?.ok ? 'success' : 'error');
  } else if (tid === 'nexus-mod-detail-track') {
    const r = await window.cp2077?.nexusTrack?.(modId);
    if (r?.ok) {
      e.target.style.display = 'none';
      document.getElementById('nexus-mod-detail-untrack').style.display = '';
      showToast('Tracking.', 'success');
    } else showToast(r?.error || 'Failed.', 'error');
  } else if (tid === 'nexus-mod-detail-untrack') {
    const r = await window.cp2077?.nexusUntrack?.(modId);
    if (r?.ok) {
      e.target.style.display = 'none';
      document.getElementById('nexus-mod-detail-track').style.display = '';
      showToast('Untracked.', 'success');
    } else showToast(r?.error || 'Failed.', 'error');
  }
});

let loadingCount = 0;
const loadingEl = document.getElementById('loading-indicator');
const loadingTextEl = loadingEl ? loadingEl.querySelector('.loading-text') : null;
const loadingStepEl = document.getElementById('loading-step');
const loadingProgressWrapEl = document.getElementById('loading-progress-wrap');
const loadingProgressFillEl = document.getElementById('loading-progress-fill');
const MIN_LOADING_VISIBLE_MS = 1500;
let loadingShownAt = 0;
let hideTimer = null;
const contextMenuEl = document.getElementById('mod-context-menu');
const contextEditModBtn = document.getElementById('ctx-edit-mod');
const contextShowFilesAppBtn = document.getElementById('ctx-show-files-app');
const contextShowFilesExplorerBtn = document.getElementById('ctx-show-files-explorer');
const contextUninstallBtn = document.getElementById('ctx-uninstall-mod');
let contextMenuMod = null; // deprecated: use contextMenuMods
let contextMenuMods = []; // mods to act on (single or multi from selection)
let lastRenderedMods = []; // mod list for context-menu multi lookup
const modEditModalEl = document.getElementById('mod-edit-modal');
const modEditTitleEl = document.getElementById('mod-edit-title');
const modEditNameEl = document.getElementById('mod-edit-name');
const modEditDescriptionEl = document.getElementById('mod-edit-description');
const modEditCategoryEl = document.getElementById('mod-edit-category');
const modEditTagsContainerEl = document.getElementById('mod-edit-tags-container');
const modEditTagInputEl = document.getElementById('mod-edit-tag-input');
const modEditImagesContainerEl = document.getElementById('mod-edit-images-container');
const modEditImagesDropzoneEl = document.getElementById('mod-edit-images-dropzone');
const modEditWebviewEl = document.getElementById('mod-edit-webview');
const modEditNexusSearchEl = document.getElementById('mod-edit-nexus-search');
let modEditCurrentMod = null;
let modEditNexusLookupData = null;
const depsReportModalEl = document.getElementById('deps-report-modal');
const depsReportContentEl = document.getElementById('deps-report-content');
const depsReportCloseBtn = document.getElementById('deps-report-close');
const modFilesModalEl = document.getElementById('mod-files-modal');
const modFilesTitleEl = document.getElementById('mod-files-title');
const modFilesContentEl = document.getElementById('mod-files-content');
const modFilesCloseBtn = document.getElementById('mod-files-close');
const conflictModalEl = document.getElementById('conflict-modal');
const conflictDescEl = document.getElementById('conflict-desc');
const conflictFilesEl = document.getElementById('conflict-files');
const conflictOptionsSafeEl = document.getElementById('conflict-options-safe');
const conflictOptionsRiskyEl = document.getElementById('conflict-options-risky');
let conflictQueue = [];

function showLoading(messageOrOpts) {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  loadingCount += 1;
  if (loadingEl) {
    const opts = typeof messageOrOpts === 'string' ? { task: messageOrOpts } : (messageOrOpts || {});
    const task = opts.task || 'Working…';
    if (loadingTextEl) loadingTextEl.textContent = task;
    if (loadingStepEl) {
      loadingStepEl.textContent = '';
      loadingStepEl.setAttribute('aria-hidden', 'true');
    }
    if (loadingProgressWrapEl) {
      loadingProgressWrapEl.setAttribute('aria-hidden', 'true');
    }
    if (loadingProgressFillEl) loadingProgressFillEl.style.width = '0%';
    updateLoadingProgress(opts);
    loadingEl.classList.add('visible');
    loadingEl.setAttribute('aria-hidden', 'false');
    if (loadingCount === 1) loadingShownAt = Date.now();
  }
}

/** Update progress for the current loading indicator. Call from within withLoading tasks. */
function updateLoadingProgress(opts) {
  if (!opts || !loadingEl?.classList.contains('visible')) return;
  if (loadingTextEl) {
    loadingTextEl.textContent = opts.currentTask ?? opts.task ?? 'Working…';
  }
  if (opts.step != null && opts.total != null && opts.total > 0) {
    if (loadingStepEl) {
      loadingStepEl.textContent = `Step ${opts.step} of ${opts.total}`;
      loadingStepEl.removeAttribute('aria-hidden');
    }
    if (loadingProgressWrapEl && loadingProgressFillEl) {
      const pct = Math.round((opts.step / opts.total) * 100);
      loadingProgressFillEl.style.width = `${pct}%`;
      loadingProgressWrapEl.removeAttribute('aria-hidden');
    }
  } else if (opts.percent != null && loadingProgressWrapEl && loadingProgressFillEl) {
    const pct = Math.min(100, Math.max(0, opts.percent));
    loadingProgressFillEl.style.width = `${pct}%`;
    loadingProgressWrapEl.removeAttribute('aria-hidden');
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
  const label = typeof labelOrFn === 'string' ? labelOrFn : 'Working…';
  const fn = typeof labelOrFn === 'function' ? labelOrFn : maybeFn;
  return async function () {
    showLoading({ task: label });
    const updateProgress = (opts) => updateLoadingProgress({ ...opts, task: opts.task ?? label });
    try {
      return await fn.call(this, { updateProgress }, ...arguments);
    } finally {
      hideLoading();
    }
  };
}

/** Show an in-app toast notification (replaces alert). type: 'error' | 'success' | 'info' */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const icons = { error: '⚠', success: '✓', info: 'ℹ' };
  const div = document.createElement('div');
  div.id = id;
  div.className = `toast toast-${type}`;
  div.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${icons[type] || icons.info}</span>
    <span class="toast-message">${escapeHtml(String(message))}</span>
    <button type="button" class="toast-dismiss" aria-label="Dismiss">&times;</button>
  `;
  container.appendChild(div);
  const dismiss = () => {
    div.style.animation = 'toast-in 0.2s ease reverse';
    setTimeout(() => div.remove(), 180);
  };
  div.querySelector('.toast-dismiss').addEventListener('click', dismiss);
  const duration = type === 'error' ? 8000 : 5000;
  const t = setTimeout(dismiss, duration);
  div._toastTimer = t;
}

/** Show an in-app confirm dialog (replaces confirm). Returns Promise<boolean>. */
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      resolve(false);
      return;
    }
    const { confirmLabel = 'OK', cancelLabel = 'Cancel', dangerous = false } = options;
    msgEl.textContent = message;
    okBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;
    okBtn.classList.toggle('confirm-danger', dangerous);
    const cleanup = () => {
      modal.classList.remove('visible');
      modal.setAttribute('aria-hidden', 'true');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
    };
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onBackdrop = (ev) => {
      if (ev.target === modal) onCancel();
    };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
  });
}

window.addEventListener('app-show-toast', (ev) => {
  if (ev.detail?.message) showToast(ev.detail.message, ev.detail.type || 'error');
});

window.addEventListener('nexus-nxm-install-result', async (ev) => {
  const result = ev.detail;
  if (result?.ok) {
    if (result.nexusMetadata && result.modId) {
      try {
        await applyNexusMetadataToMod(result.modId, result.nexusMetadata);
      } catch (_) {}
    }
    showToast('Mod installed from Nexus link.', 'success');
    refreshModList();
    if (typeof checkConflictsForNewMod === 'function') checkConflictsForNewMod();
  } else {
    showToast(result?.error || 'Install failed.', 'error');
  }
});

function hideModContextMenu() {
  contextMenuMod = null;
  contextMenuMods = [];
  if (contextMenuEl) {
    contextMenuEl.classList.remove('visible');
    contextMenuEl.setAttribute('aria-hidden', 'true');
  }
}

function showModContextMenu(mod, x, y) {
  if (!contextMenuEl) return;
  // If right-clicked mod is in selection, act on all selected; else just this mod
  const isMulti = selectedModIds.has(mod.id) && selectedModIds.size > 0;
  contextMenuMods = isMulti
    ? [...selectedModIds].map((id) => lastRenderedMods.find((m) => m.id === id)).filter(Boolean)
    : [mod];
  contextMenuMod = contextMenuMods[0]; // for backwards compat with single-mod handlers
  const n = contextMenuMods.length;
  const plural = n > 1 ? 's' : '';
  // Update labels for multi-select
  const ctxUninstall = document.getElementById('ctx-uninstall-mod');
  if (ctxUninstall) ctxUninstall.textContent = n > 1 ? `Uninstall ${n} mods` : 'Uninstall mod';
  const ctxAddGroup = document.getElementById('ctx-add-to-group');
  if (ctxAddGroup) ctxAddGroup.textContent = n > 1 ? `Add ${n} mods to group…` : 'Add to group…';
  const ctxAiCategorize = document.getElementById('ctx-ai-categorize');
  if (ctxAiCategorize) ctxAiCategorize.textContent = n > 1 ? `AI: Categorize ${n} mods` : 'AI: Categorize this mod';
  const uncategorized = contextMenuMods.some((m) => !m.customCategory || m.customCategory === 'Uncategorized');
  if (ctxAiCategorize) ctxAiCategorize.style.display = uncategorized ? '' : 'none';
  const hasChildAddon = contextMenuMods.some((m) => m.parentModId);
  const ctxChildRow = document.getElementById('ctx-child-addon-row');
  if (ctxChildRow) ctxChildRow.style.display = hasChildAddon && n === 1 ? '' : 'none';
  // Single-mod-only actions: hide when multi
  const singleOnly = ['ctx-edit-mod', 'ctx-show-files-app', 'ctx-show-files-explorer', 'ctx-ai-generate'];
  singleOnly.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = n > 1 ? 'none' : '';
  });
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = 220;
  const height = 260;
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

function hideConflictModal() {
  conflictQueue = [];
  if (conflictModalEl) {
    conflictModalEl.classList.remove('visible');
    conflictModalEl.setAttribute('aria-hidden', 'true');
  }
}

function showConflictModal(conflict) {
  if (!conflictModalEl || !conflict) return;
  const nameA = conflict.modA.displayName || conflict.modA.id;
  const nameB = conflict.modB.displayName || conflict.modB.id;
  conflictDescEl.textContent = `"${nameA}" and "${nameB}" both install the same files:`;
  conflictFilesEl.innerHTML = conflict.conflictingPaths
    .slice(0, 10)
    .map((p) => `<div class="conflict-file-path">${escapeHtml(p)}</div>`)
    .join('') + (conflict.conflictingPaths.length > 10 ? `<div class="conflict-file-more">…and ${conflict.conflictingPaths.length - 10} more</div>` : '');

  conflictOptionsSafeEl.innerHTML = `
    <button type="button" class="conflict-btn conflict-btn-keepA" data-choice="keepA">Keep ${escapeHtml(nameA)}</button>
    <button type="button" class="conflict-btn conflict-btn-keepB" data-choice="keepB">Keep ${escapeHtml(nameB)}</button>
  `;
  conflictOptionsRiskyEl.innerHTML = `
    <button type="button" class="conflict-btn conflict-btn-risky" data-choice="both">Both (last write wins)</button>
    <button type="button" class="conflict-btn conflict-btn-risky" data-choice="merge">Try to merge</button>
    <button type="button" class="conflict-btn conflict-btn-risky" data-choice="keepA_disableB_conflicts">${escapeHtml(nameA)} only (disable conflicting files in ${escapeHtml(nameB)})</button>
    <button type="button" class="conflict-btn conflict-btn-risky" data-choice="keepB_disableA_conflicts">${escapeHtml(nameB)} only (disable conflicting files in ${escapeHtml(nameA)})</button>
  `;

  conflictOptionsSafeEl.querySelectorAll('.conflict-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleConflictChoice(btn.dataset.choice));
  });
  conflictOptionsRiskyEl.querySelectorAll('.conflict-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleConflictChoice(btn.dataset.choice));
  });

  conflictModalEl.classList.add('visible');
  conflictModalEl.setAttribute('aria-hidden', 'false');
}

async function checkConflictsForNewMod() {
  const conflicts = await window.cp2077.checkConflicts();
  if (!conflicts.length) return;
  const mods = await window.cp2077.listMods();
  const newest = mods.sort((a, b) => (b.installedAt || 0) - (a.installedAt || 0))[0];
  if (!newest) return;
  const relevant = conflicts.filter((c) => c.modA.id === newest.id || c.modB.id === newest.id);
  if (relevant.length) {
    conflictQueue = relevant;
    showConflictModal(conflictQueue[0]);
  }
}

const groupsModalEl = document.getElementById('groups-modal');
const groupsSuggestResultsEl = document.getElementById('groups-suggest-results');
const groupsListEl = document.getElementById('groups-list');
const groupsMassEditSectionEl = document.getElementById('groups-mass-edit-section');
const groupsMassEditFormEl = document.getElementById('groups-mass-edit-form');
let groupsModalState = { addModId: null, addModIds: null, createWithModIds: null, editingGroupId: null };

function hideGroupsModal() {
  groupsModalState = { addModId: null, addModIds: null, createWithModIds: null, editingGroupId: null };
  if (groupsModalEl) {
    groupsModalEl.classList.remove('visible');
    groupsModalEl.setAttribute('aria-hidden', 'true');
  }
}

async function showGroupsModal(opts = {}) {
  groupsModalState = { ...groupsModalState, ...opts };
  if (!groupsModalEl) return;
  groupsModalEl.classList.add('visible');
  groupsModalEl.setAttribute('aria-hidden', 'false');
  if (opts.preloadedSuggestions?.data?.length) {
    const modById = opts.preloadedSuggestions.modById;
    const modMap = modById instanceof Map ? modById : new Map(modById ? Object.entries(modById) : []);
    renderGroupsSuggestionsInModal(opts.preloadedSuggestions.data, modMap);
  } else {
    groupsSuggestResultsEl.innerHTML = '';
  }
  await renderGroupsList();
  if (groupsModalState.createWithModIds?.length) {
    const name = prompt('Group name?', '');
    if (name) {
      await window.cp2077.groupsCreate(name.trim(), 'related', groupsModalState.createWithModIds);
      groupsModalState.createWithModIds = null;
      await refreshModList();
      await renderGroupsList();
    }
  }
  const addIds = groupsModalState.addModIds || (groupsModalState.addModId ? [groupsModalState.addModId] : null);
  if (addIds?.length) {
    groupsModalState.addModId = null;
    groupsModalState.addModIds = null;
    const groups = await window.cp2077.groupsList();
    if (groups.length) {
      const pick = prompt(`Add ${addIds.length} mod(s) to which group? (1-${groups.length}) or "new" for new group:`, '1');
      if (pick) {
        if (pick.toLowerCase() === 'new') {
          const name = prompt('New group name?', '');
          if (name) {
            const g = await window.cp2077.groupsCreate(name.trim(), 'related', addIds);
            await refreshModList();
            await renderGroupsList();
          }
        } else {
          const idx = parseInt(pick, 10);
          if (idx >= 1 && idx <= groups.length) {
            for (const modId of addIds) {
              await window.cp2077.groupsAddMod(groups[idx - 1].id, modId);
            }
            await refreshModList();
            await renderGroupsList();
          }
        }
      }
    } else {
      const name = prompt('No groups yet. Create one with selected mods? Enter name:', '');
      if (name) {
        await window.cp2077.groupsCreate(name.trim(), 'related', addIds);
        await refreshModList();
        await renderGroupsList();
      }
    }
  }
}

async function renderGroupsList() {
  if (!groupsListEl) return;
  const groups = await window.cp2077.groupsList();
  const mods = await window.cp2077.listMods();
  const modById = new Map(mods.map((m) => [m.id, m]));
  groupsListEl.innerHTML = groups
    .map(
      (g) => `
    <div class="groups-list-item" data-group-id="${escapeHtml(g.id)}">
      <div class="groups-list-item-header">
        <strong>${escapeHtml(g.name)}</strong> (${g.type || 'related'})
        <div class="groups-list-item-actions">
          <button type="button" class="groups-btn-edit" data-group-id="${escapeHtml(g.id)}">Edit</button>
          <button type="button" class="groups-btn-mass-edit" data-group-id="${escapeHtml(g.id)}">Mass edit</button>
          <button type="button" class="groups-btn-delete" data-group-id="${escapeHtml(g.id)}">Delete</button>
        </div>
      </div>
      <ul class="groups-list-item-mods">
        ${(g.modIds || [])
          .map(
            (mid) =>
              `<li>${escapeHtml((modById.get(mid)?.customName || modById.get(mid)?.displayName) || mid)} <button type="button" class="groups-btn-remove-mod" data-group-id="${escapeHtml(g.id)}" data-mod-id="${escapeHtml(mid)}">×</button></li>`
          )
          .join('')}
      </ul>
    </div>
  `
    )
    .join('');

  groupsListEl.querySelectorAll('.groups-btn-edit').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const groups = await window.cp2077.groupsList();
      const g = groups.find((x) => x.id === btn.dataset.groupId);
      if (!g) return;
      const name = prompt('Group name?', g.name);
      if (name != null && name.trim()) {
        await window.cp2077.groupsUpdate(g.id, { name: name.trim() });
        await renderGroupsList();
      }
    });
  });
  groupsListEl.querySelectorAll('.groups-btn-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await showConfirm('Delete this group? (Mods stay installed)'))) return;
      await window.cp2077.groupsDelete(btn.dataset.groupId);
      await refreshModList();
      await renderGroupsList();
      renderGroupsMassEdit(null);
    });
  });
  groupsListEl.querySelectorAll('.groups-btn-mass-edit').forEach((btn) => {
    btn.addEventListener('click', () => renderGroupsMassEdit(btn.dataset.groupId));
  });
  groupsListEl.querySelectorAll('.groups-btn-remove-mod').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.cp2077.groupsRemoveMod(btn.dataset.groupId, btn.dataset.modId);
      await refreshModList();
      await renderGroupsList();
    });
  });
}

async function renderGroupsMassEdit(groupId) {
  groupsModalState.editingGroupId = groupId;
  if (!groupsMassEditSectionEl || !groupsMassEditFormEl) return;
  if (!groupId) {
    groupsMassEditSectionEl.style.display = 'none';
    return;
  }
  groupsMassEditSectionEl.style.display = 'block';
  const { predefined, user } = await window.cp2077.getCategories();
  const allCats = [...predefined, ...user].filter((c) => c !== 'Uncategorized');
  const catOptions = allCats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  groupsMassEditFormEl.innerHTML = `
    <p class="groups-mass-edit-hint">Apply category/tags to all mods in this group:</p>
    <div class="groups-mass-edit-row">
      <label>Category</label>
      <select id="groups-mass-category">
        <option value="">— Keep existing —</option>
        ${catOptions}
        <option value="Uncategorized">Uncategorized</option>
      </select>
    </div>
    <div class="groups-mass-edit-row">
      <label>Add tags (comma-separated)</label>
      <input type="text" id="groups-mass-tags" placeholder="tag1, tag2" />
    </div>
    <button type="button" id="groups-mass-apply">Apply to group</button>
  `;
  document.getElementById('groups-mass-apply')?.addEventListener('click', async () => {
    const category = document.getElementById('groups-mass-category')?.value || undefined;
    const tagsRaw = document.getElementById('groups-mass-tags')?.value?.trim();
    const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
    if (!category && !tags?.length) {
      showToast('Set at least category or tags.', 'error');
      return;
    }
    await window.cp2077.groupsApplyToGroup(groupId, { category, tags });
    await refreshModList();
    showToast('Applied to group.', 'success');
  });
}

function renderGroupsSuggestionsInModal(suggestions, modById) {
  if (!groupsSuggestResultsEl) return;
  if (!suggestions?.length) {
    groupsSuggestResultsEl.innerHTML = '<p class="groups-suggest-empty">No groups suggested.</p>';
    return;
  }
  const modMap = modById instanceof Map ? modById : new Map(Object.entries(modById || {}));
  groupsSuggestResultsEl.innerHTML =
    `<div class="groups-suggest-actions"><button type="button" id="groups-btn-create-all" class="groups-btn-create-all">Create all ${suggestions.length} groups</button></div>` +
    suggestions
      .map(
        (s, i) => `
    <div class="groups-suggest-item">
      <span class="groups-suggest-reason">${escapeHtml(s.reason || s.suggestedName || '')} (${s.confidence || 'medium'})</span>
      <span class="groups-suggest-mods">${(s.modIds || []).map((id) => escapeHtml((modMap.get(id)?.displayName || modMap.get(id)?.customName) || id)).join(', ')}</span>
      <button type="button" class="groups-btn-create-from-suggest" data-index="${i}">Create group</button>
    </div>
  `
      )
      .join('');

  document.getElementById('groups-btn-create-all')?.addEventListener('click', async () => {
    let created = 0;
    for (const s of suggestions) {
      const name = (s.suggestedName || s.reason || 'Unnamed group').trim().slice(0, 60);
      if (name && (s.modIds || []).length > 0) {
        await window.cp2077.groupsCreate(name, 'related', s.modIds || []);
        created += 1;
      }
    }
    await refreshModList();
    await renderGroupsList();
    showToast(`Created ${created} group(s).`, 'success');
  });

  suggestions.forEach((s, i) => {
    document.querySelector(`.groups-btn-create-from-suggest[data-index="${i}"]`)?.addEventListener('click', async () => {
      const defaultName = (s.suggestedName || s.reason || '').slice(0, 40);
      const name = prompt('Group name?', defaultName);
      if (name) {
        await window.cp2077.groupsCreate(name.trim(), 'related', s.modIds || []);
        await refreshModList();
        await renderGroupsList();
      }
    });
  });
}

document.getElementById('btn-suggest-groups')?.addEventListener('click', withLoading('Detecting related mods...', async () => {
  const suggestions = await window.cp2077.groupsSuggest();
  if (!suggestions.length) {
    renderGroupsSuggestionsInModal([], null);
    return;
  }
  const mods = await window.cp2077.listMods();
  const modById = new Map(mods.map((m) => [m.id, m]));
  renderGroupsSuggestionsInModal(suggestions, modById);
}));

document.getElementById('btn-create-group')?.addEventListener('click', async () => {
  const ids = [...selectedModIds];
  const name = prompt('Group name?', '');
  if (!name) return;
  await window.cp2077.groupsCreate(name.trim(), 'related', ids.length ? ids : []);
  selectedModIds.clear();
  await refreshModList();
  await renderGroupsList();
});

document.getElementById('groups-modal-close')?.addEventListener('click', () => hideGroupsModal());
groupsModalEl?.addEventListener('click', (ev) => {
  if (ev.target === groupsModalEl) hideGroupsModal();
});

// --- AI feature visibility ---
async function refreshAiButtonsVisibility() {
  const hasKey = await window.cp2077?.aiHasKey?.() ?? false;
  const showAiOptions = (await window.cp2077?.getSetting?.('showAiOptions')) ?? true;
  const visible = hasKey && showAiOptions;
  document.querySelectorAll('.btn-ai-feature').forEach((btn) => {
    btn.style.display = visible ? '' : 'none';
  });
  if (!visible && currentPage === 'ai') {
    switchPage('mods');
  }
}

// --- AI Batch Categorize ---
let aiBatchSuggestionsState = { suggestions: [], newCategories: [], modById: new Map() };

function hideAiBatchCategorizeModal() {
  const el = document.getElementById('ai-batch-categorize-modal');
  if (el) {
    el.classList.remove('visible');
    el.setAttribute('aria-hidden', 'true');
  }
}

async function showAiBatchCategorizeModal(suggestions, newCategories, modById) {
  aiBatchSuggestionsState = { suggestions: [], newCategories: newCategories || [], modById: modById || new Map() };
  const { predefined = [], user = [] } = await window.cp2077?.getCategories?.() || {};
  const allCategories = [...new Set([...predefined, ...user, ...(newCategories || [])])].filter(Boolean).sort((a, b) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b);
  });
  if (!allCategories.includes('Uncategorized')) allCategories.unshift('Uncategorized');

  const listEl = document.getElementById('ai-batch-suggestions-list');
  if (!listEl) return;
  listEl.innerHTML = suggestions
    .map((s) => {
      const suggestedCat = s.category || 'Uncategorized';
      const options = allCategories.map((c) => `<option value="${escapeHtml(c)}"${c === suggestedCat ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
      const tags = (s.tags || []).length ? ` <span class="ai-batch-tags">[${(s.tags || []).join(', ')}]</span>` : '';
      return `
    <div class="ai-batch-row" data-mod-id="${escapeHtml(s.id)}" data-accepted="false">
      <span class="ai-batch-mod-name">${escapeHtml((modById?.get(s.id)?.displayName || modById?.get(s.id)?.customName) || s.id)}</span>
      <span class="ai-batch-suggestion-wrap">→ <select class="ai-batch-category-select" data-mod-id="${escapeHtml(s.id)}" aria-label="Select category">${options}</select>${tags}</span>
      <button type="button" class="ai-batch-accept">Accept</button>
      <button type="button" class="ai-batch-reject">Reject</button>
    </div>`;
    })
    .join('');
  aiBatchSuggestionsState.suggestions = suggestions;
  listEl.querySelectorAll('.ai-batch-row').forEach((row) => {
    row.querySelector('.ai-batch-accept')?.addEventListener('click', () => {
      row.dataset.accepted = 'true';
      row.classList.add('accepted');
    });
    row.querySelector('.ai-batch-reject')?.addEventListener('click', () => {
      row.dataset.accepted = 'false';
      row.classList.remove('accepted');
    });
  });
  const modal = document.getElementById('ai-batch-categorize-modal');
  if (modal) {
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
  }
}

document.getElementById('btn-ai-batch-categorize')?.addEventListener('click', withLoading('AI categorizing...', async ({ updateProgress }) => {
  if (!(await window.cp2077?.aiHasKey?.())) {
    showToast('Set your OpenAI API key in Options to use AI features.', 'error');
    return;
  }
  const mods = await window.cp2077.listMods();
  const uncategorized = mods.filter((m) => !m.customCategory || m.customCategory === 'Uncategorized');
  if (!uncategorized.length) {
    showToast('No uncategorized mods found.', 'info');
    return;
  }
  updateProgress({ step: 1, total: 2, currentTask: 'Analyzing mods with AI…' });
  const result = await window.cp2077.aiBatchCategorize(uncategorized);
  updateProgress({ step: 2, total: 2, currentTask: 'Processing results…' });
  if (!result.ok) {
    showToast(result.error || 'AI batch categorize failed.', 'error');
    return;
  }
  const modById = new Map(mods.map((m) => [m.id, m]));
  await showAiBatchCategorizeModal(result.suggestions, result.newCategories, modById);
}));

document.getElementById('ai-batch-modal-close')?.addEventListener('click', () => hideAiBatchCategorizeModal());
document.getElementById('ai-batch-categorize-modal')?.addEventListener('click', (ev) => {
  if (ev.target?.id === 'ai-batch-categorize-modal') hideAiBatchCategorizeModal();
});

document.getElementById('ai-batch-apply-accepted')?.addEventListener('click', withLoading('Applying AI suggestions...', async ({ updateProgress }) => {
  const listEl = document.getElementById('ai-batch-suggestions-list');
  const rows = listEl ? [...listEl.querySelectorAll('.ai-batch-row[data-accepted="true"]')] : [];
  const suggestions = aiBatchSuggestionsState.suggestions;
  const { predefined, user } = await window.cp2077.getCategories();
  const allExisting = new Set([...predefined, ...user]);
  const total = rows.length;
  let step = 0;
  for (const row of rows) {
    const modId = row.dataset.modId;
    const s = suggestions.find((x) => x.id === modId);
    if (!s) continue;
    const selectEl = row.querySelector('.ai-batch-category-select');
    const category = selectEl ? selectEl.value : (s.category || 'Uncategorized');
    step += 1;
    updateProgress({ step, total, currentTask: `Applying: ${category}` });
    if (!allExisting.has(category)) {
      await window.cp2077.addCategory(category);
      allExisting.add(category);
    }
    await window.cp2077.setModCustomization(modId, {
      category,
      tags: s.tags?.length ? s.tags : undefined,
    });
  }
  hideAiBatchCategorizeModal();
  await refreshModList();
  if (step) showToast(`Applied ${step} suggestion(s).`, 'success');
}));

// --- AI Suggest Groups ---
document.getElementById('btn-ai-suggest-groups')?.addEventListener('click', withLoading('AI suggesting groups...', async () => {
  if (!(await window.cp2077?.aiHasKey?.())) {
    showToast('Set your OpenAI API key in Options to use AI features.', 'error');
    return;
  }
  const mods = await window.cp2077.listMods();
  const result = await window.cp2077.aiSuggestGroups(mods);
  if (!result.ok) {
    showToast(result.error || 'AI suggest groups failed.', 'error');
    return;
  }
  const data = result.data || [];
  const modById = new Map(mods.map((m) => [m.id, m]));
  renderGroupsSuggestionsInModal(data, modById);
}));

// --- AI Chat (ChatGPT-style hub) ---
let aiChatMessages = [];
let aiActivityStartTime = 0;
let aiLastDebug = null;

function appendAiActivity(message, data = {}) {
  const logEl = document.getElementById('ai-activity-log');
  if (!logEl) return;
  const entry = document.createElement('div');
  entry.className = 'ai-activity-entry';
  const ts = new Date().toLocaleTimeString();
  let text = `[${ts}] ${message}`;
  if (data.rawLength != null) text += ` (${data.rawLength} chars)`;
  entry.textContent = text;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function setAiDebug(info) {
  aiLastDebug = info;
  const el = document.getElementById('ai-debug-content');
  if (!el) return;
  el.textContent = info ? JSON.stringify(info, null, 2) : '';
}

window.addEventListener('ai-activity', (e) => {
  const { message, ok, error, rawLength, rawSnippet } = e.detail || {};
  appendAiActivity(message, { rawLength });
  if (message === 'Complete' || message === 'Error') {
    const duration = aiActivityStartTime ? Math.round((Date.now() - aiActivityStartTime) / 1000) : 0;
    const debug = { ...aiLastDebug, durationSec: duration, ok: !!ok, error: error || null };
    if (rawSnippet) debug.rawSnippet = rawSnippet;
    setAiDebug(debug);
  }
});

function appendAiChatMessage(role, content, taskData = null) {
  aiChatMessages.push({ role, content, taskData });
  renderAiChat();
}

function renderAiChat() {
  const container = document.getElementById('ai-chat-messages');
  const emptyEl = document.getElementById('ai-chat-empty');
  if (!container) return;
  if (aiChatMessages.length === 0) {
    emptyEl?.classList.remove('hidden');
    container.querySelectorAll('.ai-chat-msg').forEach((el) => el.remove());
    return;
  }
  emptyEl?.classList.add('hidden');
  container.querySelectorAll('.ai-chat-msg').forEach((el) => el.remove());
  for (let i = 0; i < aiChatMessages.length; i++) {
    const m = aiChatMessages[i];
    const div = document.createElement('div');
    div.className = `ai-chat-msg ${m.role}`;
    let html = escapeHtml(m.content).replace(/\n/g, '<br>');
    if (m.taskData) {
      if (m.taskData.type === 'categorize' && m.taskData.suggestions?.length) {
        const modById = m.taskData.modById || new Map();
        html += '<ul style="margin:0.5rem 0 0 1rem;">';
        m.taskData.suggestions.slice(0, 15).forEach((s) => {
          const name = modById.get(s.id)?.displayName || modById.get(s.id)?.customName || s.id || '';
          html += `<li>${escapeHtml(name)} → ${escapeHtml(s.category || '')}</li>`;
        });
        if (m.taskData.suggestions.length > 15) html += '<li>…and more</li>';
        html += '</ul>';
        html += '<div class="ai-chat-msg-actions"><button type="button" class="ai-chat-apply-categorize" data-msg-index="' + i + '">Apply in batch modal</button></div>';
      } else if (m.taskData.type === 'groups' && m.taskData.data?.length) {
        const modById = m.taskData.modById || new Map();
        html += '<ul style="margin:0.5rem 0 0 1rem;">';
        m.taskData.data.slice(0, 10).forEach((g) => {
          const names = (g.modIds || []).slice(0, 5).map((id) => modById.get(id)?.displayName || modById.get(id)?.customName || id);
          html += `<li>${escapeHtml(g.suggestedName || g.reason || '')}: ${names.join(', ')}${(g.modIds?.length || 0) > 5 ? '…' : ''}</li>`;
        });
        if (m.taskData.data.length > 10) html += '<li>…and more</li>';
        html += '</ul>';
        html += '<div class="ai-chat-msg-actions"><button type="button" class="ai-chat-open-groups" data-msg-index="' + i + '">Open Groups to create</button></div>';
      } else if (m.taskData.type === 'load-order' && m.taskData.data?.length) {
        html += '<pre style="margin:0.5rem 0 0;font-size:0.85em;">' + escapeHtml(m.taskData.data.slice(0, 12).join('\n')) + (m.taskData.data.length > 12 ? '\n…' : '') + '</pre>';
        html += '<div class="ai-chat-msg-actions"><button type="button" class="ai-chat-apply-load-order" data-msg-index="' + i + '">Apply load order</button></div>';
      }
    }
    div.innerHTML = html;
    container.appendChild(div);
    const applyCat = div.querySelector('.ai-chat-apply-categorize');
    if (applyCat) {
      applyCat.addEventListener('click', async () => {
        const d = aiChatMessages[parseInt(applyCat.dataset.msgIndex, 10)]?.taskData;
        if (d?.suggestions) {
          const modById = d.modById || new Map((await window.cp2077.listMods()).map((m) => [m.id, m]));
          await showAiBatchCategorizeModal(d.suggestions, d.newCategories || [], modById);
        }
      });
    }
    const openGroups = div.querySelector('.ai-chat-open-groups');
    if (openGroups) {
      const msgIdx = parseInt(openGroups.dataset.msgIndex ?? '0', 10);
      openGroups.addEventListener('click', async () => {
        const d = aiChatMessages[msgIdx]?.taskData;
        const preloaded = d?.data?.length ? { preloadedSuggestions: { data: d.data, modById: d.modById } } : {};
        await showGroupsModal(preloaded);
      });
    }
    const applyOrder = div.querySelector('.ai-chat-apply-load-order');
    if (applyOrder) {
      applyOrder.addEventListener('click', () => {
        const d = aiChatMessages[parseInt(applyOrder.dataset.msgIndex, 10)]?.taskData;
        if (d?.data?.length) {
          renderLoadOrderList(d.data);
          switchPage('load-order');
          showToast('Load order updated. Click Apply load order to save.', 'info');
        }
      });
    }
  }
  container.scrollTop = container.scrollHeight;
}

async function runAiChatTask(task, userInput = '', updateProgress = () => {}, opts = {}) {
  if (!(await window.cp2077?.aiHasKey?.())) {
    showToast('Set your OpenAI API key in Options to use AI features.', 'error');
    return;
  }
  updateProgress({ step: 1, total: 2, currentTask: 'Loading mods…' });
  const mods = await window.cp2077.listMods();
  let userLabel = '';
  let result = null;
  if (task === 'categorize') {
    userLabel = 'Categorize uncategorized mods';
    appendAiChatMessage('user', userLabel, null);
    const uncategorized = mods.filter((m) => !m.customCategory || m.customCategory === 'Uncategorized');
    if (!uncategorized.length) {
      appendAiChatMessage('assistant', 'No uncategorized mods found.', null);
      return;
    }
    updateProgress({ step: 2, total: 2, currentTask: 'Categorizing mods with AI…' });
    result = await window.cp2077.aiBatchCategorize(uncategorized);
    if (result.ok) {
      const modById = new Map(mods.map((m) => [m.id, m]));
      appendAiChatMessage('assistant', `Suggested categories for ${result.suggestions.length} mod(s):`, {
        type: 'categorize',
        suggestions: result.suggestions,
        newCategories: result.newCategories,
        modById,
      });
    } else {
      appendAiChatMessage('assistant', result.error || 'Categorize failed.', null);
    }
  } else if (task === 'troubleshoot') {
    if (!userInput.trim()) {
      showToast('Describe your issue (e.g. game crashes, missing content).', 'info');
      return;
    }
    userLabel = userInput;
    appendAiChatMessage('user', userLabel, null);
    updateProgress({ step: 2, total: 2, currentTask: 'Analyzing your issue with AI…' });
    result = await window.cp2077.aiTroubleshoot(mods, userInput);
    if (result.ok) {
      appendAiChatMessage('assistant', result.data || 'No response.', null);
    } else {
      appendAiChatMessage('assistant', result.error || 'Troubleshoot failed.', null);
    }
  } else if (task === 'suggest-groups') {
    userLabel = opts.customInstructions ? `Suggest mod groups: ${opts.customInstructions}` : 'Suggest mod groups';
    appendAiChatMessage('user', userLabel, null);
    updateProgress({ step: 2, total: 2, currentTask: 'Suggesting mod groups with AI…' });
    result = await window.cp2077.aiSuggestGroups(mods, opts.customInstructions);
    if (result.ok && result.data?.length) {
      const modById = new Map(mods.map((m) => [m.id, m]));
      appendAiChatMessage('assistant', `Suggested ${result.data.length} group(s):`, { type: 'groups', data: result.data, modById });
    } else if (result.ok) {
      appendAiChatMessage('assistant', 'No group suggestions found.', null);
    } else {
      appendAiChatMessage('assistant', result.error || 'Suggest groups failed.', null);
    }
  } else if (task === 'suggest-load-order') {
    userLabel = 'Suggest load order';
    appendAiChatMessage('user', userLabel, null);
    updateProgress({ step: 2, total: 2, currentTask: 'Loading current order…' });
    const currentOrder = await window.cp2077.getLoadOrder();
    updateProgress({ step: 2, total: 2, currentTask: 'Suggesting load order with AI…' });
    result = await window.cp2077.aiSuggestLoadOrder(mods, currentOrder);
    if (result.ok && result.data?.length) {
      appendAiChatMessage('assistant', `Suggested load order (${result.data.length} archives):`, { type: 'load-order', data: result.data });
    } else if (result.ok) {
      appendAiChatMessage('assistant', 'No archive mods to order.', null);
    } else {
      appendAiChatMessage('assistant', result.error || 'Suggest load order failed.', null);
    }
  }
  renderAiChat();
}

function clearAiActivityAndStart(task) {
  const logEl = document.getElementById('ai-activity-log');
  if (logEl) logEl.innerHTML = '';
  aiActivityStartTime = Date.now();
  setAiDebug({ task, startedAt: new Date().toISOString() });
}

document.querySelectorAll('.ai-quick-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const task = chip.dataset.task;
    if (!task) return;
    if (task === 'troubleshoot') {
      document.getElementById('ai-chat-input')?.focus();
      showToast('Describe your issue in the input below (e.g. game crashes, missing content).', 'info');
      return;
    }
    clearAiActivityAndStart(task);
    const labels = { categorize: 'Categorizing mods…', 'suggest-groups': 'Suggesting groups…', 'suggest-load-order': 'Suggesting load order…' };
    withLoading(labels[task] || 'AI working…', ({ updateProgress }) => runAiChatTask(task, '', updateProgress))();
  });
});

document.getElementById('ai-chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('ai-chat-send')?.click();
  }
});

document.getElementById('ai-chat-send')?.addEventListener('click', async () => {
  const input = document.getElementById('ai-chat-input');
  const text = input?.value?.trim();
  if (!text) return;
  if (!(await window.cp2077?.aiHasKey?.())) {
    showToast('Set your OpenAI API key in Options to use AI features.', 'error');
    return;
  }
  input.value = '';
  let task = 'troubleshoot';
  let customInstructions = null;
  try {
    const classified = await window.cp2077?.aiClassifyChatIntent?.(text);
    if (classified?.task) task = classified.task;
    if (classified?.customInstructions) customInstructions = classified.customInstructions;
  } catch {
    // Fallback to troubleshoot if classification fails
  }
  clearAiActivityAndStart(task);
  const loadingLabels = {
    troubleshoot: 'Analyzing your issue…',
    categorize: 'Categorizing mods…',
    'suggest-groups': 'Suggesting mod groups…',
    'suggest-load-order': 'Suggesting load order…',
  };
  withLoading(loadingLabels[task] || 'AI working…', ({ updateProgress }) =>
    runAiChatTask(task, task === 'troubleshoot' ? text : '', updateProgress, { customInstructions })
  )();
});

// --- AI Suggest Load Order ---
document.getElementById('btn-ai-suggest-load-order')?.addEventListener('click', withLoading('AI suggesting load order...', async () => {
  if (!(await window.cp2077?.aiHasKey?.())) {
    showToast('Set your OpenAI API key in Options to use AI features.', 'error');
    return;
  }
  const mods = await window.cp2077.listMods();
  const currentOrder = await window.cp2077.getLoadOrder();
  const result = await window.cp2077.aiSuggestLoadOrder(mods, currentOrder);
  if (!result.ok) {
    showToast(result.error || 'AI suggest load order failed.', 'error');
    return;
  }
  const suggested = result.data || [];
  renderLoadOrderList(suggested);
  showToast('Load order updated with AI suggestion. Review and click Apply load order to save.', 'info');
}));

// --- AI Troubleshoot ---
function hideAiTroubleshootModal() {
  const el = document.getElementById('ai-troubleshoot-modal');
  if (el) {
    el.classList.remove('visible');
    el.setAttribute('aria-hidden', 'true');
  }
}

document.getElementById('btn-ai-troubleshoot')?.addEventListener('click', async () => {
  if (!(await window.cp2077?.aiHasKey?.())) {
    showToast('Set your OpenAI API key in Options to use AI features.', 'error');
    return;
  }
  const modal = document.getElementById('ai-troubleshoot-modal');
  document.getElementById('ai-troubleshoot-input').value = '';
  document.getElementById('ai-troubleshoot-response').textContent = '';
  if (modal) {
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
  }
});

document.getElementById('ai-troubleshoot-ask')?.addEventListener('click', withLoading('Asking AI...', async () => {
  const input = document.getElementById('ai-troubleshoot-input');
  const msg = input?.value?.trim();
  if (!msg) return;
  const mods = await window.cp2077.listMods();
  const result = await window.cp2077.aiTroubleshoot(mods, msg);
  const respEl = document.getElementById('ai-troubleshoot-response');
  if (!result.ok) {
    respEl.textContent = result.error || 'Request failed.';
    return;
  }
  respEl.textContent = result.data || 'No response.';
}));

document.getElementById('ai-troubleshoot-modal-close')?.addEventListener('click', () => hideAiTroubleshootModal());
document.getElementById('ai-troubleshoot-modal')?.addEventListener('click', (ev) => {
  if (ev.target?.id === 'ai-troubleshoot-modal') hideAiTroubleshootModal();
});

async function handleConflictChoice(choice) {
  const conflict = conflictQueue[0];
  if (!conflict) {
    hideConflictModal();
    return;
  }
  const result = await window.cp2077.resolveConflict(conflict, choice);
  if (!result.ok) {
    showToast(result.error || 'Failed to resolve conflict', 'error');
    return;
  }
  conflictQueue.shift();
  if (conflictQueue.length) {
    showConflictModal(conflictQueue[0]);
  } else {
    hideConflictModal();
    await refreshModList();
    await refreshLoadOrder();
  }
}

function slimModNameForSearch(fullName) {
  let s = (fullName || '').trim();
  if (!s) return s;
  s = s.replace(/_/g, ' ');
  s = s.replace(/\s+[vV]\d+(\.\d+)*\s*$/i, '').trim();
  s = s.replace(/\s+\d+\.\d+(\.\d+)*\s*$/, '').trim();
  s = s.replace(/-\d+(-\d+){3,}$/, '').trim();
  s = s.replace(/\s+/g, ' ').trim();
  return s || fullName.trim();
}

function buildNexusSearchUrl(modName) {
  const search = slimModNameForSearch(modName);
  if (!search) return 'https://www.nexusmods.com/games/cyberpunk2077/search';
  const keyword = encodeURIComponent(search).replace(/%20/g, '+');
  return `https://www.nexusmods.com/games/cyberpunk2077/search?keyword=${keyword}`;
}

async function populateCategoryDropdown(selectedCategory) {
  if (!modEditCategoryEl) return;
  const { predefined, user } = await window.cp2077.getCategories();
  const allCategories = [...predefined, ...user];
  if (selectedCategory && !allCategories.includes(selectedCategory)) {
    allCategories.push(selectedCategory);
  }
  modEditCategoryEl.innerHTML = '';
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = 'Uncategorized';
  modEditCategoryEl.appendChild(emptyOpt);
  for (const cat of allCategories) {
    if (cat === 'Uncategorized') continue;
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    modEditCategoryEl.appendChild(opt);
  }
  const addOpt = document.createElement('option');
  addOpt.value = '__add_category__';
  addOpt.textContent = 'Add category…';
  modEditCategoryEl.appendChild(addOpt);
  modEditCategoryEl.value = selectedCategory || '';
}

function nameSimilarity(a, b) {
  const sa = (a || '').toLowerCase().replace(/\s+/g, ' ');
  const sb = (b || '').toLowerCase().replace(/\s+/g, ' ');
  const wordsA = new Set(sa.split(' ').filter(Boolean));
  const wordsB = new Set(sb.split(' ').filter(Boolean));
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w) || [...wordsB].some((bw) => bw.includes(w) || w.includes(bw))) matches++;
  }
  return matches;
}

async function populateParentDropdown(currentModId, currentModName, selectedParentId) {
  const sel = document.getElementById('mod-edit-parent-mod');
  const searchEl = document.getElementById('mod-edit-parent-search');
  if (!sel) return;
  const mods = await window.cp2077?.listMods?.() || [];
  const others = mods.filter((m) => m.id !== currentModId);
  others.sort((a, b) => {
    const na = getModDisplayName(a);
    const nb = getModDisplayName(b);
    const simA = nameSimilarity(na, currentModName);
    const simB = nameSimilarity(nb, currentModName);
    if (simB !== simA) return simB - simA;
    return na.localeCompare(nb);
  });
  sel.innerHTML = '<option value="">— None —</option>';
  for (const m of others) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = getModDisplayName(m);
    opt.dataset.search = (getModDisplayName(m) + ' ' + (m.customName || '')).toLowerCase();
    sel.appendChild(opt);
  }
  sel.value = selectedParentId || '';
  if (searchEl) {
    searchEl.value = '';
    searchEl.oninput = () => {
      const q = searchEl.value.trim().toLowerCase();
      for (const opt of sel.options) {
        if (opt.value === '') { opt.hidden = false; continue; }
        opt.hidden = q ? !opt.dataset.search?.includes(q) : false;
      }
    };
  }
}

async function showModEditModal(mod) {
  if (!modEditModalEl || !mod) return;
  modEditCurrentMod = mod;
  const displayName = mod.customName || mod.displayName || mod.id;
  modEditTitleEl.textContent = `Edit: ${escapeHtml(displayName)}`;
  modEditNameEl.value = mod.customName || '';
  modEditDescriptionEl.value = htmlToPlainText(mod.customDescription || '');
  autoResizeDescriptionTextarea();
  modEditTagInputEl.value = '';
  await populateCategoryDropdown(mod.customCategory);
  const searchInput = document.getElementById('mod-edit-nexus-search-input');
  const initialSearch = slimModNameForSearch(modEditNameEl.value || displayName);
  if (searchInput) {
    searchInput.value = initialSearch;
  }
  modEditNexusSearchEl.href = buildNexusSearchUrl(displayName);
  modEditNexusSearchEl.onclick = (ev) => {
    ev.preventDefault();
    modEditWebviewEl.src = buildNexusSearchUrl(modEditNameEl.value || displayName);
  };
  modEditWebviewEl.src = buildNexusSearchUrl(initialSearch);

  const nexusIdInput = document.getElementById('mod-edit-nexus-id');
  if (mod.nexusModId != null || mod.nexusUrl) {
    modEditNexusLookupData = { nexusModId: mod.nexusModId, nexusUrl: mod.nexusUrl };
  } else {
    modEditNexusLookupData = null;
  }
  if (nexusIdInput) {
    nexusIdInput.value = mod.nexusModId ?? mod.customNexusModId ?? '';
  }

  const tags = mod.customTags || [];
  renderTagPills(tags);
  renderImageThumbs(mod.id, mod.customImages || []);

  await populateParentDropdown(mod.id, getModDisplayName(mod), mod.parentModId);
  const parentSel = document.getElementById('mod-edit-parent-mod');
  const childWrap = document.getElementById('mod-edit-child-fields-wrap');
  const childNameEl = document.getElementById('mod-edit-child-addon-name');
  const childDescEl = document.getElementById('mod-edit-child-addon-desc');
  if (childNameEl) childNameEl.value = mod.childAddonName || '';
  if (childDescEl) childDescEl.value = mod.childAddonDescription || '';
  const toggleChildFields = () => {
    const hasParent = parentSel?.value?.trim();
    if (childWrap) {
      childWrap.style.display = hasParent ? '' : 'none';
      childWrap.setAttribute('aria-hidden', !hasParent);
    }
  };
  toggleChildFields();
  if (parentSel) parentSel.onchange = toggleChildFields;

  const aiGenBtn = document.getElementById('mod-edit-ai-generate');
  if (aiGenBtn) {
    const hasKey = await window.cp2077?.aiHasKey?.();
    aiGenBtn.style.display = hasKey ? '' : 'none';
  }

  modEditModalEl.classList.add('visible');
  modEditModalEl.setAttribute('aria-hidden', 'false');
}

function hideModEditModal() {
  if (!modEditModalEl) return;
  modEditModalEl.classList.remove('visible');
  modEditModalEl.setAttribute('aria-hidden', 'true');
  modEditCurrentMod = null;
}

function getEditFormTags() {
  return Array.from(modEditTagsContainerEl.querySelectorAll('.mod-edit-tag-pill')).map(
    (el) => el.dataset.tag || ''
  );
}

function getEditFormImages() {
  return Array.from(modEditImagesContainerEl.querySelectorAll('.mod-edit-image-thumb')).map(
    (el) => el.dataset.filename || ''
  );
}

function renderTagPills(tags) {
  modEditTagsContainerEl.innerHTML = '';
  for (const tag of tags) {
    const pill = document.createElement('span');
    pill.className = 'mod-edit-tag-pill';
    pill.dataset.tag = tag;
    pill.textContent = tag;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mod-edit-tag-remove';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      pill.remove();
    });
    pill.appendChild(remove);
    modEditTagsContainerEl.appendChild(pill);
  }
}

function renderImageThumbs(modId, images) {
  modEditImagesContainerEl.innerHTML = '';
  for (const filename of images) {
    const wrap = document.createElement('div');
    wrap.className = 'mod-edit-image-thumb';
    wrap.dataset.filename = filename;
    const img = document.createElement('img');
    img.src = `mod-thumb://${encodeURIComponent(modId)}/${encodeURIComponent(filename)}`;
    img.alt = filename;
    img.onerror = () => { wrap.classList.add('mod-edit-image-error'); };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mod-edit-image-remove';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      wrap.remove();
    });
    wrap.appendChild(img);
    wrap.appendChild(remove);
    modEditImagesContainerEl.appendChild(wrap);
  }
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

const installResultModalEl = document.getElementById('install-result-modal');
const installResultContentEl = document.getElementById('install-result-content');
const installResultTitleEl = document.getElementById('install-result-title');
const installResultCloseBtn = document.getElementById('install-result-close');

function showInstallResult(result) {
  if (!installResultModalEl || !installResultContentEl) return;
  const { installed = [], skipped = [], failed = [] } = result;
  const total = installed.length + skipped.length + failed.length;

  const parts = [];

  if (total === 0) {
    parts.push(`<p class="install-result-summary">No mods found in the Foundational Mods folder.</p>`);
  } else {
    const summaries = [];
    if (installed.length) summaries.push(`${installed.length} installed`);
    if (skipped.length) summaries.push(`${skipped.length} already in your mods`);
    if (failed.length) summaries.push(`${failed.length} couldn't install`);
    const summaryText = summaries.join(', ');
    const allOk = failed.length === 0;
    parts.push(
      `<p class="install-result-summary">${allOk ? 'All done!' : 'Installation complete'} — ${summaryText}.</p>`
    );

    if (installed.length) {
      const items = installed.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
      parts.push(
        `<div class="install-result-section installed"><h4>✓ Installed</h4><ul>${items}</ul></div>`
      );
    }
    if (skipped.length) {
      const items = skipped.map((s) => `<li>${escapeHtml(s.file)}</li>`).join('');
      parts.push(
        `<div class="install-result-section skipped"><h4>○ Already in your mods</h4><ul>${items}</ul></div>`
      );
    }
    if (failed.length) {
      const items = failed.map(
        (f) => `<li><strong>${escapeHtml(f.file)}</strong> — ${escapeHtml(f.reason)}</li>`
      ).join('');
      parts.push(
        `<div class="install-result-section failed"><h4>✗ Couldn't install</h4><ul>${items}</ul></div>`
      );
    }
  }

  if (installResultTitleEl) installResultTitleEl.textContent = failed.length ? 'Installation results' : 'Installation complete';
  if (installResultContentEl) installResultContentEl.innerHTML = parts.join('');
  if (installResultModalEl) {
    installResultModalEl.classList.add('visible');
    installResultModalEl.setAttribute('aria-hidden', 'false');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Convert HTML (e.g. from Nexus API) to plain text with newlines. */
function htmlToPlainText(html) {
  if (!html || typeof html !== 'string') return '';
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function autoResizeDescriptionTextarea() {
  const el = modEditDescriptionEl;
  if (!el) return;
  el.style.height = 'auto';
  const min = 100;
  const max = 400;
  const h = Math.min(Math.max(el.scrollHeight, min), max);
  el.style.height = h + 'px';
  el.style.overflowY = h >= max ? 'auto' : 'hidden';
}

function hideInstallResult() {
  if (!installResultModalEl) return;
  installResultModalEl.classList.remove('visible');
  installResultModalEl.setAttribute('aria-hidden', 'true');
}

let gameStatusState = { path: null, ok: false };

async function refreshGameStatus() {
  const path = await window.cp2077.getGamePath();
  const launchBtn = document.getElementById('btn-launch-game');
  const pushBtn = document.getElementById('btn-push-mods');
  gameStatusState = { path, ok: !!path };
  if (path) {
    if (launchBtn) launchBtn.disabled = false;
    if (pushBtn) pushBtn.disabled = false;
  } else {
    if (launchBtn) launchBtn.disabled = true;
    if (pushBtn) pushBtn.disabled = true;
  }
  if (currentPage === 'options') renderOptionsSub();
}

let downloadFolderPath = 'Not set';
let backgroundArtworkEnabled = true;

async function refreshDownloadFolder() {
  downloadFolderPath = await window.cp2077.getDownloadFolder();
  downloadFolderPath = downloadFolderPath || 'Not set';
  if (currentPage === 'options') renderOptionsSub();
}

async function updateLeftPanelMod(mod) {
  selectedMod = mod;
  const placeholder = document.getElementById('left-panel-placeholder');
  const content = document.getElementById('left-panel-content');
  if (!mod) {
    placeholder.style.display = 'block';
    content.style.display = 'none';
    content.setAttribute('aria-hidden', 'true');
    const childrenWrap = document.getElementById('mod-detail-children');
    if (childrenWrap) { childrenWrap.style.display = 'none'; childrenWrap.setAttribute('aria-hidden', 'true'); }
    const galleryEl = document.getElementById('mod-detail-gallery');
    if (galleryEl) { galleryEl.innerHTML = ''; galleryEl.style.display = 'none'; galleryEl.setAttribute('aria-hidden', 'true'); }
    return;
  }
  placeholder.style.display = 'none';
  content.style.display = 'block';
  content.setAttribute('aria-hidden', 'false');
  document.getElementById('mod-detail-name').textContent = getModDisplayName(mod);
  document.getElementById('mod-detail-type').textContent = mod.type || '';
  const preview = document.getElementById('mod-detail-preview');
  const firstImg = mod.customImages && mod.customImages[0];
  preview.innerHTML = firstImg
    ? `<img src="mod-thumb://${encodeURIComponent(mod.id)}/${encodeURIComponent(firstImg)}" alt="" />`
    : '';
  const meta = document.getElementById('mod-detail-meta');
  const parts = [];
  const cat = mod.customCategory || mod.category;
  if (cat) parts.push(`Category: ${cat}`);
  const tags = (mod.customTags || []).join(', ');
  if (tags) parts.push(`Tags: ${tags}`);
  meta.textContent = parts.join(' • ') || '';
  meta.style.display = parts.length ? '' : 'none';
  const descEl = document.getElementById('mod-detail-desc');
  const desc = mod.customDescription || '';
  if (descEl) {
    descEl.textContent = desc;
    descEl.style.display = desc ? '' : 'none';
  }
  const childrenWrap = document.getElementById('mod-detail-children');
  const childrenListEl = document.getElementById('mod-detail-children-list');
  if (childrenWrap && childrenListEl) {
    const mods = await window.cp2077?.listMods?.() || [];
    const children = getChildrenOfMod(mod, mods);
    if (children.length === 0) {
      childrenWrap.style.display = 'none';
      childrenWrap.setAttribute('aria-hidden', 'true');
    } else {
      childrenWrap.style.display = '';
      childrenWrap.setAttribute('aria-hidden', 'false');
      childrenListEl.innerHTML = children
        .map((c) => `<li>${escapeHtml(getModDisplayName(c))} ${c.enabled ? '✓' : '○'}</li>`)
        .join('');
    }
  }
  const galleryEl = document.getElementById('mod-detail-gallery');
  if (galleryEl) {
    const images = mod.customImages || [];
    if (images.length > 1) {
      galleryEl.style.display = '';
      galleryEl.setAttribute('aria-hidden', 'false');
      galleryEl.innerHTML = images
        .map((img) => `<img src="mod-thumb://${encodeURIComponent(mod.id)}/${encodeURIComponent(img)}" alt="" loading="lazy" />`)
        .join('');
    } else {
      galleryEl.style.display = 'none';
      galleryEl.setAttribute('aria-hidden', 'true');
      galleryEl.innerHTML = '';
    }
  }
}

let foundationalInspectAbort = null;

async function updateLeftPanelFoundational(item) {
  selectedFoundational = item;
  const placeholder = document.getElementById('left-panel-placeholder');
  const content = document.getElementById('left-panel-downloads');
  const nameEl = document.getElementById('foundational-detail-name');
  const descEl = document.getElementById('foundational-detail-desc');
  const metaEl = document.getElementById('foundational-detail-meta');
  if (!item) {
    placeholder.style.display = 'block';
    content.style.display = 'none';
    content.setAttribute('aria-hidden', 'true');
    return;
  }
  placeholder.style.display = 'none';
  content.style.display = 'block';
  content.setAttribute('aria-hidden', 'false');
  const base = (item.name || '').replace(/\.[^.]+$/, '').replace(/-\d+(-\d+){3,}$/, '').trim();
  nameEl.textContent = base || item.name;
  descEl.textContent = 'Framework mod. Click Install to add to your game.';
  metaEl.innerHTML = '<span class="meta-loading">Inspecting archive…</span>';

  if (foundationalInspectAbort) foundationalInspectAbort.aborted = true;
  foundationalInspectAbort = { aborted: false };

  try {
    const info = await window.cp2077.inspectArchive(item.fullPath);
    if (foundationalInspectAbort.aborted) return;
    nameEl.textContent = info.name || base || item.name;
    const metaParts = [];
    if (info.category) metaParts.push(`Category: ${escapeHtml(info.category)}`);
    metaParts.push(`Type: ${info.modType || 'unknown'}`);
    metaParts.push(`Files: ${info.fileCount ?? '?'}`);
    if (info.hasImages) metaParts.push('Has images');
    if (info.error) metaParts.push(`<span class="meta-error">${escapeHtml(info.error)}</span>`);
    if (!info.supported && !info.error) metaParts.push('<span class="meta-warn">Install may not be supported (7z/rar require conversion to zip)</span>');
    metaEl.innerHTML = metaParts.length ? metaParts.join(' • ') : '';
  } catch (e) {
    if (foundationalInspectAbort.aborted) return;
    metaEl.innerHTML = `<span class="meta-error">Could not inspect: ${escapeHtml(String(e.message || e))}</span>`;
  }
}

async function renderOptionsSub() {
  const sub = document.getElementById('options-sub');
  if (!sub) return;
  const [aiKeySet, showAiOptions, nexusKeySet] = await Promise.all([
    window.cp2077?.aiHasKey?.() ?? false,
    window.cp2077?.getSetting?.('showAiOptions') ?? true,
    window.cp2077?.nexusHasKey?.() ?? false,
  ]);
  sub.innerHTML = `
    <p class="status ${gameStatusState.ok ? 'ok' : 'error'}">${gameStatusState.ok ? 'Game found' : 'Game not set. Use Define game install path.'}</p>
    <p class="path">${escapeHtml(gameStatusState.path || '')}</p>
    <p class="hint">Mods download folder:</p>
    <p class="path">${escapeHtml(downloadFolderPath)}</p>
    <div class="actions">
      <button type="button" id="btn-detect-game">Auto-detect game</button>
      <button type="button" id="btn-select-game">Select game folder…</button>
      <button type="button" id="btn-set-download-folder">Set mods folder…</button>
      <button type="button" id="btn-reset-download-folder">Reset to default</button>
    </div>
    <div class="options-ai-section">
      <p class="hint options-ai-title">AI features (optional)</p>
      <p class="options-ai-desc">The app can use AI to suggest mod descriptions, categories, load order, and more. This is completely optional — the app works fully without it.</p>
      <p class="options-ai-desc">If you'd like to try AI features: enter your OpenAI API key below. Your key is stored locally and never shared. You'll need an OpenAI account (usage may incur charges).</p>
      <div class="options-ai-row">
        <input type="password" id="ai-api-key-input" placeholder="sk-…" class="options-ai-input" />
        <button type="button" id="btn-ai-save-key">Save</button>
        <button type="button" id="btn-ai-clear-key">Clear</button>
      </div>
      <p class="options-ai-status">Status: ${aiKeySet ? 'API key set ✓' : 'API key not set'}</p>
      <label class="options-toggle options-ai-toggle"><input type="checkbox" id="opt-show-ai-options" ${showAiOptions ? 'checked' : ''}> Show AI options in toolbar and menus</label>
    </div>
    <div class="options-nexus-section">
      <p class="hint options-nexus-title">Nexus Mods integration</p>
      <p class="options-nexus-desc">Browse, download, and manage mods from Nexus Mods. Enter your personal API key to enable the Nexus page.</p>
      <details class="options-nexus-howto">
        <summary>How to get your API key</summary>
        <ol class="options-nexus-steps">
          <li>Click your Nexus profile icon</li>
          <li>Scroll down and click <strong>Site preferences</strong></li>
          <li>Click the far right <strong>API</strong> tab</li>
          <li>Scroll to the bottom to <strong>Personal API key</strong></li>
          <li>Click <strong>Generate</strong> (or copy existing key)</li>
          <li>Copy and paste into the app</li>
        </ol>
      </details>
      <div class="options-ai-row">
        <input type="password" id="nexus-api-key-input" placeholder="Nexus API key" class="options-ai-input" />
        <button type="button" id="btn-nexus-save-key">Save</button>
        <button type="button" id="btn-nexus-clear-key">Clear</button>
      </div>
      <p class="options-nexus-status">Status: ${nexusKeySet ? 'API key set ✓' : 'API key not set'}</p>
    </div>
    <p class="hint" style="margin-top: 1.5em;">Appearance:</p>
    <label class="options-toggle"><input type="checkbox" id="opt-background-artwork" ${backgroundArtworkEnabled ? 'checked' : ''}> Background artwork</label>
  `;
  sub.querySelector('#btn-ai-save-key')?.addEventListener('click', async () => {
    const input = sub.querySelector('#ai-api-key-input');
    const key = input?.value?.trim();
    if (!key) return;
    await window.cp2077.aiSetKey(key);
    input.value = '';
    await renderOptionsSub();
    refreshAiButtonsVisibility();
  });
  sub.querySelector('#btn-ai-clear-key')?.addEventListener('click', async () => {
    await window.cp2077.aiClearKey();
    sub.querySelector('#ai-api-key-input').value = '';
    await renderOptionsSub();
    refreshAiButtonsVisibility();
  });
  sub.querySelector('#btn-nexus-save-key')?.addEventListener('click', async () => {
    const input = sub.querySelector('#nexus-api-key-input');
    const key = input?.value?.trim();
    if (!key) return;
    await window.cp2077.nexusSetKey(key);
    input.value = '';
    const validateRes = await window.cp2077.nexusValidate();
    if (validateRes.ok) showToast('Nexus API key saved and validated.', 'success');
    else showToast(validateRes.error || 'Key saved but validation failed.', 'error');
    await renderOptionsSub();
  });
  sub.querySelector('#btn-nexus-clear-key')?.addEventListener('click', async () => {
    await window.cp2077.nexusClearKey();
    sub.querySelector('#nexus-api-key-input').value = '';
    await renderOptionsSub();
  });
  sub.querySelector('#btn-detect-game')?.addEventListener('click', withLoading('Detecting…', async () => {
    const result = await window.cp2077.detectGame();
    if (result.ok) {
      await refreshGameStatus();
      await refreshModList();
    } else {
      gameStatusState = { path: null, ok: false };
      renderOptionsSub();
    }
  }));
  sub.querySelector('#btn-select-game')?.addEventListener('click', withLoading('Selecting…', async () => {
    const result = await window.cp2077.selectGameFolder();
    if (result.canceled) return;
    if (result.ok) {
      await refreshGameStatus();
      await refreshModList();
    }
  }));
  sub.querySelector('#btn-set-download-folder')?.addEventListener('click', withLoading('Setting…', async () => {
    const result = await window.cp2077.selectDownloadFolder();
    if (result.canceled) return;
    if (result.ok) await refreshDownloadFolder();
  }));
  sub.querySelector('#btn-reset-download-folder')?.addEventListener('click', withLoading('Resetting…', async () => {
    await window.cp2077.resetDownloadFolderToDefault();
    await refreshDownloadFolder();
  }));
  sub.querySelector('#opt-background-artwork')?.addEventListener('change', async (e) => {
    const checked = e.target.checked;
    backgroundArtworkEnabled = checked;
    await window.cp2077.setSetting('backgroundArtworkEnabled', checked);
    await applyBackgroundArtwork(checked);
  });
  sub.querySelector('#opt-show-ai-options')?.addEventListener('change', async (e) => {
    const checked = e.target.checked;
    await window.cp2077.setSetting('showAiOptions', checked);
    await refreshAiButtonsVisibility();
  });
}

document.getElementById('btn-launch-game').addEventListener('click', withLoading('Launching Cyberpunk 2077...', async () => {
  const result = await window.cp2077.launchGame();
  if (!result.ok) showToast(result.error || 'Could not launch game.', 'error');
}));

document.getElementById('btn-define-game-path').addEventListener('click', withLoading('Selecting game folder...', async () => {
  const result = await window.cp2077.selectGameFolder();
  if (result.canceled) return;
  if (result.ok) {
    await refreshGameStatus();
    await refreshModList();
  } else showToast(result.error || 'Invalid folder', 'error');
}));

document.getElementById('btn-mods-download-folder').addEventListener('click', withLoading('Selecting mods folder...', async () => {
  const result = await window.cp2077.selectDownloadFolder();
  if (result.canceled) return;
  if (result.ok) await refreshDownloadFolder();
}));

document.getElementById('btn-open-game-folder').addEventListener('click', async () => {
  const res = await window.cp2077.openGameFolder();
  if (!res.ok) showToast(res.error || 'Could not open folder.', 'error');
});

document.getElementById('btn-open-mods-folder').addEventListener('click', async () => {
  const res = await window.cp2077.openModsFolder();
  if (!res.ok) showToast(res.error || 'Could not open folder.', 'error');
});

document.getElementById('btn-archive-load-order').addEventListener('click', () => {
  switchPage('load-order');
});

document.getElementById('btn-load-order-back').addEventListener('click', () => {
  switchPage('options');
});

document.getElementById('btn-install-file').addEventListener('click', withLoading('Installing mod from archive...', async () => {
  const result = await window.cp2077.installFromFile();
  if (result.needGamePath) {
    const sel = await window.cp2077.selectGameFolder();
    if (sel.canceled || !sel.ok) return;
    await refreshGameStatus();
    const installResult = await window.cp2077.installFromFile();
    if (installResult.ok) await refreshModList();
    else if (!installResult.canceled) {
      const msg = installResult.preview?.name
        ? `${installResult.error}\n\nFound in archive: "${installResult.preview.name}"`
        : installResult.error || 'Install failed';
      showToast(msg, 'error');
    }
  } else if (result.ok) {
    await refreshModList();
    await checkConflictsForNewMod();
  } else if (!result.canceled && result.error) {
    const msg = result.preview?.name
      ? `${result.error}\n\nFound in archive: "${result.preview.name}"`
      : result.error;
    showToast(msg, 'error');
  }
}));

document.getElementById('btn-detail-edit').addEventListener('click', () => {
  if (selectedMod) showModEditModal(selectedMod);
});

document.getElementById('btn-detail-uninstall').addEventListener('click', withLoading('Uninstalling...', async () => {
  if (!selectedMod) return;
  const name = selectedMod.displayName || selectedMod.id;
  if (!(await showConfirm(`Uninstall "${name}"?`))) return;
  const result = await window.cp2077.uninstallMod(selectedMod.id);
  if (!result.ok) showToast(result.error || 'Failed', 'error');
  else {
    selectedMod = null;
    updateLeftPanelMod(null);
    await refreshModList();
    await refreshLoadOrder();
  }
}));

document.getElementById('btn-install-all-foundational').addEventListener('click', withLoading('Installing foundational mods...', async () => {
  const gamePath = await window.cp2077.getGamePath();
  if (!gamePath) {
    const sel = await window.cp2077.selectGameFolder();
    if (sel.canceled || !sel.ok) return;
    await refreshGameStatus();
  }
  const result = await window.cp2077.installFoundational();
  if (result.error) {
    showInstallResult({ installed: [], skipped: [], failed: [{ file: 'Error', reason: result.error }] });
  } else {
    showInstallResult(result);
  }
  if (result.installed && result.installed.length) {
    await refreshModList();
  }
}));

document.getElementById('btn-detail-install').addEventListener('click', withLoading('Installing...', async () => {
  if (!selectedFoundational) return;
  const gamePath = await window.cp2077.getGamePath();
  if (!gamePath) {
    const sel = await window.cp2077.selectGameFolder();
    if (sel.canceled || !sel.ok) return;
    await refreshGameStatus();
  }
  const result = await window.cp2077.installFromPath(selectedFoundational.fullPath);
  if (result.ok) {
    await refreshModList();
    await checkConflictsForNewMod();
  } else showToast(result.error || 'Install failed', 'error');
}));

document.getElementById('btn-reset-install').addEventListener('click', withLoading('Resetting install and backing up mods...', async () => {
  const gamePath = await window.cp2077.getGamePath();
  if (!gamePath) {
    showToast('Game path not set.', 'error');
    return;
  }
  const sure = await showConfirm(
    'This will back up and remove modded files/folders from your Cyberpunk 2077 install.\n\nContinue?',
    { confirmLabel: 'Continue', dangerous: true }
  );
  if (!sure) return;
  const result = await window.cp2077.resetInstall();
  if (!result.ok) {
    showToast(result.error || 'Reset failed.', 'error');
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
    showToast(result.error || 'Failed to push mods.', 'error');
    return;
  }
  await refreshModList();
  await refreshLoadOrder();
}));

document.getElementById('btn-enable-all-mods').addEventListener('click', withLoading('Enabling all mods...', async () => {
  const result = await window.cp2077.enableAllMods();
  if (!result.ok) {
    showToast(result.error || 'Failed to enable all mods.', 'error');
    return;
  }
  const n = result.count ?? 0;
  showToast(n > 0 ? `Enabled ${n} mod(s).` : 'All mods were already enabled.', 'success');
  await refreshModList();
  await refreshLoadOrder();
}));

document.getElementById('btn-disable-all-mods').addEventListener('click', withLoading('Disabling all mods...', async () => {
  const result = await window.cp2077.disableAllMods();
  if (!result.ok) {
    showToast(result.error || 'Failed to disable all mods.', 'error');
    return;
  }
  const n = result.count ?? 0;
  showToast(n > 0 ? `Disabled ${n} mod(s).` : 'All mods were already disabled.', 'success');
  await refreshModList();
  await refreshLoadOrder();
}));

document.getElementById('btn-uninstall-all-mods').addEventListener('click', withLoading('Uninstalling all mods...', async () => {
  const mods = await window.cp2077.listMods();
  if (mods.length === 0) {
    showToast('No mods installed.', 'info');
    return;
  }
  if (!(await showConfirm(`Uninstall all ${mods.length} mod(s)? This will remove all tracked files and remove them from the manager.`, { confirmLabel: 'Uninstall all', dangerous: true }))) return;
  const result = await window.cp2077.uninstallAllMods();
  if (!result.ok) {
    showToast(result.error || 'Failed to uninstall all mods.', 'error');
    return;
  }
  showToast(`Uninstalled ${result.count ?? mods.length} mod(s).`, 'success');
  await refreshModList();
  await refreshLoadOrder();
}));

document.getElementById('btn-dump-all-mods').addEventListener('click', withLoading('Dumping all mods to folder...', async () => {
  const gamePath = await window.cp2077.getGamePath();
  if (!gamePath) {
    showToast('Game path not set.', 'error');
    return;
  }
  const sure = await showConfirm(
    'This will extract every mod (archive, bin, r6, red4ext, mods) into a folder of your choosing. This can take some time and may cause issues if the destination has conflicting files.\n\nContinue?',
    { confirmLabel: 'Choose folder…', dangerous: true }
  );
  if (!sure) return;
  const result = await window.cp2077.dumpAllModsToFolder();
  if (result.canceled) return;
  if (!result.ok) {
    showToast(result.error || 'Dump failed.', 'error');
    return;
  }
  const n = result.filesCopied ?? 0;
  showToast(`Dump complete. ${n} file(s)/folder(s) copied.`, 'success');
}));

document.getElementById('btn-extract-mods-separate').addEventListener('click', withLoading('Extracting mods to separate folders...', async () => {
  const gamePath = await window.cp2077.getGamePath();
  if (!gamePath) {
    showToast('Game path not set.', 'error');
    return;
  }
  const sure = await showConfirm(
    'This will extract each mod into its own named folder. Can take some time and may cause issues if the destination has conflicting folders.\n\nContinue?',
    { confirmLabel: 'Choose folder…', dangerous: true }
  );
  if (!sure) return;
  const result = await window.cp2077.extractModsToSeparateFolders();
  if (result.canceled) return;
  if (!result.ok) {
    showToast(result.error || 'Extract failed.', 'error');
    return;
  }
  const mods = result.modsExtracted ?? 0;
  const files = result.filesCopied ?? 0;
  showToast(`Extract complete. ${mods} mod(s), ${files} file(s)/folder(s) copied.`, 'success');
}));

contextUninstallBtn.addEventListener('click', withLoading('Uninstalling mod(s)...', async ({ updateProgress }) => {
  if (!contextMenuMods.length) return;
  const n = contextMenuMods.length;
  const names = n <= 3 ? contextMenuMods.map((m) => m.displayName || m.id).join(', ') : `${n} mods`;
  hideModContextMenu();
  if (!(await showConfirm(n > 1 ? `Uninstall ${n} mods? This will remove tracked files and remove them from the manager.` : `Uninstall "${names}"? This will remove tracked files and remove it from the manager.`, { confirmLabel: 'Uninstall', dangerous: true }))) return;
  let step = 0;
  for (const mod of contextMenuMods) {
    step += 1;
    updateProgress({ step, total: n, currentTask: `Uninstalling ${mod.displayName || mod.id}…` });
    const result = await window.cp2077.uninstallMod(mod.id);
    if (!result.ok) showToast(result.error || `Failed to uninstall ${mod.displayName || mod.id}.`, 'error');
  }
  await refreshModList();
  await refreshLoadOrder();
}));

contextEditModBtn.addEventListener('click', () => {
  if (!contextMenuMod) return;
  const mod = contextMenuMod;
  hideModContextMenu();
  showModEditModal(mod);
});

document.getElementById('ctx-add-to-group')?.addEventListener('click', () => {
  if (!contextMenuMods.length) return;
  hideModContextMenu();
  const ids = contextMenuMods.map((m) => m.id);
  showGroupsModal(ids.length > 1 ? { addModIds: ids } : { addModId: ids[0] });
});

document.getElementById('ctx-create-group')?.addEventListener('click', () => {
  hideModContextMenu();
  const ids = contextMenuMods.length ? contextMenuMods.map((m) => m.id) : [...selectedModIds];
  if (ids.length === 0) {
    showToast('Select at least one mod (use the selection checkbox on each row, or right-click a mod).', 'info');
    return;
  }
  showGroupsModal({ createWithModIds: ids });
});

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
  if (!res.ok) showToast(res.error || 'Could not open file location.', 'error');
}));

document.getElementById('ctx-ai-categorize')?.addEventListener('click', withLoading('AI categorizing...', async ({ updateProgress }) => {
  if (!contextMenuMods.length) return;
  if (!(await window.cp2077?.aiHasKey?.())) {
    showToast('Set your OpenAI API key in Options to use AI features.', 'error');
    hideModContextMenu();
    return;
  }
  hideModContextMenu();
  const uncategorized = contextMenuMods.filter((m) => !m.customCategory || m.customCategory === 'Uncategorized');
  if (!uncategorized.length) return;
  updateProgress({ step: 1, total: 2, currentTask: 'Analyzing mods with AI…' });
  const mods = await window.cp2077.listMods();
  const result = await window.cp2077.aiBatchCategorize(uncategorized);
  updateProgress({ step: 2, total: 2, currentTask: 'Processing results…' });
  if (!result.ok) {
    showToast(result.error || 'AI batch categorize failed.', 'error');
    return;
  }
  const modById = new Map(mods.map((m) => [m.id, m]));
  await showAiBatchCategorizeModal(result.suggestions, result.newCategories, modById);
}));

document.getElementById('ctx-ai-troubleshoot')?.addEventListener('click', async () => {
  if (!contextMenuMods.length) return;
  if (!(await window.cp2077?.aiHasKey?.())) {
    showToast('Set your OpenAI API key in Options to use AI features.', 'error');
    hideModContextMenu();
    return;
  }
  hideModContextMenu();
  document.getElementById('ai-troubleshoot-input').value = '';
  document.getElementById('ai-troubleshoot-response').textContent = '';
  const modal = document.getElementById('ai-troubleshoot-modal');
  if (modal) {
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
  }
});

document.getElementById('ctx-ai-generate')?.addEventListener('click', async () => {
  if (!contextMenuMod || !window.cp2077?.aiGenerateDescription) return;
  if (!(await window.cp2077?.aiHasKey?.())) {
    showToast('Set your OpenAI API key in Options to use AI features.', 'error');
    hideModContextMenu();
    return;
  }
  const mod = contextMenuMod;
  hideModContextMenu();
  showModEditModal(mod);
  setTimeout(() => document.getElementById('mod-edit-ai-generate')?.click(), 100);
});

document.getElementById('ctx-add-to-child-name')?.addEventListener('click', async () => {
  if (!contextMenuMod || !contextMenuMod.parentModId) return;
  hideModContextMenu();
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch (_) {}
  if (!text) text = prompt('Text to add to Child/add-on name:') || '';
  if (!text.trim()) return;
  const cust = await window.cp2077?.getModCustomization?.(contextMenuMod.id) || {};
  const current = cust.childAddonName || '';
  const next = current ? `${current} ${text.trim()}` : text.trim();
  await window.cp2077?.setModCustomization?.(contextMenuMod.id, { ...cust, childAddonName: next });
  await refreshModList();
  showToast('Added to Child/add-on name.', 'success');
});

document.getElementById('ctx-add-to-child-desc')?.addEventListener('click', async () => {
  if (!contextMenuMod || !contextMenuMod.parentModId) return;
  hideModContextMenu();
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch (_) {}
  if (!text) text = prompt('Text to add to Child/add-on description:') || '';
  if (!text.trim()) return;
  const cust = await window.cp2077?.getModCustomization?.(contextMenuMod.id) || {};
  const current = cust.childAddonDescription || '';
  const next = current ? `${current}\n\n${text.trim()}` : text.trim();
  await window.cp2077?.setModCustomization?.(contextMenuMod.id, { ...cust, childAddonDescription: next });
  await refreshModList();
  showToast('Added to Child/add-on description.', 'success');
});

async function checkDownloadFolderAndPrompt(ctx = {}) {
  const { updateProgress } = ctx;
  const { pending, folder } = await window.cp2077.checkDownloadFolder();
  if (!folder || pending.length === 0) return;
  if (updateProgress) updateProgress({ currentTask: 'Scanning mods folder…' });
  let promptText = '';
  if (pending.length <= 5) {
    const inspections = await Promise.all(pending.map((p) => window.cp2077.inspectArchive(p)));
    const names = inspections.map((i, idx) => i.name || pending[idx].replace(/^.*[/\\]/, '')).filter(Boolean);
    promptText = names.length
      ? `Found: ${names.join(', ')}\n\nInstall these ${pending.length} mod(s)?`
      : `${pending.length} new mod(s) found in the mods download folder. Install them?`;
  } else {
    promptText = `${pending.length} new mod(s) found in the mods download folder. Install them?`;
  }
  const install = await showConfirm(promptText, { confirmLabel: 'Install' });
  if (!install) return;
  const total = pending.length;
  let step = 0;
  for (const p of pending) {
    step += 1;
    const name = p.replace(/^.*[/\\]/, '');
    if (updateProgress) updateProgress({ step, total, currentTask: `Installing ${name}…` });
    const result = await window.cp2077.installFromPath(p);
    if (!result.ok) showToast(`Failed: ${p}\n${result.error}`, 'error');
  }
  await refreshModList();
}

document.getElementById('btn-check-download-folder').addEventListener('click', withLoading('Scanning mods download folder...', checkDownloadFolderAndPrompt));

document.getElementById('btn-check-deps').addEventListener('click', withLoading('Checking dependencies for all mods...', async ({ updateProgress }) => {
  const mods = await window.cp2077.listMods();
  if (!mods.length) {
    showDepsReport('No mods installed.');
    return;
  }
  const missingByMod = [];
  const infoByMod = [];
  const total = mods.length;
  let step = 0;
  for (const mod of mods) {
    step += 1;
    updateProgress({ step, total, currentTask: `Checking ${mod.displayName || mod.id}…` });
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

document.getElementById('btn-manage-groups')?.addEventListener('click', () => showGroupsModal({}));

document.getElementById('btn-check-conflicts').addEventListener('click', withLoading('Checking for conflicts...', async () => {
  const gamePath = await window.cp2077.getGamePath();
  if (!gamePath) {
    const sel = await window.cp2077.selectGameFolder();
    if (sel.canceled || !sel.ok) return;
    await refreshGameStatus();
  }
  const conflicts = await window.cp2077.checkConflicts();
  if (!conflicts.length) {
    showToast('No file conflicts detected between enabled mods.', 'info');
    return;
  }
  conflictQueue = conflicts;
  showConflictModal(conflictQueue[0]);
}));

function renderLoadOrderList(names, listEl) {
  if (!listEl) listEl = document.getElementById('load-order-list');
  if (!listEl) return;
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
    li.addEventListener('dragleave', () => li.classList.remove('drag-over-row'));
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

async function refreshLoadOrder() {
  const names = await window.cp2077.getLoadOrder();
  renderLoadOrderList(names);
}

document.getElementById('btn-refresh-load-order').addEventListener('click', withLoading('Refreshing archive load order...', refreshLoadOrder));
document.getElementById('btn-apply-load-order').addEventListener('click', withLoading('Applying archive load order...', async () => {
  const listEl = document.getElementById('load-order-list');
  const order = JSON.parse(listEl.dataset.order || '[]');
  const result = await window.cp2077.applyLoadOrder(order);
  if (result && !result.ok) showToast(result.error || 'Failed to apply load order.', 'error');
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
  if (!res.ok) showToast(res.error || 'Failed to create profile.', 'error');
  await refreshProfiles();
}));

document.getElementById('btn-profile-save').addEventListener('click', withLoading('Saving current profile...', async () => {
  const id = document.getElementById('profile-select').value;
  if (!id) return;
  const res = await window.cp2077.saveProfile(id);
  if (!res.ok) showToast(res.error || 'Failed to save profile.', 'error');
  await refreshProfiles();
}));

document.getElementById('btn-profile-switch').addEventListener('click', withLoading('Switching profile and syncing mods...', async () => {
  const id = document.getElementById('profile-select').value;
  if (!id) return;
  const res = await window.cp2077.switchProfile(id);
  if (!res.ok) showToast(res.error || 'Failed to switch profile.', 'error');
  await refreshModList();
  await refreshLoadOrder();
  await refreshProfiles();
}));

document.getElementById('btn-profile-delete').addEventListener('click', withLoading('Deleting profile...', async () => {
  const id = document.getElementById('profile-select').value;
  if (!id) return;
  if (!(await showConfirm('Delete this profile?', { confirmLabel: 'Delete', dangerous: true }))) return;
  const res = await window.cp2077.deleteProfile(id);
  if (!res.ok) showToast(res.error || 'Failed to delete profile.', 'error');
  await refreshProfiles();
}));


function getModCategory(mod) {
  return mod.customCategory || (mod.customTags && mod.customTags[0]) || 'Uncategorized';
}

/** True when mod has at least one empty edit field (description, category, tags, images). */
function modNeedsMetadata(mod) {
  const hasDesc = (mod.customDescription || '').trim().length > 0;
  const hasCat = (mod.customCategory || '').trim().length > 0 && (mod.customCategory || '').trim() !== 'Uncategorized';
  const hasTags = Array.isArray(mod.customTags) && mod.customTags.length > 0;
  const hasImages = Array.isArray(mod.customImages) && mod.customImages.length > 0;
  return !hasDesc || !hasCat || !hasTags || !hasImages;
}

function getModDisplayName(mod) {
  if (mod.parentModId && mod.childAddonName) return mod.childAddonName;
  return mod.customName || mod.displayName || mod.id || '';
}

/** Get child/add-on mods for a parent (by parentModId or nexusModId). */
function getChildrenOfMod(parent, allMods) {
  const children = [];
  const nid = parent.nexusModId ?? parent.nexusUrl?.match(/\/mods\/(\d+)/)?.[1];
  for (const m of allMods) {
    if (m.id === parent.id) continue;
    if (m.parentModId === parent.id) children.push(m);
    else if (nid && String(m.nexusModId ?? m.nexusUrl?.match(/\/mods\/(\d+)/)?.[1]) === String(nid)) children.push(m);
  }
  return children;
}

function applyModFilters(mods, filters) {
  let out = mods;
  const search = (filters.search || '').trim().toLowerCase();
  if (search) {
    out = out.filter((m) => getModDisplayName(m).toLowerCase().includes(search) ||
      (m.customDescription || '').toLowerCase().includes(search) ||
      (m.customTags || []).some((t) => t.toLowerCase().includes(search)));
  }
  if (filters.status === 'enabled') out = out.filter((m) => m.enabled);
  else if (filters.status === 'disabled') out = out.filter((m) => !m.enabled);
  if (filters.category) {
    out = out.filter((m) => getModCategory(m) === filters.category);
  }
  if (filters.source === 'nexus') out = out.filter((m) => m.nexusModId != null || m.nexusUrl);
  else if (filters.source === 'manual') out = out.filter((m) => !m.nexusModId && !m.nexusUrl);
  return out;
}

function sortModsInGroups(groups, sortKey) {
  const getName = (m) => getModDisplayName(m).toLowerCase();
  const getDate = (m) => m.installedAt || 0;
  const cmp = (a, b) => {
    switch (sortKey) {
      case 'name-asc': return getName(a).localeCompare(getName(b));
      case 'name-desc': return getName(b).localeCompare(getName(a));
      case 'date-desc': return (getDate(b) - getDate(a));
      case 'date-asc': return (getDate(a) - getDate(b));
      case 'enabled-first': return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0) || getName(a).localeCompare(getName(b));
      case 'disabled-first': return (a.enabled ? 1 : 0) - (b.enabled ? 1 : 0) || getName(a).localeCompare(getName(b));
      default: return getName(a).localeCompare(getName(b));
    }
  };
  for (const [, list] of groups) list.sort(cmp);
  return groups;
}

function groupModsByCategory(mods) {
  const modById = new Map(mods.map((m) => [m.id, m]));
  const byCategory = new Map();
  for (const mod of mods) {
    let category = getModCategory(mod);
    if (mod.parentModId && modById.has(mod.parentModId)) {
      const parentCat = getModCategory(modById.get(mod.parentModId));
      category = parentCat;
    }
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(mod);
  }
  const uncategorized = byCategory.get('Uncategorized') || [];
  const rest = [...byCategory.entries()].filter(([c]) => c !== 'Uncategorized').sort((a, b) => a[0].localeCompare(b[0]));
  const result = [];
  if (uncategorized.length) result.push(['Uncategorized', uncategorized]);
  rest.forEach(([tag, list]) => result.push([tag, list]));
  return result;
}

/**
 * Group mods by nexusModId or parentModId into parent/child families.
 * Returns flat list of { mod, isAddOn, addOnCount }.
 */
function buildModListWithFamilies(mods) {
  const modIds = new Set(mods.map((m) => m.id));
  const byNexus = new Map();
  const byParent = new Map();
  for (const mod of mods) {
    if (mod.parentModId && modIds.has(mod.parentModId)) {
      const pid = mod.parentModId;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(mod);
      continue;
    }
    const nid = mod.nexusModId ?? mod.nexusUrl?.match(/\/mods\/(\d+)/)?.[1];
    if (nid) {
      const key = `n:${nid}`;
      if (!byNexus.has(key)) byNexus.set(key, []);
      byNexus.get(key).push(mod);
    }
  }
  const result = [];
  const emitted = new Set();
  for (const mod of mods) {
    if (emitted.has(mod.id)) continue;
    if (mod.parentModId && modIds.has(mod.parentModId)) continue;
    const parentChildren = byParent.get(mod.id) || [];
    const nid = mod.nexusModId ?? mod.nexusUrl?.match(/\/mods\/(\d+)/)?.[1];
    const nexusSibs = nid ? byNexus.get(`n:${nid}`) || [] : [mod];
    const isFirstNexus = nexusSibs[0] === mod;
    const addOnCount = parentChildren.length + (isFirstNexus ? Math.max(0, nexusSibs.length - 1) : 0);
    result.push({ mod, isAddOn: false, addOnCount });
    emitted.add(mod.id);
    if (isFirstNexus) {
      for (const s of nexusSibs) {
        if (s.id !== mod.id) { result.push({ mod: s, isAddOn: true, addOnCount: 0 }); emitted.add(s.id); }
      }
    }
    for (const c of parentChildren) {
      result.push({ mod: c, isAddOn: true, addOnCount: 0 });
      emitted.add(c.id);
    }
  }
  for (const mod of mods) {
    if (emitted.has(mod.id)) continue;
    result.push({ mod, isAddOn: false, addOnCount: 0 });
  }
  return result;
}

async function populateModFilterCategory(mods) {
  const sel = document.getElementById('mod-filter-category');
  if (!sel) return;
  const { predefined = [], user = [] } = await window.cp2077?.getCategories?.() || {};
  const fromMods = mods.map(getModCategory).filter(Boolean);
  const allCats = [...new Set(['Uncategorized', ...predefined, ...user, ...fromMods])];
  const current = sel.value;
  sel.innerHTML = '<option value="">All categories</option>';
  const uncat = allCats.find((c) => c === 'Uncategorized');
  if (uncat) {
    const opt = document.createElement('option');
    opt.value = 'Uncategorized';
    opt.textContent = 'Uncategorized';
    sel.appendChild(opt);
  }
  for (const c of allCats.filter((x) => x !== 'Uncategorized').sort((a, b) => a.localeCompare(b))) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
  if (current && allCats.includes(current)) sel.value = current;
}

async function refreshModList() {
  const mods = await window.cp2077.listMods();
  const wrap = document.getElementById('mod-list-wrap');
  const listEl = document.getElementById('mod-list-by-tag');
  const hintEl = document.getElementById('mods-hint');
  const filtersBar = document.getElementById('mod-filters-bar');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (mods.length === 0) {
    hintEl.style.display = 'block';
    if (filtersBar) filtersBar.style.display = 'none';
    return;
  }
  hintEl.style.display = 'none';
  if (filtersBar) filtersBar.style.display = 'flex';

  await populateModFilterCategory(mods);

  const filters = {
    search: document.getElementById('mod-filter-search')?.value ?? '',
    status: document.getElementById('mod-filter-status')?.value ?? '',
    category: document.getElementById('mod-filter-category')?.value ?? '',
    source: document.getElementById('mod-filter-source')?.value ?? '',
  };
  const sortKey = document.getElementById('mod-sort')?.value ?? 'name-asc';

  const filtered = applyModFilters(mods, filters);
  lastRenderedMods = filtered;
  let groups = groupModsByCategory(filtered);
  groups = sortModsInGroups(groups, sortKey);

  for (const [tag, groupMods] of groups) {
    const cat = document.createElement('div');
    cat.className = 'mod-category';
    cat.innerHTML = `<div class="mod-category-header">${escapeHtml(tag)} (${groupMods.length})</div><ul class="mod-category-list"></ul>`;
    const ul = cat.querySelector('.mod-category-list');
    const withFamilies = buildModListWithFamilies(groupMods);
    for (const { mod, isAddOn, addOnCount } of withFamilies) {
      const displayName = mod.customName || mod.displayName || mod.id;
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      let rowClass = 'mod-row';
      if (isAddOn) rowClass += ' mod-row-addon';
      else if (addOnCount > 0) rowClass += ' mod-row-parent';
      if (selectedMod && selectedMod.id === mod.id) rowClass += ' selected';
      btn.className = rowClass;
      const groupBadge = mod.group ? `<span class="mod-row-group-badge" title="${escapeHtml(mod.group.name)}">${escapeHtml(mod.group.name)}</span>` : '';
      const addOnBadge = addOnCount > 0 ? ` <span class="mod-row-addon-badge" title="${addOnCount} additional file(s) from same mod">+${addOnCount}</span>` : '';
      const needsMeta = !isAddOn && modNeedsMetadata(mod);
      const warningIcon = needsMeta ? '<span class="mod-row-warning" title="Mod has empty fields – add description, category, tags, or images in Edit"></span>' : '';
      btn.innerHTML = `
        <input type="checkbox" class="mod-row-select-cb" data-mod-id="${escapeHtml(mod.id)}" title="Select for bulk actions (groups, delete, etc.)" aria-label="Select mod" ${selectedModIds.has(mod.id) ? 'checked' : ''} />
        <label class="mod-row-toggle" title="Enable/disable mod">
          <input type="checkbox" class="mod-row-toggle-input" ${mod.enabled ? 'checked' : ''} data-mod-id="${escapeHtml(mod.id)}" aria-label="Enable mod" />
          <span class="mod-row-toggle-track"><span class="mod-row-toggle-thumb"></span></span>
        </label>
        <span class="mod-row-name">${escapeHtml(displayName)}${addOnBadge}</span>
        ${groupBadge}
        ${warningIcon}
      `;
      const selectCb = btn.querySelector('.mod-row-select-cb');
      selectCb.addEventListener('change', (ev) => {
        ev.stopPropagation();
        if (selectCb.checked) selectedModIds.add(mod.id);
        else selectedModIds.delete(mod.id);
      });
      selectCb.addEventListener('click', (ev) => ev.stopPropagation());
      const toggleInput = btn.querySelector('.mod-row-toggle-input');
      const toggleLabel = btn.querySelector('.mod-row-toggle');
      toggleLabel.addEventListener('click', (ev) => ev.stopPropagation());
      toggleInput.addEventListener('change', (ev) => {
        ev.stopPropagation();
        withLoading(mod.enabled ? 'Disabling...' : 'Enabling...', async () => {
          if (mod.enabled) {
            const mods = await window.cp2077?.listMods?.() || [];
            const children = getChildrenOfMod(mod, mods);
            for (const c of children) {
              if (c.enabled) {
                const r = await window.cp2077.disableMod(c.id);
                if (!r.ok) { showToast(r.error || 'Failed to disable child.', 'error'); return; }
              }
            }
          }
          const result = mod.enabled
            ? await window.cp2077.disableMod(mod.id)
            : await window.cp2077.enableMod(mod.id);
          if (!result.ok) showToast(result.error || 'Failed to enable/disable mod.', 'error');
          else await refreshModList();
        })();
      });
      btn.addEventListener('click', (ev) => {
        if (ev.target === selectCb || ev.target === toggleInput || toggleLabel.contains(ev.target)) return;
        document.querySelectorAll('.mod-row').forEach((r) => r.classList.remove('selected'));
        btn.classList.add('selected');
        updateLeftPanelMod(mod);
      });
      btn.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        window.__contextMenuHandledByApp = true;
        showModContextMenu(mod, ev.clientX, ev.clientY);
      });
      li.appendChild(btn);
      ul.appendChild(li);
    }
    listEl.appendChild(cat);
  }
}

function bindModFilterListeners() {
  let searchDebounce = null;
  const scheduleRefresh = () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => refreshModList(), 200);
  };
  document.getElementById('mod-filter-search')?.addEventListener('input', scheduleRefresh);
  document.getElementById('mod-filter-search')?.addEventListener('search', scheduleRefresh);
  document.getElementById('mod-filter-status')?.addEventListener('change', () => refreshModList());
  document.getElementById('mod-filter-category')?.addEventListener('change', () => refreshModList());
  document.getElementById('mod-filter-source')?.addEventListener('change', () => refreshModList());
  document.getElementById('mod-sort')?.addEventListener('change', () => refreshModList());
}
bindModFilterListeners();

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

(function applyBrandingAssets() {
  // Use app-asset protocol so branding works in dev and packaged builds (assets live in app.asar.unpacked when packaged).
  const wordmarkPrimary = window.cp2077?.getAssetUrl('Wordmark-logo.png') ?? '../../assets/Wordmark-logo.png';
  const wordmarkFallback = window.cp2077?.getAssetUrl('Wordmark-logo.bmp') ?? '../../assets/Wordmark-logo.bmp';
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
  const bgNoiseUrl = window.cp2077?.getAssetUrl('Background-noise.bmp') ?? '../../assets/Background-noise.bmp';
  const appIconUrl = window.cp2077?.getAssetUrl('icon.png') ?? '../../assets/icon.png';
  document.documentElement.style.setProperty('--bg-noise-url', `url(${bgNoiseUrl})`);
  document.documentElement.style.setProperty('--app-icon-url', `url(${appIconUrl})`);
  // Background artwork - applied async after settings load (see withLoading below)
})();

async function applyBackgroundArtwork(enabled) {
  const el = document.getElementById('bg-artwork');
  if (!el) return;
  if (enabled) {
    const dataUrl = await window.cp2077.getBackgroundArtworkDataUrl();
    if (dataUrl) {
      el.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), url("${dataUrl}")`;
      el.removeAttribute('aria-hidden');
      document.body.classList.add('has-artwork');
      return;
    }
  }
  el.style.backgroundImage = '';
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-artwork');
}

withLoading('Loading game paths, mods, profiles, and settings...', async ({ updateProgress }) => {
  try {
    updateProgress({ step: 1, total: 6, currentTask: 'Loading settings and artwork…' });
    backgroundArtworkEnabled = (await window.cp2077?.getSetting('backgroundArtworkEnabled')) ?? true;
    await applyBackgroundArtwork(backgroundArtworkEnabled).catch((e) => console.warn('Background artwork load failed:', e));
    updateProgress({ step: 2, total: 6, currentTask: 'Detecting game path…' });
    let path = await window.cp2077?.getGamePath();
    if (!path) {
      const result = await window.cp2077?.detectGame();
      if (result && !result.ok) gameStatusState = { path: null, ok: false };
    }
    await refreshGameStatus();
    updateProgress({ step: 3, total: 6, currentTask: 'Loading mod list…' });
    await refreshDownloadFolder();
    await refreshModList();
    updateProgress({ step: 4, total: 6, currentTask: 'Loading load order and profiles…' });
    await refreshLoadOrder();
    await refreshProfiles();
    updateProgress({ step: 5, total: 6, currentTask: 'Checking for new mods…' });
    const downloadFolder = await window.cp2077?.getDownloadFolder();
    if (downloadFolder) await checkDownloadFolderAndPrompt({ updateProgress });
    updateProgress({ step: 6, total: 6, currentTask: 'Finalizing…' });
    await refreshAiButtonsVisibility();
  } catch (e) {
    console.error('Initial load failed:', e);
    showToast(e?.message || 'Failed to load app data. Check the console for details.', 'error');
  }
})();

document.getElementById('mod-edit-ai-generate')?.addEventListener('click', withLoading('Generating with AI...', async () => {
  if (!modEditCurrentMod || !window.cp2077?.aiGenerateDescription) return;
  const mod = modEditCurrentMod;
  const topPaths = [...new Set((mod.files || []).map((f) => String(f).replace(/\\/g, '/').split('/')[0]).filter(Boolean))];
  const modContext = {
    id: mod.id,
    name: modEditNameEl?.value?.trim() || mod.customName || mod.displayName || mod.id,
    type: mod.type,
    sourceArchive: mod.sourceArchiveName || '',
    category: modEditCategoryEl?.value || mod.customCategory || '',
    tags: (mod.customTags || []).join(', '),
    description: modEditDescriptionEl?.value?.trim() || mod.customDescription || '',
    topPaths,
  };
  const result = await window.cp2077.aiGenerateDescription(modContext);
  if (!result.ok) {
    showToast(result.error || 'AI generation failed.', 'error');
    return;
  }
  const { description, category, tags } = result.data;
  if (description) {
    modEditDescriptionEl.value = description;
    autoResizeDescriptionTextarea();
  }
  if (category) {
    await populateCategoryDropdown(category);
    modEditCategoryEl.value = category;
  }
  if (tags?.length) renderTagPills(tags);
}));

document.getElementById('mod-edit-save').addEventListener('click', async () => {
  if (!modEditCurrentMod) return;
  const customName = modEditNameEl.value.trim();
  const description = modEditDescriptionEl.value.trim();
  const categoryRaw = modEditCategoryEl?.value || '';
  const category = categoryRaw === '__add_category__' ? '' : categoryRaw;
  const tags = getEditFormTags();
  const images = getEditFormImages();
  const parentRaw = document.getElementById('mod-edit-parent-mod')?.value?.trim() || '';
  const parentModId = parentRaw || undefined;
  const childAddonName = parentModId ? (document.getElementById('mod-edit-child-addon-name')?.value?.trim() || undefined) : undefined;
  const childAddonDescription = parentModId ? (document.getElementById('mod-edit-child-addon-desc')?.value?.trim() || undefined) : undefined;
  const saveData = {
    customName: customName || undefined,
    description: description || undefined,
    category: category || undefined,
    tags: tags.length ? tags : undefined,
    images: images.length ? images : undefined,
    nexusModId: modEditNexusLookupData?.nexusModId ?? modEditCurrentMod?.nexusModId,
    nexusUrl: modEditNexusLookupData?.nexusUrl ?? modEditCurrentMod?.nexusUrl,
    parentModId,
    childAddonName,
    childAddonDescription,
  };
  if (saveData.nexusModId == null) delete saveData.nexusModId;
  if (!saveData.nexusUrl) delete saveData.nexusUrl;
  await window.cp2077.setModCustomization(modEditCurrentMod.id, saveData);
  hideModEditModal();
  await refreshModList();
});

document.getElementById('mod-edit-cancel').addEventListener('click', () => hideModEditModal());
document.getElementById('mod-edit-close').addEventListener('click', () => hideModEditModal());

(function initModEditNexusSearchInput() {
  const searchInput = document.getElementById('mod-edit-nexus-search-input');
  let debounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (modEditWebviewEl) {
          modEditWebviewEl.src = buildNexusSearchUrl(searchInput.value);
        }
      }, 350);
    });
  }
})();

async function performNexusLookupByModId(rawId) {
  if (!modEditCurrentMod) return;
  const hasKey = await window.cp2077?.nexusHasKey?.();
  if (!hasKey) {
    showToast('Set your Nexus API key in Options first.', 'error');
    return;
  }
  const res = await window.cp2077?.nexusGetMod?.(rawId);
  if (!res?.ok || !res.data) {
    showToast(res?.error || 'Mod not found.', 'error');
    return;
  }
  const m = res.data;
  const modIdNum = m.mod_id ?? m.id ?? rawId;
  modEditNexusLookupData = {
    nexusModId: modIdNum,
    nexusUrl: `https://www.nexusmods.com/cyberpunk2077/mods/${modIdNum}`,
  };
  if (modEditNameEl) modEditNameEl.value = m.name ?? m.mod_name ?? modEditNameEl.value;
  if (modEditDescriptionEl) {
    modEditDescriptionEl.value = htmlToPlainText(m.summary ?? m.description ?? '');
    autoResizeDescriptionTextarea();
  }
  const cats = m.categories ?? m.category ?? [];
  const catNames = Array.isArray(cats) ? cats.map((c) => c?.name ?? c).filter(Boolean) : [];
  if (catNames.length && modEditCategoryEl) {
    const first = catNames[0];
    if ([...modEditCategoryEl.options].some((o) => o.value === first)) {
      modEditCategoryEl.value = first;
    }
  }
  const tagList = m.tags ?? m.tag_names ?? [];
  const tagArr = Array.isArray(tagList) ? tagList.map((t) => (typeof t === 'string' ? t : t?.name ?? t)).filter(Boolean) : [];
  if (tagArr.length) {
    const existing = getEditFormTags();
    const merged = [...new Set([...existing, ...tagArr])];
    renderTagPills(merged);
  }
  const thumb = m.picture_url ?? m.thumbnail ?? m.image ?? '';
  if (thumb && modEditCurrentMod) {
    try {
      await window.cp2077?.addModImageFromUrl?.(modEditCurrentMod.id, thumb);
      const cust = await window.cp2077?.getModCustomization?.(modEditCurrentMod.id);
      renderImageThumbs(modEditCurrentMod.id, cust?.images ?? []);
    } catch (_) {}
  }
  showToast('Details filled from Nexus.', 'success');
}

document.getElementById('mod-edit-nexus-lookup-btn')?.addEventListener('click', withLoading('Looking up on Nexus…', async () => {
  if (!modEditCurrentMod) return;
  const input = document.getElementById('mod-edit-nexus-id');
  const rawId = input?.value?.trim();
  if (!rawId) {
    showToast('Enter a Nexus Mod ID (e.g. 3850).', 'error');
    return;
  }
  await performNexusLookupByModId(rawId);
}));

document.getElementById('mod-edit-use-current-page')?.addEventListener('click', withLoading('Looking up on Nexus…', async () => {
  if (!modEditCurrentMod) return;
  const url = modEditWebviewEl?.src || '';
  const match = url.match(/nexusmods\.com\/cyberpunk2077\/mods\/(\d+)/i);
  const rawId = match ? match[1] : null;
  if (!rawId) {
    showToast('Open a Cyberpunk 2077 mod page in the browser first (e.g. nexusmods.com/cyberpunk2077/mods/...).', 'error');
    return;
  }
  const input = document.getElementById('mod-edit-nexus-id');
  if (input) input.value = rawId;
  await performNexusLookupByModId(rawId);
}));

modEditCategoryEl?.addEventListener('change', async () => {
  if (modEditCategoryEl.value !== '__add_category__') return;
  const name = prompt('New category name:');
  if (!name || !name.trim()) {
    modEditCategoryEl.value = modEditCurrentMod?.customCategory || '';
    return;
  }
  await window.cp2077.addCategory(name.trim());
  await populateCategoryDropdown(name.trim());
  modEditCategoryEl.value = name.trim();
});

document.getElementById('mod-edit-name-paste').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    modEditNameEl.value = text;
  } catch (_) {}
});

modEditDescriptionEl?.addEventListener('input', () => autoResizeDescriptionTextarea());
document.getElementById('mod-edit-description-paste').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    modEditDescriptionEl.value = (modEditDescriptionEl.value ? modEditDescriptionEl.value + '\n\n' : '') + text;
    autoResizeDescriptionTextarea();
  } catch (_) {}
});

modEditTagInputEl.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    const tag = modEditTagInputEl.value.trim();
    if (tag && !getEditFormTags().includes(tag)) {
      const pill = document.createElement('span');
      pill.className = 'mod-edit-tag-pill';
      pill.dataset.tag = tag;
      pill.textContent = tag;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mod-edit-tag-remove';
      remove.textContent = '×';
      remove.addEventListener('click', () => pill.remove());
      pill.appendChild(remove);
      modEditTagsContainerEl.appendChild(pill);
      modEditTagInputEl.value = '';
    }
  }
});

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function isImageFile(file) {
  const name = (file.name || file.path || '').toLowerCase();
  return IMAGE_EXTENSIONS.has(name.slice(name.lastIndexOf('.')));
}

async function handleImagesDrop(ev) {
  ev.preventDefault();
  modEditImagesDropzoneEl?.classList.remove('mod-edit-images-drag-over');
  if (!modEditCurrentMod) return;
  const files = Array.from(ev.dataTransfer?.files || []);
  const imagePaths = files.filter(isImageFile).map((f) => f.path || f.name).filter(Boolean);
  const currentImages = getEditFormImages();
  let added = 0;
  for (const filePath of imagePaths) {
    if (currentImages.length + added >= 3) break;
    const result = await window.cp2077.addModImageFromPath(modEditCurrentMod.id, filePath);
    if (result.ok) {
      currentImages.push(result.filename);
      added += 1;
    }
  }
  if (currentImages.length + added < 3) {
    const uriList = ev.dataTransfer?.getData('text/uri-list') || '';
    const plainText = ev.dataTransfer?.getData('text/plain') || '';
    const candidates = [...uriList.split('\n'), plainText]
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s));
    const imageUrl = candidates.find((u) => /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(u)) || candidates[0];
    if (imageUrl) {
      const result = await window.cp2077.addModImageFromUrl(modEditCurrentMod.id, imageUrl);
      if (result.ok) {
        currentImages.push(result.filename);
        added += 1;
      } else if (added === 0) {
        showToast(result.error || 'Could not add dropped image URL.', 'error');
      }
    }
  }
  if (added > 0) {
    renderImageThumbs(modEditCurrentMod.id, currentImages);
  }
}

modEditImagesDropzoneEl?.addEventListener('dragover', (ev) => {
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'copy';
  modEditImagesDropzoneEl.classList.add('mod-edit-images-drag-over');
});
modEditImagesDropzoneEl?.addEventListener('dragleave', (ev) => {
  if (!modEditImagesDropzoneEl.contains(ev.relatedTarget)) {
    modEditImagesDropzoneEl.classList.remove('mod-edit-images-drag-over');
  }
});
modEditImagesDropzoneEl?.addEventListener('drop', handleImagesDrop);

document.getElementById('mod-edit-add-image').addEventListener('click', withLoading('Adding image...', async () => {
  if (!modEditCurrentMod) return;
  const currentImages = getEditFormImages();
  if (currentImages.length >= 3) {
    showToast('Maximum 3 images per mod.', 'error');
    return;
  }
  const result = await window.cp2077.selectModImage(modEditCurrentMod.id);
  if (result.canceled) return;
  if (!result.ok) {
    showToast(result.error || 'Failed to add image.', 'error');
    return;
  }
  const images = [...currentImages, result.filename];
  renderImageThumbs(modEditCurrentMod.id, images);
}));

window.addEventListener('mod-edit-set-field', (e) => {
  const { field, value } = e.detail || {};
  if (!value || !modEditCurrentMod) return;
  if (!modEditModalEl?.classList.contains('visible')) return;
  if (field === 'title' && modEditNameEl) {
    modEditNameEl.value = value;
    showToast('Title updated.', 'success');
  } else if (field === 'description' && modEditDescriptionEl) {
    modEditDescriptionEl.value = modEditDescriptionEl.value ? modEditDescriptionEl.value + '\n\n' + value : value;
    autoResizeDescriptionTextarea();
    showToast('Description updated.', 'success');
  } else if (field === 'tags' && modEditTagsContainerEl) {
    const existing = getEditFormTags();
    const toAdd = value.split(/\s+/).map((t) => t.trim()).filter((t) => t && !existing.includes(t));
    for (const tag of toAdd) {
      const pill = document.createElement('span');
      pill.className = 'mod-edit-tag-pill';
      pill.dataset.tag = tag;
      pill.textContent = tag;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mod-edit-tag-remove';
      remove.textContent = '×';
      remove.addEventListener('click', () => pill.remove());
      pill.appendChild(remove);
      modEditTagsContainerEl.appendChild(pill);
      existing.push(tag);
    }
    if (toAdd.length) showToast('Tag(s) added.', 'success');
  }
});

window.addEventListener('mod-edit-add-image-from-url', async (e) => {
  const { url } = e.detail || {};
  if (!url || !modEditCurrentMod) return;
  if (!modEditModalEl?.classList.contains('visible')) return;
  const currentImages = getEditFormImages();
  if (currentImages.length >= 3) {
    showToast('Maximum 3 images per mod.', 'error');
    return;
  }
  const result = await window.cp2077.addModImageFromUrl(modEditCurrentMod.id, url);
  if (!result.ok) {
    showToast(result.error || 'Failed to add image.', 'error');
    return;
  }
  const images = [...currentImages, result.filename];
  renderImageThumbs(modEditCurrentMod.id, images);
  showToast('Image added.', 'success');
});

document.getElementById('mod-edit-add-image-by-link').addEventListener('click', withLoading('Adding image from link...', async () => {
  if (!modEditCurrentMod) return;
  const currentImages = getEditFormImages();
  if (currentImages.length >= 3) {
    showToast('Maximum 3 images per mod.', 'error');
    return;
  }
  const url = prompt('Enter image URL:');
  if (!url || !url.trim()) return;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    showToast('Please enter a valid http or https URL.', 'error');
    return;
  }
  const result = await window.cp2077.addModImageFromUrl(modEditCurrentMod.id, trimmed);
  if (!result.ok) {
    showToast(result.error || 'Failed to add image from link.', 'error');
    return;
  }
  const images = [...currentImages, result.filename];
  renderImageThumbs(modEditCurrentMod.id, images);
}));

modEditModalEl.addEventListener('click', (ev) => {
  if (ev.target === modEditModalEl) hideModEditModal();
});

document.addEventListener('click', () => hideModContextMenu());
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    const confirmModal = document.getElementById('confirm-modal');
    if (confirmModal?.classList.contains('visible')) {
      document.getElementById('confirm-cancel')?.click();
      return;
    }
    hideModContextMenu();
    hideDepsReport();
    hideModFilesModal();
    hideModEditModal();
    hideConflictModal();
    hideGroupsModal();
    hideAiBatchCategorizeModal();
    hideAiTroubleshootModal();
    return;
  }
  if (ev.ctrlKey && ev.shiftKey && currentPage === 'mods') {
    const inInput = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName) || ev.target?.isContentEditable;
    if (inInput) return;
    if (ev.key === 'C') {
      ev.preventDefault();
      document.getElementById('btn-ai-batch-categorize')?.click();
    } else if (ev.key === 'T') {
      ev.preventDefault();
      document.getElementById('btn-ai-troubleshoot')?.click();
    }
  }
});
depsReportCloseBtn.addEventListener('click', () => hideDepsReport());
depsReportModalEl.addEventListener('click', (ev) => {
  if (ev.target === depsReportModalEl) hideDepsReport();
});

if (installResultCloseBtn) installResultCloseBtn.addEventListener('click', () => hideInstallResult());
if (installResultModalEl) installResultModalEl.addEventListener('click', (ev) => {
  if (ev.target === installResultModalEl) hideInstallResult();
});

modFilesCloseBtn.addEventListener('click', () => hideModFilesModal());
modFilesModalEl.addEventListener('click', (ev) => {
  if (ev.target === modFilesModalEl) hideModFilesModal();
});

document.getElementById('conflict-modal-close')?.addEventListener('click', () => hideConflictModal());
conflictModalEl?.addEventListener('click', (ev) => {
  if (ev.target === conflictModalEl) hideConflictModal();
});
