# Cyberpunk 2077 Mod Manager

A desktop mod manager for Cyberpunk 2077. Install, enable/disable, and manage load order for mods (archive, REDmod, and more).

## Features

- **Game detection** — Auto-detect game path (Steam, GOG, Epic) or select manually.
- **Install from file** — Install mods from .zip archives (merge into game root with file tracking).
- **Foundational mods** — One-click install of bundled framework mods (CET, RED4ext, redscript, TweakXL, ArchiveXL, etc.) from the `Foundational Mods` folder.
- **Mods download folder** — Set a folder for dropping archives; on launch or "Check mods install folder" you’re prompted to install new mods (only those not already installed).
- **Enable/disable** — Toggle mods on/off; the app tracks which files belong to each mod and moves them to a stash when disabled.
- **Load order** — View and apply archive mod load order (writes `modlist.txt`).

## Run from source

1. `npm install`
2. `npm start`

## Build installer

- `npm run build` or `npm run build:win` — Builds the app and a Windows installer (NSIS) that lets you choose the install location. The `Foundational Mods` folder is included in the install.

## Project layout

- `src/main/` — Electron main process (game detection, mod registry, install, load order, IPC).
- `src/renderer/` — UI (HTML, CSS, JS).
- `src/shared/` — Shared constants (paths, mod types).
- `assets/` — App icons (`icon.ico`, `icon.png`).
- `Foundational Mods/` — Bundled framework mod zips (included with the built installer).

## Requirements

- Node 18+
- Windows (game detection paths are for Steam/GOG/Epic on Windows)
