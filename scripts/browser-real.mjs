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
  page.on('console', message => { if (/WebGL|THREE\./i.test(message.text())) console.log('renderer console', message.type(), message.text()); });
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
        `game = instance; window.realGameForTest = instance;
        const originalRender = instance.renderer.render.bind(instance.renderer);
        instance.renderer.render = (...args) => {
          const result = originalRender(...args);
          if(window.captureScenePixels) {
            window.captureScenePixels=false;
            const gl=instance.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
            const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            let opaque=0;const colors=new Set();
            for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>0){opaque++;colors.add([pixels[i]>>4,pixels[i+1]>>4,pixels[i+2]>>4].join(','));}
            window.scenePixelEvidence={width,height,opaque,colors:colors.size,frame:instance.renderer.info.render.frame};
          }
          return result;
        };`
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
  await mkdir(resolve(root,'test-artifacts/share'),{recursive:true});
  const sceneEvidence = async (label) => {
    // Wait for actual layout stability and a subsequent real draw, never force rendering.
    await page.evaluate(async()=>{
      let previous='',stable=0;
      for(let frame=0;frame<120;frame++){
        await new Promise(requestAnimationFrame);
        const c=document.querySelector('#game-canvas'),r=c.getBoundingClientRect();
        const current=JSON.stringify([r.x,r.y,r.width,r.height,c.width,c.height]);
        stable=current===previous?stable+1:0;previous=current;
        if(stable>=2)break;
        if(frame===119)throw new Error('Canvas layout did not stabilize');
      }
      window.scenePixelEvidence=null;window.captureScenePixels=true;
    });
    await page.waitForFunction(()=>window.scenePixelEvidence!==null);
    const pixels=await page.evaluate(()=>window.scenePixelEvidence);
    assert.ok(pixels.opaque>pixels.width*pixels.height*.01&&pixels.colors>12,`real rendered scene pixels ${JSON.stringify(pixels)}`);
    const state=await page.evaluate(()=>{const g=window.realGameForTest,c=document.querySelector('#game-canvas'),r=c.getBoundingClientRect(),s=getComputedStyle(c);return {renderActive:g.renderActive,isVisible:g.isVisible,contextLost:g.contextLost,disposed:g.disposed,frameId:g.frameId,renderInfo:g.renderer.info.render,glContextLost:g.renderer.getContext().isContextLost(),canvas:{width:c.width,height:c.height,rect:{x:r.x,y:r.y,width:r.width,height:r.height},display:s.display,visibility:s.visibility,opacity:s.opacity},snapshot:g.getSnapshot()};});
    console.log('scene diagnostic',label,JSON.stringify(state));
    await page.screenshot({path:resolve(root,`test-artifacts/share/${type.name()}-actual-${label}.png`)});
  };
  await sceneEvidence('before-language');
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
  await sceneEvidence('game');
  await page.setViewportSize({width:1200,height:800});
  await page.evaluate(()=>{const selector=document.querySelector('#language-select');selector.value='ja';selector.dispatchEvent(new Event('change'));});
  await sceneEvidence('thumbnail-source');
  await page.locator('#game-canvas').screenshot({path:resolve(root,`test-artifacts/share/${type.name()}-thumbnail-canvas.png`)});
  await page.setViewportSize({width:402,height:874});
  await page.evaluate(()=>{const selector=document.querySelector('#language-select');selector.value='fr';selector.dispatchEvent(new Event('change'));});
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
