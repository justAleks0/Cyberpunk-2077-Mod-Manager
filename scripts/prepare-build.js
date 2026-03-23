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

  // 3) Convert installer images to NSIS-compatible 24-bit BMP (no compression, no color-space metadata).
  const buildDir = path.join(root, 'build');
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  const installerImages = [
    { src: 'installerHeader.bmp', dest: 'installerHeader.bmp', width: 150, height: 57 },
    { src: 'installerSidebar.bmp', dest: 'installerSidebar.bmp', width: 164, height: 314 },
    { src: 'installerUnSidebar.bmp', dest: 'installerUnSidebar.bmp', width: 164, height: 314 },
  ];

  try {
    const { Jimp } = require('jimp');
    for (const { src, dest, width, height } of installerImages) {
      const srcPath = path.join(assets, src);
      const destPath = path.join(buildDir, dest);
      if (!fs.existsSync(srcPath)) continue;
      const img = await Jimp.read(srcPath);
      img.resize({ w: width, h: height });
      await img.write(destPath);
      console.log(`Converted ${src} to NSIS-compatible BMP (${width}x${height})`);
    }
  } catch (err) {
    console.warn('Jimp conversion failed, falling back to copy:', err.message);
    for (const { src, dest } of installerImages) {
      const srcPath = path.join(assets, src);
      const destPath = path.join(buildDir, dest);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied ${src} to build/`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

