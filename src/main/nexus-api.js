/**
 * Nexus Mods Public API integration.
 * Requires user's personal API key (Options). Rate-limited: 2500/day, then 100/hour.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const Store = require('electron-store');

const BASE_URL = 'https://api.nexusmods.com';
const GAME_DOMAIN = 'cyberpunk2077';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const store = new Store({ name: 'cp2077-mod-manager' });

// Simple in-memory cache for browse/mod responses
const cache = new Map();

function getApiKey() {
  return store.get('nexusApiKey') || '';
}

function setApiKey(key) {
  store.set('nexusApiKey', (key || '').trim());
}

function hasApiKey() {
  return !!getApiKey();
}

function buildUserAgent() {
  const appVersion = '2.0.0';
  const osInfo = `${process.platform} ${process.arch}`;
  const electronVersion = process.versions?.electron || 'unknown';
  return `CP2077ModManager/${appVersion} (${osInfo}) Electron/${electronVersion}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

/**
 * Make a GET request to the Nexus API.
 * @param {string} path - API path (e.g. /v1/users/validate.json)
 * @returns {Promise<{ ok: boolean, data?: any, error?: string, rateLimit?: object }>}
 */
function request(path, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) return Promise.resolve({ ok: false, error: 'Nexus API key not set.' });

  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const parsed = new URL(url);

  const headers = {
    apikey: apiKey,
    'User-Agent': buildUserAgent(),
    Accept: 'application/json',
  };
  const body = options.body;
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  const reqOpts = {
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method: options.method || 'GET',
    headers,
  };

  return new Promise((resolve) => {
    const req = https.request(reqOpts, (res) => {
      const rateLimit = {
        hourlyRemaining: res.headers['x-rl-hourly-remaining'],
        hourlyReset: res.headers['x-rl-hourly-reset'],
        dailyRemaining: res.headers['x-rl-daily-remaining'],
        dailyReset: res.headers['x-rl-daily-reset'],
      };

      let body = '';
      res.on('data', (ch) => { body += ch; });
      res.on('end', () => {
        if (res.statusCode === 429) {
          resolve({
            ok: false,
            error: 'Rate limit exceeded. Try again later.',
            rateLimit,
          });
          return;
        }

        let data = null;
        try {
          if (body) data = JSON.parse(body);
        } catch (_) {}

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, data, rateLimit });
        } else {
          const errMsg = data?.message || data?.error || `HTTP ${res.statusCode}`;
          resolve({ ok: false, error: errMsg, rateLimit });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message || 'Network error' });
    });

    if (body) req.write(body);
    req.end();
  });
}

/**
 * POST request with form data.
 */
function postForm(path, formData) {
  const apiKey = getApiKey();
  if (!apiKey) return Promise.resolve({ ok: false, error: 'Nexus API key not set.' });

  const parsed = new URL(path.startsWith('http') ? path : BASE_URL + path);
  const body = typeof formData === 'string' ? formData : new URLSearchParams(formData).toString();

  const reqOpts = {
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method: 'POST',
    headers: {
      apikey: apiKey,
      'User-Agent': buildUserAgent(),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve) => {
    const req = https.request(reqOpts, (res) => {
      const rateLimit = {
        hourlyRemaining: res.headers['x-rl-hourly-remaining'],
        hourlyReset: res.headers['x-rl-hourly-reset'],
        dailyRemaining: res.headers['x-rl-daily-remaining'],
        dailyReset: res.headers['x-rl-daily-reset'],
      };
      let bodyStr = '';
      res.on('data', (ch) => { bodyStr += ch; });
      res.on('end', () => {
        let data = null;
        try {
          if (bodyStr) data = JSON.parse(bodyStr);
        } catch (_) {}
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, data, rateLimit });
        } else {
          resolve({
            ok: false,
            error: data?.message || data?.error || `HTTP ${res.statusCode}`,
            rateLimit,
          });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message || 'Network error' }));
    req.write(body);
    req.end();
  });
}

