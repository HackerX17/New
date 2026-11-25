// End-to-end test: drives every screen and control of Savepoint in a real browser.
//   python3 tests/make_fixtures.py /tmp/fx && ./scripts/build.sh && node tests/e2e.js /tmp/fx
// Runs twice: as on claude.ai (with a stand-in for the account storage that enforces its rules)
// and as the standalone page (browser storage).
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const FX = process.argv[2] || path.join(__dirname, 'fixtures');
const APP = 'file://' + path.join(__dirname, '..', 'savepoint', 'index.html');
const EXP = JSON.parse(fs.readFileSync(path.join(FX, 'expected.json'), 'utf8'));
const fx = n => path.join(FX, n);

let pass = 0, fail = 0; const failures = [];
const ok = (cond, msg) => { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; failures.push(msg); console.log('  FAIL ' + msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Stand-in for window.claude on claude.ai: db (per-person subtree, 256 KiB docs, no nested arrays, path grammar), user, downloads.
const FAKE_CLAUDE = `(() => {
  const P = 'fakedb:', L = new Map(), SEG = /^[A-Za-z0-9_\\-.~:@+]{1,200}$/;
  const nested = v => Array.isArray(v) ? v.some(x => Array.isArray(x) || nested(x)) : (v && typeof v === 'object' ? Object.values(v).some(nested) : false);
  const check = p => { const s = p.split('/'); if (s.length % 2) throw new TypeError('document path has odd segments: ' + p); s.forEach(x => { if (!SEG.test(x) || x === '.' || x === '..') throw new TypeError('bad segment ' + x); }); };
  window.__db = {sets: 0, deletes: 0, maxDoc: 0, errors: []};
  const snap = p => { const raw = localStorage.getItem(P + p); return {id: p.split('/').pop(), exists: raw != null, data: () => raw == null ? undefined : JSON.parse(raw), metadata: {fromCache: false, hasPendingWrites: false}}; };
  const emit = p => (L.get(p) || new Set()).forEach(fn => { try { fn(snap(p)); } catch (e) {} });
  addEventListener('storage', e => { if (e.key && e.key.startsWith(P)) emit(e.key.slice(P.length)); });
  const wait = () => new Promise(r => setTimeout(r, 4 + Math.random() * 16));
  const fail = (m) => { __db.errors.push(m); return {code: 'invalid_argument', message: m}; };
  const db = { doc(p) {
    check(p); if (!p.startsWith('data/users/u_test/')) throw new TypeError('outside own subtree: ' + p);
    return { id: p.split('/').pop(), path: p,
      async get() { await wait(); return snap(p); },
      async set(d) { await wait(); if (!d || typeof d !== 'object' || Array.isArray(d)) throw fail('body must be an object'); const s = JSON.stringify(d);
        if (s.length > 262144) throw fail('document over 256 KiB: ' + s.length); if (nested(d)) throw fail('nested array in ' + p);
        __db.sets++; __db.maxDoc = Math.max(__db.maxDoc, s.length); localStorage.setItem(P + p, s); emit(p); },
      async delete() { await wait(); __db.deletes++; localStorage.removeItem(P + p); emit(p); },
      onSnapshot(next) { if (!L.has(p)) L.set(p, new Set()); L.get(p).add(next); setTimeout(() => next(snap(p)), 0); return () => L.get(p).delete(next); },
    }; } };
  window.__dl = [];
  const downloads = { async save({filename, data}) { const text = typeof data === 'string' ? data : await data.text(); window.__dl.push({filename, text}); return {status: 'saved'}; } };
  window.claude = { use: async n => ({db, user: {id: async () => 'u_test', isOwner: () => true, canEdit: () => true}, downloads})[n] || null };
})();`;

async function newPage(ctx, errs, name) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errs.push(`${name} console: ${m.text()}`); });
  return p;
}
const go = async (p, hash) => { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForTimeout(150); };
const txt = async (p, sel) => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
const count = async p => { const t = await txt(p, '.count'); const m = t.match(/of ([\d,]+)/); return m ? +m[1].replace(/,/g, '') : -1; };
const left = async p => +((await txt(p, '#hud')).match(/Left ([\d,]+)/) || [0, -1])[1].replace(/,/g, '');
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const fileFrom = (name, as, mime) => ({name: as || name, mimeType: mime || 'application/octet-stream', buffer: fs.readFileSync(fx(name))});
async function importFiles(p, files, sel = '#impfile') {
  await go(p, 'data'); await p.setInputFiles(sel, files);
  await p.waitForFunction(() => { const r = document.querySelector('#impres'); return r && !/Reading/.test(r.innerText) && r.innerText.trim().length > 0; }, null, {timeout: 20000});
  return txt(p, '#impres');
}

