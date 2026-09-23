// Copies the website engine into the extension, renders icons, and packs a zip for the Chrome Web Store.
// Usage: node extension/build.js
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const { chromium } = require('playwright');
const root = __dirname;

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#6366f1"/>
  <text x="50" y="92" text-anchor="middle" font-family="Georgia, serif" font-size="78" font-weight="700" fill="#fff">T</text>
  <path d="M78 58 L112 92 M112 58 L78 92" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
</svg>`;

(async () => {
  fs.copyFileSync(path.join(root, '..', 'src', 'ai-cleaner.js'), path.join(root, 'lib', 'ai-cleaner.js'));

  const b = await chromium.launch();
  const p = await b.newPage();
  for (const s of [16, 48, 128]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0;background:transparent">${ICON_SVG.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
    await p.screenshot({ path: path.join(root, 'icons', `icon${s}.png`), omitBackground: true });
  }
  await b.close();

  const v = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
  const out = path.join(root, 'dist', `cleantextfree-extension-${v}.zip`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fs.existsSync(out)) fs.unlinkSync(out);
  // Zip from a staging dir so paths inside the archive keep their folders (lib/, icons/).
  const stage = path.join(root, 'dist', 'stage');
  fs.rmSync(stage, { recursive: true, force: true });
  const files = ['manifest.json', 'background.js', 'defaults.js', 'popup.html', 'popup.css', 'popup.js', 'lib/ai-cleaner.js', 'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'];
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(stage, f)), { recursive: true });
    fs.copyFileSync(path.join(root, f), path.join(stage, f));
  }
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${stage}\\*' -DestinationPath '${out}'"`);
  fs.rmSync(stage, { recursive: true, force: true });
  console.log('built', out);
})();
