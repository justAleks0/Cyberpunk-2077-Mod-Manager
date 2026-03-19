const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const PROFILES_FILENAME = 'profiles.json';

function getProfilesPath() {
  return path.join(app.getPath('userData'), PROFILES_FILENAME);
}

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 * @property {string[]} enabledModIds
 * @property {string[]} archiveLoadOrder
 * @property {number} updatedAt
 */

/**
 * @returns {{ profiles: Profile[], currentProfileId: string|null }}
 */
function loadProfilesState() {
  const filePath = getProfilesPath();
  try {
    if (!fs.existsSync(filePath)) {
      return { profiles: [], currentProfileId: null };
    }
    const data = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(data);
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      currentProfileId: parsed.currentProfileId ?? null,
    };
  } catch (err) {
    console.error('Failed to load profiles', err);
    return { profiles: [], currentProfileId: null };
  }
}

function saveProfilesState(state) {
  const filePath = getProfilesPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

function ensureDefaultProfile(modRecords, archiveLoadOrder) {
  const state = loadProfilesState();
  if (state.profiles.length > 0) return state;

  const now = Date.now();
  const defaultProfile = {
    id: `default-${now}`,
    name: 'Default',
    enabledModIds: modRecords.filter((m) => m.enabled).map((m) => m.id),
    archiveLoadOrder: Array.isArray(archiveLoadOrder) ? archiveLoadOrder : [],
    updatedAt: now,
  };
  const next = { profiles: [defaultProfile], currentProfileId: defaultProfile.id };
  saveProfilesState(next);
  return next;
}

function listProfiles() {
  return loadProfilesState();
}

function createProfile(name, modRecords, archiveLoadOrder) {
  const state = loadProfilesState();
  const now = Date.now();
  const profile = {
    id: `${name.replace(/\s+/g, '-').toLowerCase()}-${now}`,
    name,
    enabledModIds: modRecords.filter((m) => m.enabled).map((m) => m.id),
    archiveLoadOrder: Array.isArray(archiveLoadOrder) ? archiveLoadOrder : [],
    updatedAt: now,
  };
  state.profiles.push(profile);
  state.currentProfileId = profile.id;
  saveProfilesState(state);
  return profile;
}

function saveCurrentProfile(profileId, modRecords, archiveLoadOrder) {
  const state = loadProfilesState();
  const idx = state.profiles.findIndex((p) => p.id === profileId);
  if (idx === -1) return { ok: false, error: 'Profile not found' };
  state.profiles[idx] = {
    ...state.profiles[idx],
    enabledModIds: modRecords.filter((m) => m.enabled).map((m) => m.id),
    archiveLoadOrder: Array.isArray(archiveLoadOrder) ? archiveLoadOrder : [],
    updatedAt: Date.now(),
  };
  state.currentProfileId = profileId;
  saveProfilesState(state);
  return { ok: true, profile: state.profiles[idx] };
}

function setCurrentProfile(profileId) {
  const state = loadProfilesState();
  if (!state.profiles.some((p) => p.id === profileId)) {
    return { ok: false, error: 'Profile not found' };
  }
  state.currentProfileId = profileId;
  saveProfilesState(state);
  return { ok: true };
}

function deleteProfile(profileId) {
  const state = loadProfilesState();
  state.profiles = state.profiles.filter((p) => p.id !== profileId);
  if (state.currentProfileId === profileId) {
    state.currentProfileId = state.profiles[0]?.id ?? null;
  }
  saveProfilesState(state);
  return { ok: true };
}

module.exports = {
  loadProfilesState,
  saveProfilesState,
  ensureDefaultProfile,
  listProfiles,
  createProfile,
  saveCurrentProfile,
  setCurrentProfile,
  deleteProfile,
};

