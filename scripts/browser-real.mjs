// Real Three.js scene with exact pinned CDN modules served from dev dependencies.
import assert from 'node:assert/strict';
import http from 'node:http';
import {isolateBrowserNetwork} from './browser-network-safety.mjs';
import {mkdir} from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium, webkit } from 'playwright';
const root = resolve(new URL('..', import.meta.url).pathname);
const server = http.createServer(async (req, res) => {
  const file = resolve(
    root,
    '.' +
      (new URL(req.url, 'http://local').pathname === '/'
        ? '/index.html'
        : new URL(req.url, 'http://local').pathname)
  );
  if (!file.startsWith(root + '/')) return res.writeHead(403).end();
  try {
    res.setHeader(
      'content-type',
      { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] ||
        'application/octet-stream'
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const type = process.env.PW_BROWSER === 'webkit' ? webkit : chromium;
const browser = await type.launch(
  type === chromium
    ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : {}
);
try {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    locale: 'en-US',
    serviceWorkers:'block'
  });
  await isolateBrowserNetwork(context,`http://127.0.0.1:${server.address().port}`);
  const page=await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.185.1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/three@0.185.1/')[1];
    await route.fulfill({
      contentType: 'text/javascript',
      body: await readFile(resolve(root, 'node_modules/three', path), 'utf8')
    });
  });
  await page.route('**/js/main.js*', async (route) => {
    const source = await readFile(resolve(root, 'js/main.js'), 'utf8');
    await route.fulfill({
      contentType: 'text/javascript',
      body: source.replace(
        'game = instance;',
        'game = instance; window.realGameForTest = instance;'
      )
    });
  });
  const writes = [];
  await page.route('https://*.supabase.co/**', async (route) => {
    writes.push(route.request().url());
    await route.fulfill({ status: 503, body: '{}' });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.click('#start-button');
  await page.waitForFunction(
    () => window.realGameForTest?.getSnapshot() && document.querySelector('#loading').hidden
  );
  const before = await page.evaluate(() => window.realGameForTest.getSnapshot());
  assert.equal(before.phase, 'WAITING_FOR_CLIMB');
  await page.locator('[data-direction=up]').click();
  await page.waitForTimeout(700);
  await page.waitForFunction(() => window.realGameForTest.getSnapshot().phase === 'RUNNING');
  await page.waitForTimeout(200);
  const targets = await page.evaluate(() => window.realGameForTest.targetRun.targets);
  assert.equal(targets.length, 10);
  const moved = await page.evaluate(() => window.realGameForTest.getSnapshot());
  assert.notDeepEqual(
    [moved.playerRow, moved.playerColumn],
    [before.playerRow, before.playerColumn]
  );
  await page.evaluate(() => {
    document.querySelector('#language-select').value = 'fr';
    document.querySelector('#language-select').dispatchEvent(new Event('change'));
  });
  const after = await page.evaluate(() => window.realGameForTest.getSnapshot());
  assert.deepEqual([after.playerRow, after.playerColumn], [moved.playerRow, moved.playerColumn]);
  assert.deepEqual(await page.evaluate(() => window.realGameForTest.targetRun.targets), targets);
  assert.ok(after.elapsedMs >= moved.elapsedMs);
  assert.equal(after.targetLayoutVersion, before.targetLayoutVersion);
  assert.equal(writes.length, 0);
  assert.ok(await page.locator('#game-canvas').evaluate((c) => c.width > 0 && c.height > 0));
  await mkdir(resolve(root,'test-artifacts/share'),{recursive:true});
  await page.screenshot({path:resolve(root,`test-artifacts/share/${type.name()}-actual-game.png`)});
  await page.click('#retire-button');
  await page.waitForSelector('#result-screen:not([hidden])');
  assert.equal(await page.getAttribute('#app', 'data-result-type'), 'retired');
  assert.ok(
    writes.every((url) => url.includes('/games?')),
    'retirement does not create score/telemetry writes'
  );
  assert.deepEqual(errors, []);
  console.log(
    `${type.name()}: actual Three.js scene, anonymous start, directional movement, language without reset, retirement passed`
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