async function artifactRun(browser) {
  console.log('\n== As on claude.ai, phone (Android-size touch screen) ==');
  const errs = [];
  const ctx = await browser.newContext({...devices['Galaxy S9+']});
  await ctx.addInitScript(FAKE_CLAUDE);
  const p = await newPage(ctx, errs, 'phone');
  await p.goto(APP + '#data'); await p.waitForFunction(() => !/Loading/.test(document.querySelector('#savechip').textContent));
  ok(/Sample data/.test(await txt(p, '#savechip')), 'starts on sample data');

  // The picker help appears when a tap doesn't open the file picker
  p.once('filechooser', () => {});
  await p.click('#impfile'); await p.waitForTimeout(2800);
  ok(/didn’t open/.test(await txt(p, '#pickhelp').catch(() => '')), 'shows help when the file picker never opens');

  // Import: a ZIP with no extension and a generic file type (how Android often hands files over)
  let t = await importFiles(p, [fileFrom('export.zip', 'instagram-download', 'application/octet-stream')]);
  ok(!(await p.locator('#pickhelp .err').count()), 'picker help clears once a file arrives');
  ok(t.includes(`${EXP.saved} saved posts in ${EXP.collections} collections, ${EXP.captions} with captions`), 'reads saves, collections and captions from the ZIP: ' + t.slice(0, 120));
  ok(t.includes(`${EXP.liked} liked posts`) && t.includes(`${EXP.following} accounts you follow`) && t.includes(`${EXP.followers} followers`) && t.includes(`${EXP.unfollowed} recently unfollowed`), 'reads likes, following, both follower files and unfollowed');
  await p.click('[data-act=imp-go]');
  t = await txt(p, '#impres');
  ok(/400 new saves added, 4 collections became boards/.test(t), 'adds saves and turns collections into boards: ' + t);
  await p.waitForFunction(() => document.querySelector('#savechip').textContent === 'Saved to your account', null, {timeout: 8000}).catch(() => {});
  ok((await txt(p, '#savechip')) === 'Saved to your account', 'saves to the account storage');
  const db = await p.evaluate(() => ({...window.__db, keys: Object.keys(localStorage).filter(k => k.startsWith('fakedb:')).length}));
  ok(db.errors.length === 0 && db.maxDoc < 262144 && db.keys >= 10, `storage writes follow the rules (docs ${db.keys}, largest ${db.maxDoc} bytes, errors ${db.errors.join('; ') || 'none'})`);

  // Survives a reload
  await p.reload(); await p.waitForFunction(() => !/Loading/.test(document.querySelector('#savechip').textContent));
  await go(p, 'library');
  ok((await count(p)) === EXP.saved && !(await p.locator('.banner').count()), 'library reloads with all 400 saves and no sample banner');

  // Library: search, filters, board filter, sorts, layouts
  await p.fill('#q', 'creator.noodle'); ok((await count(p)) > 0 && (await count(p)) < 400, 'search by creator');
  await p.fill('#q', 'post number 15'); ok((await count(p)) >= 1, 'search finds captions');
  await p.fill('#q', 'zzzz-nothing'); ok(await p.locator('[data-act=clear-filters]').isVisible(), 'empty search offers Clear filters');
  await p.click('[data-act=clear-filters]'); ok((await count(p)) === 400, 'Clear filters resets the list');
  await p.click('[data-act=filter][data-v=unsorted]'); ok((await count(p)) === 340, 'Unsorted filter (400 minus 60 filed by collections)');
  for (const f of ['reel', 'post', 'starred', 'try', 'done', 'letgo', 'all']) { await p.click(`[data-act=filter][data-v=${f}]`); await p.waitForTimeout(40); }
  ok((await count(p)) === 400, 'every filter chip works and All restores the list');
  await p.selectOption('#fboard', {label: 'Gym'}); ok((await count(p)) === 15, 'board dropdown filters to one board');
  await p.selectOption('#fboard', ''); for (const s of ['old', 'creator', 'rated', 'filed', 'new']) await p.selectOption('#fsort', s);
  ok((await count(p)) === 400, 'every sort order works');
  await p.click('[data-act=view][data-v=list]'); ok(await p.locator('.results.list').count() === 1, 'list layout'); await p.click('[data-act=view][data-v=grid]');
  await p.click('[data-act=more]'); ok((await txt(p, '.count')).startsWith('Showing 120'), 'Show more loads the next 60');

  // Bulk select
  await p.click('[data-act=select-mode]');
  const cards = p.locator('#results .card'); for (let i = 0; i < 3; i++) await cards.nth(i).click();
  ok(/3 selected/.test(await txt(p, '.bulk')), 'select three saves');
  await p.selectOption('#bulkmove', {label: 'Trips'}); await p.waitForTimeout(100);
  await p.selectOption('#fboard', {label: 'Trips'}); ok((await count(p)) === 18, 'bulk move into a board');
  const selecting = async () => { if (!(await p.locator('.bulk').count())) await p.click('[data-act=select-mode]'); };
  ok(await p.locator('.bulk').count() === 1, 'select mode stays on after a bulk move');
  await selecting(); await p.click('[data-act=sel-all]'); await p.click('[data-act=bulk-done]');
  await p.click('[data-act=filter][data-v=done]'); ok((await count(p)) === 18, 'bulk mark done');
  await selecting(); await p.click('[data-act=sel-all]'); await p.click('[data-act=bulk-letgo]');
  await p.click('[data-act=filter][data-v=letgo]'); ok((await count(p)) === 18, 'bulk let go, and the Let go filter shows them');
  await selecting(); await p.click('[data-act=sel-all]'); await p.click('[data-act=bulk-letgo]');
  await p.click('[data-act=filter][data-v=all]'); await p.selectOption('#fboard', ''); ok((await count(p)) === 400, 'bring saves back from Let go');
  if (await p.locator('.bulk').count()) await p.click('.bulk [data-act=select-mode]');
  ok(!(await p.locator('.bulk').count()), 'leave select mode');

  // Drawer: every control
  await p.click('#results .card >> nth=0'); await p.waitForSelector('.drawer');
  const href = await p.getAttribute('.drawer a.btn[href*="instagram.com/"]', 'href');
  ok(/^https:\/\/www\.instagram\.com\/(p|reel)\/C[\w-]{10}\/$/.test(href || ''), 'Open on Instagram links to the post: ' + href);
  await p.click('.drawer [data-act=d-board] >> text=Fits'); ok((await p.getAttribute('.drawer [data-act=d-board] >> text=Fits', 'aria-pressed')) === 'true', 'drawer: choose a board');
  await p.click('.drawer [data-act=d-rate][data-r="4"]'); ok((await p.locator('.drawer .star[aria-pressed=true]').count()) === 4, 'drawer: rate 4 stars');
  await p.click('.drawer [data-act=d-status][data-v=try]'); ok((await p.getAttribute('.drawer [data-act=d-status][data-v=try]', 'aria-pressed')) === 'true', 'drawer: set status');
  await p.fill('#d-note', 'Garlic noodles to try'); await p.fill('#d-tag', 'dinner'); await p.press('#d-tag', 'Enter');
  ok(await p.locator('.drawer .tag', {hasText: '#dinner'}).count() === 1, 'drawer: add a tag');
  await p.fill('#d-tag', 'quick'); await p.press('#d-tag', 'Enter'); await p.click('.drawer [data-act=d-tagdel][data-t=quick]');
  ok(await p.locator('.drawer .tag').count() === 1, 'drawer: remove a tag');
  const pos1 = await txt(p, '.drawer .pos'); await p.click('[data-act=d-next]'); const pos2 = await txt(p, '.drawer .pos'); await p.click('[data-act=d-prev]');
  ok(pos1 !== pos2 && (await txt(p, '.drawer .pos')) === pos1, 'drawer: next and previous');
  await p.click('[data-act=d-letgo]'); ok(/Bring back/.test(await txt(p, '[data-act=d-letgo]')), 'drawer: let go'); await p.click('[data-act=d-letgo]');
  await p.keyboard.press('Escape'); ok(await p.locator('#drawer').isHidden(), 'Escape closes the drawer');
  ok(await p.locator('#results .cnote', {hasText: 'Garlic noodles to try'}).count() === 1, 'note shows on the card');
  await p.click('[data-act=flashback]'); ok(await p.locator('.drawer').isVisible(), 'Flashback opens a save'); await p.click('#d-close');

  // Sort mode (phone layout: the board buttons must be on screen without scrolling)
  await go(p, 'sort'); await p.waitForSelector('#scard');
  const vh = p.viewportSize().height, padBox = await p.locator('.bpad').first().boundingBox();
  ok(padBox && padBox.y + padBox.height <= vh, `board buttons visible without scrolling on a phone (bottom ${Math.round(padBox.y + padBox.height)} of ${vh})`);
  let l0 = await left(p), h0 = await txt(p, '#scard .handle-lg');
  await p.keyboard.press('1'); await p.waitForTimeout(450);
  ok((await left(p)) === l0 - 1, 'key 1 files into the first board');
  if (await p.locator('[data-act=batch-file]').count()) {
    const n = +((await txt(p, '[data-act=batch-file]')).match(/\d+/) || [0])[0]; l0 = await left(p);
    await p.click('[data-act=batch-file]'); await p.waitForTimeout(300); ok((await left(p)) === l0 - n, `File all from the same creator (${n})`);
  } else ok(false, 'batch offer appears after filing');
  h0 = await txt(p, '#scard .s-meta'); await p.click('[data-act=skip]'); await p.waitForTimeout(400);
  ok((await txt(p, '#scard .s-meta')) !== h0 || (await left(p)) === 1, 'Skip moves to the next save');
  l0 = await left(p); await p.click('[data-act=letgo]'); await p.waitForTimeout(400); ok((await left(p)) === l0 - 1, 'Let go removes it from the inbox');
  await p.click('[data-act=undo]'); await p.waitForTimeout(300); ok((await left(p)) === l0, 'Undo brings it back');
  await p.click('.bpad >> nth=1'); await p.waitForTimeout(450);
  if (await p.locator('[data-act=batch-rule]').count()) { await p.click('[data-act=batch-rule]'); await p.waitForTimeout(300); ok(true, 'Always for creator makes a rule'); } else ok(false, 'rule offer appears');
  l0 = await left(p); await p.click('[data-act=sort-newboard]'); await p.fill('#snb', 'Made in sort'); await p.press('#snb', 'Enter'); await p.waitForTimeout(450);
  ok((await left(p)) === l0 - 1 && await p.locator('.bpad', {hasText: 'Made in sort'}).count() === 1, 'create a board from Sort mode and file into it');
  await p.selectOption('#sorder', 'old'); await p.selectOption('#sorder', 'random'); await p.selectOption('#sorder', 'creator'); ok(await p.locator('#scard').count() === 1, 'every order works');
  await p.click('[data-act=smode][data-v=sprint]'); ok(await p.locator('[data-act=sprint-start]').isVisible(), 'sprint mode shows the start screen');
  await p.click('[data-act=sprint-start]'); await p.waitForTimeout(100); l0 = await left(p); await p.keyboard.press('2'); await p.waitForTimeout(450);
  ok((await left(p)) === l0 - 1 && /\d+s/.test(await txt(p, '#hud')), 'sprint runs with a timer and files saves');
  await p.click('[data-act=smode][data-v=zen]');

  // Boards: create, quick add, open, edit, recolor, delete, rules
  await go(p, 'boards'); ok(await p.locator('.rulelist li', {hasText: '@'}).count() >= 1, 'the rule made in Sort mode is listed');
  await p.click('[data-act=board-new]'); await p.fill('#nb-name', 'Date night'); await p.click('[data-act=nb-color][data-c="7"]'); await p.click('#newboard button.btn:not(.ghost)');
  ok(await p.locator('.btile', {hasText: 'Date night'}).count() === 1, 'create a board with a color');
  await p.click('[data-act=board-tpl] >> text=Travel'); ok(await p.locator('.btile', {hasText: 'Travel'}).count() === 1, 'quick-add board');
  await p.click('.btile >> text=Gym'); await p.waitForSelector('.head .back');
  { const h = await txt(p, '.head h1'), c = await count(p); ok(/gym/i.test(h) && c >= 15, `open a board page (heading "${h}", ${c} saves, hash ${await p.evaluate(() => location.hash)})`); }
  await p.click('[data-act=board-edit]'); await p.fill('#be-name', 'Gym and mobility'); await p.click('[data-act=be-color][data-c="2"]'); await p.click('#boardedit button.btn:not(.ghost)'); await p.waitForSelector('.head .back');
  ok(/gym and mobility/i.test(await txt(p, '.head h1')), 'rename and recolor a board');
  await p.click('[data-act=board-edit]'); await p.click('[data-act=board-del]'); await p.click('[data-act=board-del-yes]'); await p.waitForTimeout(200);
  ok(!(await p.locator('.btile', {hasText: 'Gym and mobility'}).count()), 'delete a board after confirming');
  const creator = await p.getAttribute('#creators option >> nth=3', 'value');
  await p.fill('#r-a', creator); await p.selectOption('#r-b', {label: 'Date night'}); await p.click('#ruleform button');
  ok(await p.locator('.rulelist li', {hasText: '@' + creator}).count() === 1, 'add an autopilot rule');
  await p.click(`[data-act=rule-del][data-a="${creator}"]`); ok(!(await p.locator('.rulelist li', {hasText: '@' + creator}).count()), 'delete a rule');

  // People
  await go(p, 'people');
  const tile = async k => +((await txt(p, `[data-act=ptab][data-v=${k}] .v`)).replace(/,/g, ''));
  ok((await tile('nfb')) === EXP.nfb && (await tile('fans')) === EXP.fans && (await tile('mutual')) === EXP.mutuals && (await tile('following')) === EXP.following && (await tile('unf')) === EXP.unfollowed,
    'follower math: not following back, fans, mutuals, following, unfollowed');
  for (const k of ['fans', 'mutual', 'saved', 'following', 'unf', 'nfb']) { await p.click(`[data-act=ptab][data-v=${k}]`); await p.waitForTimeout(40); }
  await p.click('.prow >> nth=0 >> [data-act=plabel][data-l=Friend]');
  ok((await p.getAttribute('.prow >> nth=0 >> [data-act=plabel][data-l=Friend]', 'aria-pressed')) === 'true', 'label an account');
  await p.check('.prow >> nth=0 >> input[data-act=preview]'); ok(/1 of 120 reviewed/.test(await txt(p, '.formgrid')), 'review checkbox updates progress');
  await p.click('[data-act=plabelf][data-v=Friend]'); ok(await p.locator('.prow').count() === 1, 'filter by label');
  await p.click('[data-act=plabelf][data-v=""]'); await p.fill('#pq', 'friend.00'); await p.waitForTimeout(300); ok(await p.locator('.prow').count() >= 1 && await p.locator('.prow').count() < 20, 'search accounts');
  await p.fill('#pq', ''); await p.waitForTimeout(300); await p.click('[data-act=pmore]'); ok(await p.locator('.prow').count() === 120, 'Show more accounts');

  // Stats and trophies
  await go(p, 'stats'); await p.waitForSelector('#mchart svg');
  ok(await p.locator('#mchart .bar').count() > 10, 'monthly chart draws');
  await p.locator('#mchart .hit').nth(5).tap();
  ok(/save/.test(await txt(p, '#mchart .tip')), 'tapping a chart bar shows its count');
  await p.click('details summary'); ok(await p.locator('details tbody tr').count() > 5, 'chart table view');
  ok(await p.locator('.hbars').first().locator('.hb').count() === 10, 'top creators list');
  await go(p, 'trophies'); ok(await p.locator('.ach').count() === 18 && await p.locator('.ach.on').count() >= 3, 'trophies show achievements, some unlocked');

  // Header controls
  for (const sk of ['atlas', 'kinetic', 'arcade']) { await p.click('#skinbtn'); await p.click(`[data-act=skin][data-v=${sk}]`); ok((await p.getAttribute('html', 'data-skin')) === sk && await p.locator('#skinmenu').isHidden(), 'switch look to ' + sk); }
  await p.click('#soundbtn'); ok((await p.getAttribute('#soundbtn', 'aria-pressed')) === 'true', 'sound toggles on'); await p.click('#soundbtn');

  // Overflow on every page at phone width
  for (const r of ['library', 'sort', 'boards', 'people', 'stats', 'trophies', 'data']) { await go(p, r); ok((await overflow(p)) <= 0, `no sideways scrolling on ${r}`); }

  // Another device edits: this page picks it up
  await p.waitForTimeout(1200);
  const p2 = await newPage(ctx, errs, 'device2'); await p2.goto(APP + '#library'); await p2.waitForFunction(() => !/Loading/.test(document.querySelector('#savechip').textContent));
  await p2.click('#results .card >> nth=1'); await p2.click('.drawer [data-act=d-rate][data-r="5"]'); await p2.click('#d-close');
  await p.waitForFunction(() => [...document.querySelectorAll('.toast')].some(t => /other device/.test(t.textContent)), null, {timeout: 6000}).catch(() => {});
  ok(await p.locator('.toast', {hasText: 'other device'}).count() > 0, 'changes from another device show up without reloading');
  await p2.close();

  // Data page: links, backup, CSV, restore, erase
  await go(p, 'data');
  await p.fill('#links', 'https://www.instagram.com/reel/NEWLINK0001/\nnot a link\nhttps://www.instagram.com/someone/p/NEWLINK0002/');
  await p.click('[data-act=links-add]'); ok(await p.locator('.toast', {hasText: 'Added 2 links'}).count() > 0, 'add links by hand (and ignore a non-link)');
  await p.click('[data-act=backup]'); await p.click('[data-act=csv]'); await p.waitForTimeout(300);
  const dl = await p.evaluate(() => window.__dl);
  const backup = dl.find(d => /backup.*\.json$/.test(d.filename)), csv = dl.find(d => /\.csv$/.test(d.filename));
  ok(backup && JSON.parse(backup.text).items.length === 402, 'download a backup (402 saves)');
  ok(csv && csv.text.split('\n').length === 403 && csv.text.startsWith('url,creator'), 'download a CSV spreadsheet');
  await p.click('[data-act=erase]'); await p.click('[data-act=erase-yes]'); await p.waitForTimeout(500);
  ok(await p.locator('.banner', {hasText: 'sample'}).count() === 1 && await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('fakedb:')).length) === 0, 'erase clears the account storage and shows the sample');
  await p.setInputFiles('#restore', {name: 'savepoint-backup', mimeType: 'application/octet-stream', buffer: Buffer.from(backup.text)}); await p.waitForTimeout(400);
  await go(p, 'library'); ok((await count(p)) === 402, 'restore a backup');

  // Every kind of file someone might pick
  const cases = [
    [[fileFrom('export_html.zip')], /HTML format/, 'HTML-format download explains what to do'],
    [[fileFrom('random.bin', 'photo.jpg', 'image/jpeg')], /isn’t an Instagram download/, 'unrelated file is rejected clearly'],
    [[fileFrom('export_truncated.zip', 'instagram.zip', 'application/zip')], /incomplete/, 'half-downloaded ZIP is caught'],
    [[fileFrom('export_zip64.zip', 'big.zip', 'application/zip')], /400 saved posts/, 'very large ZIP format (66,000 files)'],
    [[fileFrom('export_stored.zip', 'stored.zip', 'application/x-zip-compressed')], /400 saved posts/, 'uncompressed ZIP'],
    [[fileFrom('saved_posts.json', 'saved_posts.json', 'application/json'), fileFrom('followers_1.json', 'followers_1.json', ''), fileFrom('following.json', 'following.json', 'text/plain')], /400 saved posts.*220 accounts you follow.*120 followers/, 'several JSON files at once'],
    [[fileFrom('renamed_download.json', 'download (1)', '')], /400 saved posts/, 'renamed JSON file is recognized by its contents'],
  ];
  for (const [files, re, msg] of cases) { const r = await importFiles(p, files); ok(re.test(r), msg + (re.test(r) ? '' : ' -> ' + r.slice(0, 140))); await p.click('[data-act=imp-cancel]').catch(() => {}); }
  await go(p, 'data'); await p.setInputFiles('#impdir', fx('unzipped'));
  await p.waitForFunction(() => /Found|No Instagram|No saved/.test(document.querySelector('#impres').innerText), null, {timeout: 10000}).catch(() => {});
  ok(/400 saved posts/.test(await txt(p, '#impres')), 'unzipped folder import');
  ok(await p.evaluate(() => window.__db.errors.length) === 0, 'no storage rule violations during the whole run');

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

