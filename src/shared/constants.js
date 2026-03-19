/**
 * Shared constants for Cyberpunk 2077 Mod Manager.
 * Paths are relative to game root unless stated otherwise.
 */

// Steam library layout (e.g. D:\SteamLibrary\steamapps\common\Cyberpunk 2077)
// typically contains REDprelauncher.exe.
const GAME_LAUNCHER_EXE = 'REDprelauncher.exe';

// Fallback for older installs or unusual setups.
const GAME_FALLBACK_EXE = 'Cyberpunk2077.exe';

/** Top-level folder names under game root that mods merge into */
const GAME_ROOT_FOLDERS = ['archive', 'bin', 'r6', 'red4ext', 'mods'];

/** Default locations to check for game (Windows) */
const DEFAULT_GAME_PATHS = {
  steam: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Cyberpunk 2077',
  gog: 'C:\\Program Files\\GOG Galaxy\\Games\\Cyberpunk 2077',
  epic: 'C:\\Program Files (x86)\\Epic Games\\Cyberpunk2077',
  steamLibraryCommon: 'C:\\SteamLibrary\\steamapps\\common\\Cyberpunk 2077',
};

/** Mod roots relative to game root */
const MOD_PATHS = {
  archive: 'archive/pc/mod',
  archiveDisabled: 'archive/pc/mod_disabled',
  cetMods: 'bin/x64/plugins/cyber_engine_tweaks/mods',
  cetModsDisabled: 'bin/x64/plugins/cyber_engine_tweaks/mods_disabled',
  red4ext: 'red4ext/plugins',
  red4extDisabled: 'red4ext/plugins_disabled',
  r6Scripts: 'r6/scripts',
  r6Tweaks: 'r6/tweaks',
  mods: 'mods',
  modsDisabled: 'mods_disabled',
};

/** Supported archive extensions for mod install */
const ARCHIVE_EXTENSIONS = ['.zip', '.7z', '.rar'];

/** Load order file for archive mods */
const MODLIST_FILE = 'archive/pc/mod/modlist.txt';

module.exports = {
  GAME_LAUNCHER_EXE,
  GAME_FALLBACK_EXE,
  GAME_ROOT_FOLDERS,
  DEFAULT_GAME_PATHS,
  MOD_PATHS,
  ARCHIVE_EXTENSIONS,
  MODLIST_FILE,
};