/**
 * Validate API key. Does not count toward rate limit.
 */
async function validate() {
  const res = await request('/v1/users/validate.json');
  if (res.ok && res.data) {
    return { ok: true, user: res.data };
  }
  return { ok: false, error: res.error || 'Invalid API key' };
}

/**
 * Get 10 latest added mods.
 */
async function getLatestAdded() {
  const cacheKey = 'latest_added';
  const cached = getCached(cacheKey);
  if (cached) return { ok: true, data: cached };

  const res = await request(`/v1/games/${GAME_DOMAIN}/mods/latest_added.json`);
  if (res.ok && res.data) {
    setCached(cacheKey, res.data);
    return { ok: true, data: res.data, rateLimit: res.rateLimit };
  }
  return res;
}

/**
 * Get 10 latest updated mods.
 */
async function getLatestUpdated() {
  const cacheKey = 'latest_updated';
  const cached = getCached(cacheKey);
  if (cached) return { ok: true, data: cached };

  const res = await request(`/v1/games/${GAME_DOMAIN}/mods/latest_updated.json`);
  if (res.ok && res.data) {
    setCached(cacheKey, res.data);
    return { ok: true, data: res.data, rateLimit: res.rateLimit };
  }
  return res;
}

/**
 * Get 10 trending mods.
 */
async function getTrending() {
  const cacheKey = 'trending';
  const cached = getCached(cacheKey);
  if (cached) return { ok: true, data: cached };

  const res = await request(`/v1/games/${GAME_DOMAIN}/mods/trending.json`);
  if (res.ok && res.data) {
    setCached(cacheKey, res.data);
    return { ok: true, data: res.data, rateLimit: res.rateLimit };
  }
  return res;
}

/**
 * Get mods updated in period. period: '1d' | '1w' | '1m'
 */
async function getUpdated(period) {
  const valid = ['1d', '1w', '1m'];
  const p = valid.includes(period) ? period : '1w';
  const cacheKey = `updated_${p}`;
  const cached = getCached(cacheKey);
  if (cached) return { ok: true, data: cached };

  const res = await request(`/v1/games/${GAME_DOMAIN}/mods/updated.json?period=${p}`);
  if (res.ok && res.data) {
    setCached(cacheKey, res.data);
    return { ok: true, data: res.data, rateLimit: res.rateLimit };
  }
  return res;
}

/**
 * Get single mod details.
 */
async function getMod(modId) {
  const id = Number(modId);
  if (!id) return { ok: false, error: 'Invalid mod ID' };

  const cacheKey = `mod_${id}`;
  const cached = getCached(cacheKey);
  if (cached) return { ok: true, data: cached };

  const res = await request(`/v1/games/${GAME_DOMAIN}/mods/${id}.json`);
  if (res.ok && res.data) {
    setCached(cacheKey, res.data);
    return { ok: true, data: res.data, rateLimit: res.rateLimit };
  }
  return res;
}

/**
 * List files for a mod. category: main, update, optional, old_version, miscellaneous (optional)
 */
async function getFiles(modId, category) {
  const id = Number(modId);
  if (!id) return { ok: false, error: 'Invalid mod ID' };

  let path = `/v1/games/${GAME_DOMAIN}/mods/${id}/files.json`;
  if (category) path += `?category=${encodeURIComponent(category)}`;
  return request(path);
}

/**
 * Get file details.
 */
async function getFile(modId, fileId) {
  const mid = Number(modId);
  const fid = Number(fileId);
  if (!mid || !fid) return { ok: false, error: 'Invalid mod or file ID' };
  return request(`/v1/games/${GAME_DOMAIN}/mods/${mid}/files/${fid}.json`);
}

/**
 * Generate download link. Premium: omit key/expires. Non-premium: must provide key and expires from nxm link.
 */