async function standaloneRun(browser) {
  console.log('\n== Standalone page, desktop (browser storage) ==');
  const errs = [];
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, acceptDownloads: true});
  const p = await newPage(ctx, errs, 'desktop');
  await p.goto(APP + '#data'); await p.waitForFunction(() => !/Loading/.test(document.querySelector('#savechip').textContent));
  // Drag and drop the ZIP onto the drop zone
  const b64 = fs.readFileSync(fx('export.zip')).toString('base64');
  await p.evaluate(b => { const bin = Uint8Array.from(atob(b), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], 'instagram-export.zip', {type: 'application/zip'})); document.querySelector('#drop').dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true})); }, b64);
  await p.waitForFunction(() => /Found/.test(document.querySelector('#impres').innerText), null, {timeout: 15000}).catch(() => {});
  ok(/400 saved posts/.test(await txt(p, '#impres')), 'drag and drop a ZIP');
  await p.click('[data-act=imp-go]'); await p.waitForTimeout(1500);
  ok((await txt(p, '#savechip')) === 'Saved in this browser', 'saves in the browser');
  await p.reload(); await p.waitForFunction(() => !/Loading/.test(document.querySelector('#savechip').textContent)); await go(p, 'library');
  ok((await count(p)) === 400, 'library survives a reload');
  await p.click('#results .card >> nth=0');
  ok(await p.locator('[data-act=d-embed]').count() === 1, 'standalone drawer offers the Instagram preview');
  await p.click('[data-act=d-embed]'); ok(/instagram\.com\/(p|reel)\/[\w-]+\/embed\//.test(await p.getAttribute('#d-embed iframe', 'src')), 'preview loads the Instagram embed'); await p.click('#d-close');
  await go(p, 'data');
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=backup]')]);
  ok(JSON.parse(fs.readFileSync(await d.path(), 'utf8')).items.length === 400, 'backup downloads as a file');
  for (const r of ['library', 'sort', 'boards', 'people', 'stats', 'trophies', 'data']) { await go(p, r); ok((await overflow(p)) <= 0, `no sideways scrolling on ${r} (desktop)`); }
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

