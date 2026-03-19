const fs = require('fs');
const path = require('path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const dist = path.join(root, 'dist');
  const assets = path.join(root, 'assets');

  // 1) Delete old installers and blockmaps (keep win-unpacked if you want; we remove old Setup*.exe).
  if (fs.existsSync(dist)) {
    for (const name of fs.readdirSync(dist)) {
      const lower = name.toLowerCase();
      if (
        lower.includes('setup') &&
        (lower.endsWith('.exe') || lower.endsWith('.exe.blockmap'))
      ) {
        try {
          fs.rmSync(path.join(dist, name), { force: true });
        } catch (_) {}
      }
    }
  }

  // 2) Generate a proper .ico from icon.png (256x256), so electron-builder can use it.
  const pngPath = path.join(assets, 'icon.png');
  const icoPath = path.join(assets, 'icon.ico');

  if (!fs.existsSync(pngPath)) {
    console.warn('assets/icon.png not found; skipping icon.ico generation');
    return;
  }

  // Lazy-require so builds still work if dependency is missing.
  const pngToIcoModule = require('png-to-ico');
  const pngToIco = pngToIcoModule.default || pngToIcoModule;
  const buf = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, buf);
  console.log('Generated assets/icon.ico from assets/icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