async function getDownloadLink(modId, fileId, key, expires) {
  const mid = Number(modId);
  const fid = Number(fileId);
  if (!mid || !fid) return { ok: false, error: 'Invalid mod or file ID' };

  let path = `/v1/games/${GAME_DOMAIN}/mods/${mid}/files/${fid}/download_link.json`;
  if (key && expires) path += `?key=${encodeURIComponent(key)}&expires=${encodeURIComponent(expires)}`;
  return request(path);
}

/**
 * Endorse a mod. version from mod response.
 */
async function endorse(modId, version) {
  const id = Number(modId);
  if (!id) return { ok: false, error: 'Invalid mod ID' };
  const body = version ? `version=${encodeURIComponent(version)}` : '';
  return postForm(`/v1/games/${GAME_DOMAIN}/mods/${id}/endorse.json`, body);
}

/**
 * Abstain from endorsing.
 */
async function abstain(modId, version) {
  const id = Number(modId);
  if (!id) return { ok: false, error: 'Invalid mod ID' };
  const body = version ? `version=${encodeURIComponent(version)}` : '';
  return postForm(`/v1/games/${GAME_DOMAIN}/mods/${id}/abstain.json`, body);
}

/**
 * Track a mod.
 */
async function track(modId) {
  const id = Number(modId);
  if (!id) return { ok: false, error: 'Invalid mod ID' };
  return postForm(`/v1/user/tracked_mods.json?domain_name=${GAME_DOMAIN}`, `mod_id=${id}`);
}

/**
 * Untrack a mod.
 */
async function untrack(modId) {
  const id = Number(modId);
  if (!id) return { ok: false, error: 'Invalid mod ID' };
  return request(`/v1/user/tracked_mods.json?domain_name=${GAME_DOMAIN}`, {
    method: 'DELETE',
    body: `mod_id=${id}`,
  });
}

/**
 * Get tracked mods.
 */
async function getTrackedMods() {
  return request('/v1/user/tracked_mods.json');
}

/**
 * Get user endorsements.
 */
async function getEndorsements() {
  return request('/v1/user/endorsements.json');
}

/**
 * Get changelogs for a mod.
 */
async function getChangelogs(modId) {
  const id = Number(modId);
  if (!id) return { ok: false, error: 'Invalid mod ID' };
  return request(`/v1/games/${GAME_DOMAIN}/mods/${id}/changelogs.json`);
}

/**
 * Search by MD5 hash.
 */
async function md5Search(md5Hash) {
  if (!md5Hash || typeof md5Hash !== 'string') return { ok: false, error: 'Invalid MD5 hash' };
  const hash = md5Hash.trim().toLowerCase();
  return request(`/v1/games/${GAME_DOMAIN}/mods/md5_search/${hash}.json`);
}

/**
 * Clear cache (e.g. after key change).
 */
function clearCache() {
  cache.clear();
}

/**
 * Download file from URL to temp path.
 * @param {Function} [onProgress] - Optional callback(received, total) for progress. total may be 0 if unknown.
 */
function downloadToTemp(url, filename, onProgress) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const tempPath = path.join(os.tmpdir(), filename || `nexus-dl-${Date.now()}`);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': buildUserAgent(),
        Referer: 'https://www.nexusmods.com/',
      },
    };
    const client = parsed.protocol === 'https:' ? https : require('http');
    const req = client.get(opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadToTemp(new URL(res.headers.location, url).toString(), filename, onProgress).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'], 10) || 0;
      let received = 0;
      let lastPct = -1;
      let lastReport = 0;
      const reportProgress = () => {
        if (!onProgress) return;
        const pct = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0;
        const now = Date.now();
        const pctChanged = pct !== lastPct;
        const throttled = now - lastReport < 100;
        if ((pctChanged || received === 0) && !throttled) {
          lastPct = pct;
          lastReport = now;
          onProgress(received, total);
        }
      };
      res.on('data', (chunk) => {
        received += chunk.length;
        reportProgress();
      });
      const out = fs.createWriteStream(tempPath);
      res.pipe(out);
      out.on('finish', () => {
        if (onProgress && total > 0) onProgress(total, total);
        out.close(() => resolve(tempPath));
      });
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

function extractDownloadUrl(data) {
  if (!data) return null;
  if (typeof data === 'string') return data;
  const uri = data.URI ?? data.uri ?? data.url ?? data.link;
  if (uri) return uri;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    return first?.URI ?? first?.uri ?? first?.url ?? first?.link ?? extractDownloadUrl(first);
  }
  if (data.uuid && data.file_id) {
    return `https://nexus-mod-downloads.s3.amazonaws.com/${data.uuid}/${data.file_id}`;
  }
  return null;
}

