// End-to-end test for the picture-first website (index.html at the repo root, served by GitHub Pages).
//   python3 tests/make_fixtures.py /tmp/fx && ./scripts/build.sh && node tests/site.e2e.js /tmp/fx
// Instagram is replaced by a stand-in embed page that reports its height the way Instagram's embeds do.
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const FX = process.argv[2] || path.join(__dirname, 'fixtures');
const ROOT = path.join(__dirname, '..');
const fx = n => path.join(FX, n);
let pass = 0, fail = 0; const failures = [];
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; failures.push(m); console.log('  FAIL ' + m); } };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/New\//, '/').replace(/\/$/, '/index.html'));
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { rsp.writeHead(404); rsp.end('not found'); return; }
      rsp.writeHead(200, {'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'}); fs.createReadStream(p).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}
const FAKE_EMBED = p => `<!doctype html><html><body style="margin:0;font:16px sans-serif;background:#fff;color:#000"><div style="padding:12px">Stand-in Instagram embed for ${p}</div>
<script>setTimeout(() => parent.postMessage(JSON.stringify({type: 'MEASURE', details: {height: 777}}), '*'), 30);</script></body></html>`;

async function page(ctx, errs, name) {
  const p = await ctx.newPage();
  await p.route('https://www.instagram.com/**', r => r.fulfill({status: 200, contentType: 'text/html', body: FAKE_EMBED(new URL(r.request().url()).pathname)}));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) errs.push(`${name} console: ${m.text()}`); });
  return p;
}
const txt = async (p, s) => (await p.locator(s).first().innerText()).replace(/\s+/g, ' ').trim();
const left = async p => +((await txt(p, '#left')).match(/[\d,]+/) || ['-1'])[0].replace(/,/g, '');
const curId = p => p.locator('#frame iframe:not([hidden])').getAttribute('data-id');
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const file = (n, as, mime = 'application/octet-stream') => ({name: as || n, mimeType: mime, buffer: fs.readFileSync(fx(n))});

