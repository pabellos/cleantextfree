// Loads the unpacked extension in Chromium: popup cleans text, context-menu function cleans a selection.
// Exits 1 on any failure. Usage: node extension/build.js && node tests/extension.e2e.js
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');
const ext = path.join(__dirname, '..', 'extension');
let fail = 0, checks = 0;
const check = (name, ok, d) => { checks++; if (!ok) { fail++; console.log('FAIL', name, JSON.stringify(d)); } };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctf-ext-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  check('service worker loaded', !!id, sw.url());

  // Popup
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`chrome-extension://${id}/popup.html`);
  await p.fill('#input', '### Title\n\n- **Bold** item — with dash\u200B\n\nSee【4†source】 end.');
  await p.dispatchEvent('#input', 'input');
  const out = await p.inputValue('#output');
  check('popup: markdown + dash + hidden + citation cleaned', out === 'Title\n\n• Bold item, with dash\n\nSee end.', out);
  check('popup: report shows counts', /Removed:/.test(await p.innerText('#report')), await p.innerText('#report'));
  await p.click('[data-mode=hidden]');
  check('popup: hidden mode removes only invisible chars', (await p.inputValue('#output')).includes('**Bold**') && !(await p.inputValue('#output')).includes('\u200B'));
  await p.click('#copy');
  await p.waitForTimeout(200);
  check('popup: copy writes clipboard', (await p.evaluate(() => navigator.clipboard.readText())).includes('**Bold**'));
  check('popup: no page errors', errs.length === 0, errs);
  check('popup: footer links to site with UTM', /utm_source=chrome-extension/.test(await p.getAttribute('#site', 'href')));

  // Context-menu function, run the way background.js injects it (engine file + function in the page)
  const fnSrc = await sw.evaluate(() => cleanSelectionInPage.toString());
  const defaults = await sw.evaluate(() => CTF_DEFAULTS);
  // Secure context (localhost) is required for navigator.clipboard, like on real https pages.
  const srv = require('http').createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    r.end('<div id="x">## Heading<br><br>**Line one** — two<br><br>Line three</div>');
  }).listen(8767);
  const t = await ctx.newPage();
  await t.goto('http://localhost:8767/');
  await t.addScriptTag({ path: path.join(ext, 'lib', 'ai-cleaner.js') });
  await t.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('x')); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await t.evaluate(([src, opts]) => { const f = new Function('return ' + src)(); f('ctf-clean', opts, ''); }, [fnSrc, defaults]);
  await t.waitForTimeout(300);
  // Windows clipboard stores CRLF; compare with LF.
  const clip = (await t.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  check('context menu: selection cleaned with line breaks kept', clip === 'Heading\n\nLine one, two\n\nLine three', clip);
  check('context menu: toast shown', await t.locator('text=Cleaned text copied').count() === 1);

  srv.close();
  await ctx.close();
  console.log(fail ? `FAILURES: ${fail}/${checks}` : `ALL OK (${checks} checks)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