/**
 * Install mod from Nexus: get download link, download, install.
 * Premium: omit key/expires. Non-premium: must provide key and expires from nxm link.
 * @param {Function} [onProgress] - Optional callback(received, total) for download progress.
 */
async function installFromNexus(modId, fileId, gameRoot, key, expires, onProgress) {
  const res = await getDownloadLink(modId, fileId, key, expires);
  if (!res.ok) {
    if (res.error && (res.error.includes('403') || res.error.toLowerCase().includes('premium') || res.error.toLowerCase().includes('permission'))) {
      return {
        ok: false,
        error: 'Nexus Premium required for direct downloads. Open the mod on Nexus to download manually.',
        premiumRequired: true,
      };
    }
    return { ok: false, error: res.error || 'Failed to get download link' };
  }

  const url = extractDownloadUrl(res.data);
  if (!url) {
    return { ok: false, error: 'Could not parse download URL from API response' };
  }

  let tempPath = null;
  try {
    const modRes = await getMod(modId);
    const mod = modRes?.ok && modRes.data ? modRes.data : null;
    const modName = mod ? (mod.name ?? mod.mod_name ?? `mod-${modId}`) : `mod-${modId}`;
    const ext = path.extname(url) || '.zip';
    const safeName = `${modName.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80)}-${modId}-${fileId}${ext}`;
    tempPath = await downloadToTemp(url, safeName, onProgress);

    const { installFromArchive } = require('./install');
    const result = await installFromArchive(tempPath, gameRoot, safeName);
    try {
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_) {}
    if (!result.ok) return result;

    const nexusMetadata = mod ? {
      name: mod.name ?? mod.mod_name ?? modName,
      description: mod.summary ?? mod.description ?? '',
      nexusModId: mod.mod_id ?? mod.id ?? modId,
      nexusUrl: `https://www.nexusmods.com/cyberpunk2077/mods/${mod.mod_id ?? mod.id ?? modId}`,
      imageUrls: [],
    } : null;
    if (nexusMetadata) {
      const thumb = mod.picture_url ?? mod.thumbnail ?? mod.image ?? '';
      if (thumb) nexusMetadata.imageUrls.push(thumb);
      const gallery = mod.images ?? mod.gallery ?? [];
      if (Array.isArray(gallery)) {
        for (const img of gallery) {
          const u = typeof img === 'string' ? img : (img?.url ?? img?.uri ?? img?.thumbnail);
          if (u && !nexusMetadata.imageUrls.includes(u)) nexusMetadata.imageUrls.push(u);
        }
      }
      nexusMetadata.imageUrls = nexusMetadata.imageUrls.slice(0, 3);
    }
    return { ...result, nexusMetadata };
  } catch (err) {
    try {
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_) {}
    return { ok: false, error: err.message || 'Download or install failed' };
  }
}

module.exports = {
  getApiKey,
  setApiKey,
  hasApiKey,
  validate,
  getLatestAdded,
  getLatestUpdated,
  getTrending,
  getUpdated,
  getMod,
  getFiles,
  getFile,
  getDownloadLink,
  endorse,
  abstain,
  track,
  untrack,
  getTrackedMods,
  getEndorsements,
  getChangelogs,
  md5Search,
  clearCache,
  installFromNexus,
  request,
};