(async () => {
  const srv = await serve(); const BASE = `http://localhost:${srv.address().port}/New/`;
  const browser = await chromium.launch();
  try {
    console.log('\n== Android phone, as on GitHub Pages ==');
    const errs = [];
    const ctx = await browser.newContext({...devices['Pixel 7'], acceptDownloads: true});
    const p = await page(ctx, errs, 'phone');
    await p.goto(BASE);
    ok(/Sort your Instagram saves/.test(await txt(p, 'h1')), 'first visit shows the start screen');
    await p.setInputFiles('#pick', file('export_html.zip', 'download.zip', 'application/zip'));
    await p.waitForSelector('#status .err'); ok(/HTML format/.test(await txt(p, '#status')), 'HTML-format download explained');
    await p.setInputFiles('#pick', file('random.bin', 'photo.jpg', 'image/jpeg'));
    await p.waitForFunction(() => /No saved posts|Couldn’t read/.test(document.querySelector('#status').innerText)); ok(true, 'unrelated file rejected');

    await p.setInputFiles('#pick', file('export.zip', 'instagram-download'));
    await p.waitForSelector('#frame iframe');
    ok((await left(p)) === 340, 'imports 400 saves; 60 already in Instagram collections, 340 left');
    ok(await p.locator('.fbtn[data-act=file]').count() === 4, 'Instagram collections became 4 folders');
    let id = await curId(p);
    const src = await p.locator('#frame iframe:not([hidden])').getAttribute('src');
    ok(/^https:\/\/www\.instagram\.com\/(p|reel)\/C[\w-]{10}\/embed\/captioned\/$/.test(src), 'shows the real post with Instagram’s embed: ' + src);
    await p.waitForFunction(() => document.querySelector('#frame').classList.contains('ready'));
    ok((await p.locator('#frame iframe:not([hidden])').evaluate(f => f.style.height)) === '777px', 'preview resizes to the post’s height');
    ok(await p.locator('#frame iframe[hidden]').count() === 1, 'next post preloads in the background');
    const ig = await p.getAttribute('.act.ig', 'href');
    ok(/^intent:\/\/www\.instagram\.com\/(p|reel)\/[\w-]+\/#Intent;scheme=https;package=com\.instagram\.android;/.test(ig), 'Instagram button opens the Instagram app directly on Android');

    // The dock never hides the post: the page leaves room for it
    const dockH = await p.locator('#dock').evaluate(d => d.offsetHeight), padB = await p.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom));
    ok(padB >= dockH, `page leaves room above the folder buttons (${padB} ≥ ${dockH})`);
    const vh = p.viewportSize().height, fb = await p.locator('.fbtn').first().boundingBox();
    ok(fb.y + fb.height <= vh && fb.y > vh * 0.4, 'folder buttons sit at the bottom of the screen, always tappable');

    // File, skip, don't need, undo
    await p.click('.fbtn[data-act=file] >> nth=0'); await p.waitForTimeout(150);
    ok((await left(p)) === 339 && (await curId(p)) !== id, 'tapping a folder files it and shows the next post');
    ok(await p.locator('#frame').evaluate(f => f.classList.contains('ready')), 'the next post appears right away (it was preloaded)');
    id = await curId(p); await p.click('[data-act=skip]'); await p.waitForTimeout(100);
    ok((await left(p)) === 339 && (await curId(p)) !== id, 'Skip moves on without filing');
    await p.click('[data-act=dontneed]'); ok((await left(p)) === 338, 'Don’t need sets it aside');
    await p.click('[data-act=undo]'); ok((await left(p)) === 339, 'Undo brings it back');

    // New folder from the dock
    await p.click('[data-act=newfolder]'); await p.fill('#nf', 'Date night'); await p.press('#nf', 'Enter'); await p.waitForTimeout(100);
    ok((await left(p)) === 338 && await p.locator('.fbtn', {hasText: 'Date night'}).count() === 1, 'make a folder while sorting and file into it');

    // By-creator order and the "put them all in" offer
    await p.click('#menubtn'); await p.click('[data-act=order][data-v=creator]'); await p.click('#closemenu');
    let l0 = await left(p); await p.click('.fbtn[data-act=file] >> nth=1'); await p.waitForTimeout(100);
    if (await p.locator('[data-act=batch]').count()) {
      const n = +((await txt(p, '.batch p')).match(/\d+/) || [0])[0]; l0 = await left(p);
      await p.click('[data-act=batch]'); await p.waitForTimeout(100); ok((await left(p)) === l0 - n, `“put them all in” files the creator’s other ${n} posts`);
    } else ok(false, 'offer to file the creator’s other posts appears');

    // Folders
    await p.click('#tab-folders'); await p.waitForSelector('.frow');
    ok(await p.locator('.list').first().locator('.frow').count() === 5, 'Folders lists every folder');
    ok(/Not sorted yet/.test(await txt(p, '.sep')) && /Don’t need/.test(await txt(p, '.sep')), 'Not sorted yet and Don’t need are listed too');
    await p.click('.frow >> nth=0'); await p.waitForSelector('.prow');
    const before = await p.locator('.prow').count();
    await p.click('.prow >> nth=0 >> button'); await p.waitForSelector('.prow[open] iframe');
    ok(/embed\/captioned/.test(await p.locator('.prow[open] iframe').getAttribute('src')), 'tap a post in a folder to see it');
    await p.selectOption('.prow[open] select', {label: 'Date night'}); await p.waitForTimeout(100);
    ok(await p.locator('.prow').count() === before - 1, 'move a post to another folder');
    await p.click('.prow >> nth=0 >> button'); await p.click('.prow[open] [data-act=rowdont]');
    ok(await p.locator('.prow').count() === before - 2, 'Don’t need from a folder');
    await p.click('[data-act=editf]'); await p.fill('#rn', 'Recipes to cook'); await p.press('#rn', 'Enter');
    ok(/Recipes to cook/.test(await txt(p, 'h1')), 'rename a folder');
    await p.click('[data-act=editf]'); await p.click('[data-act=delf]'); await p.click('[data-act=delf-yes]'); await p.waitForSelector('.frow');
    ok(!(await p.locator('.frow', {hasText: 'Recipes to cook'}).count()), 'delete a folder; its posts go back to Not sorted yet');
    await p.click('.sep .frow >> nth=1'); await p.waitForSelector('.prow');
    await p.click('.prow >> nth=0 >> button'); await p.click('.prow[open] [data-act=restore]'); ok(true, 'bring a post back from Don’t need');
    await p.click('.back'); await p.click('[data-act=newfolder2]'); await p.fill('#nf2', 'Fits'); await p.press('#nf2', 'Enter');
    ok(await p.locator('.frow', {hasText: 'Fits'}).count() === 1, 'add a folder from the Folders page');

    // Menu: links, backup, erase, restore
    await p.click('#tab-sort'); await p.click('#menubtn');
    await p.fill('#links', 'https://www.instagram.com/reel/NEWLINK0001/?igsh=abc\nhttps://www.instagram.com/p/NEWLINK0002/');
    const l1 = await left(p); await p.click('[data-act=addlinks]'); ok((await left(p)) === l1 + 2, 'paste links from Instagram’s Copy link');
    await p.click('#menubtn');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=backup]')]);
    const back = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    ok(back.app === 'savepoint-web' && Object.keys(back.items).length === 402, 'download a backup');
    await p.reload(); await p.waitForSelector('#frame iframe'); const l2 = await left(p);
    ok(l2 === l1 + 2, 'everything survives a reload');
    await p.click('#menubtn'); await p.click('[data-act=erase]'); await p.click('[data-act=erase-yes]');
    ok(/Sort your Instagram saves/.test(await txt(p, 'h1')), 'erase returns to the start screen');
    await p.setInputFiles('#pick', {name: 'savepoint-backup', mimeType: '', buffer: fs.readFileSync(await dl.path())}); await p.waitForSelector('#frame iframe');
    ok((await left(p)) === l2, 'restore a backup from the start screen');
    // A backup from the claude.ai version
    await p.click('#menubtn'); await p.click('[data-act=erase]'); await p.click('[data-act=erase-yes]');
    const claudeBackup = {app: 'savepoint', version: 1, meta: {boards: [{id: 'bX', name: 'Travel', color: 3}]}, items: [{i: 'CLAUDEA0001', a: 'wren', t: 'r', s: 1700000000, b: 'bX'}, {i: 'CLAUDEA0002', a: 'kai', t: 'p', s: 1700000001}, {i: 'CLAUDEA0003', a: 'zoe', t: 'p', s: 1700000002, x: 1}]};
    await p.setInputFiles('#pick', {name: 'savepoint-backup-2026-11-27.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(claudeBackup))}); await p.waitForSelector('#frame iframe');
    ok((await left(p)) === 1 && await p.locator('.fbtn', {hasText: 'Travel'}).count() === 1, 'bring in a backup from the Claude version, boards become folders');

    for (const h of ['sort', 'folders']) { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(150); ok((await overflow(p)) <= 0, 'no sideways scrolling on ' + h); }
    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();

    console.log('\n== Desktop and iPhone ==');
    const errs2 = [];
    const ctx2 = await browser.newContext({viewport: {width: 1280, height: 860}});
    const d = await page(ctx2, errs2, 'desktop');
    await d.goto(BASE); await d.setInputFiles('#pick', file('export.zip', 'export.zip', 'application/zip')); await d.waitForSelector('#frame iframe');
    ok(/^https:\/\/www\.instagram\.com\//.test(await d.getAttribute('.act.ig', 'href')), 'desktop Instagram button opens instagram.com');
    ok((await overflow(d)) <= 0, 'no sideways scrolling on desktop');
    await ctx2.close();
    const ctx3 = await browser.newContext({...devices['iPhone 14']});
    const ip = await page(ctx3, errs2, 'iphone');
    await ip.goto(BASE); await ip.setInputFiles('#pick', file('export.zip')); await ip.waitForSelector('#frame iframe');
    ok(/^https:\/\/www\.instagram\.com\//.test(await ip.getAttribute('.act.ig', 'href')) && (await overflow(ip)) <= 0, 'iPhone: Instagram link and layout');
    ok(errs2.length === 0, 'no page errors' + (errs2.length ? ': ' + errs2.join(' | ') : ''));
    await ctx3.close();
  } catch (e) { fail++; failures.push('crash: ' + e.message); console.log('  CRASH ' + e.stack); }
  await browser.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exitCode = 1; }
})();
