# Cyberpunk 2077 Mod Manager

A desktop mod manager for Cyberpunk 2077. Install, enable/disable, and manage load order for mods (archive, REDmod, and more).

## Features

- **Game detection** — Auto-detect game path (Steam, GOG, Epic) or select manually.
- **Install from file** — Install mods from .zip archives (merge into game root with file tracking).
- **Foundational mods** — One-click install of bundled framework mods (CET, RED4ext, redscript, TweakXL, ArchiveXL, etc.) from the `Foundational Mods` folder.
- **Mods download folder** — Set a folder for dropping archives; on launch or "Check mods install folder" you’re prompted to install new mods (only those not already installed).
- **Enable/disable** — Toggle mods on/off; the app tracks which files belong to each mod and moves them to a stash when disabled.
- **Load order** — View and apply archive mod load order (writes `modlist.txt`).

## Install (recommended)

Use the Windows installer as the main way to install and run the app:

1. Download `Cyberpunk 2077 Mod Manager Setup <version>.exe` from `dist/` (or your release page).
2. Run the installer and choose an install location.
3. Launch the app from Start Menu / desktop shortcut.

The installer includes bundled `Foundational Mods` resources and keeps app data across updates.

## Build installer

- `npm run build:win` — Builds the app and a Windows installer (NSIS) that lets you choose the install location.

## Run from source (dev)

1. `npm install`
2. `npm start`

## Project layout

- `src/main/` — Electron main process (game detection, mod registry, install, load order, IPC).
- `src/renderer/` — UI (HTML, CSS, JS).
- `src/shared/` — Shared constants (paths, mod types).
- `assets/` — App icons (`icon.ico`, `icon.png`).
- `Foundational Mods/` — Bundled framework mod zips (included with the built installer).

## Requirements

- Node 18+
- Windows (game detection paths are for Steam/GOG/Epic on Windows)