async function sprintRun(browser) {
  console.log('\n== 60-second sprint to the end (sample data, fast clock) ==');
  const errs = [];
  const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
  const p = await newPage(ctx, errs, 'sprint');
  await p.clock.install();
  await p.goto(APP + '#sort'); await p.clock.runFor(1000);
  await p.click('[data-act=smode][data-v=sprint]'); await p.click('[data-act=sprint-start]');
  for (let i = 0; i < 3; i++) { await p.keyboard.press(String(1 + (i % 4))); await p.clock.runFor(400); }
  await p.clock.runFor(61000);
  const r = await txt(p, '#stagewrap');
  ok(/3\s*saves filed/.test(r), 'sprint ends after 60 seconds with the score: ' + r.slice(0, 80));
  ok(/your best\s*14/i.test(r), 'shows your best score');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try { await artifactRun(browser); } catch (e) { fail++; failures.push('phone run crashed: ' + e.message); console.log('  CRASH ' + e.stack); }
  try { await standaloneRun(browser); } catch (e) { fail++; failures.push('desktop run crashed: ' + e.message); console.log('  CRASH ' + e.stack); }
  try { await sprintRun(browser); } catch (e) { fail++; failures.push('sprint run crashed: ' + e.message); console.log('  CRASH ' + e.stack); }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exitCode = 1; }
})();
