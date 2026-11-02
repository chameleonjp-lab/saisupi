// UI/state integration fixture. The 3D renderer is replaced, never production data.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium, webkit } from 'playwright';
import {isolateBrowserNetwork} from './browser-network-safety.mjs';
import {checkAncestorDetection,checkShareTarget} from './share-visibility-check.mjs';
import { LANGUAGES, CATALOGS } from '../js/i18n/index.js';
const root = resolve(new URL('..', import.meta.url).pathname);
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + '/')) {
    res.writeHead(403).end();
    return;
  }
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
const browser = await type.launch();
const fixture = `export class WebGLSaisupi {
 constructor(canvas,callbacks){this.callbacks=callbacks;this.snapshot={phase:'RUNNING',elapsedMs:12340,scoreCentiseconds:1234,completedTargetCount:0,targetCount:10,targetTimings:[]};window.fixture=this;}
 setActive(value){this.active=value;}getSnapshot(){return this.snapshot;}dispose(){}resize(){}reset(){this.snapshot={...this.snapshot,scoreCentiseconds:1234,completedTargetCount:0};}setSize(){}
 finish(){this.snapshot={...this.snapshot,elapsedMs:this.snapshot.scoreCentiseconds*10,phase:'FINISHED',completedTargetCount:10,targetTimings:Array.from({length:10},(_,i)=>({index:i+1,completed:true,scoreCentiseconds:i===9?this.snapshot.scoreCentiseconds:Math.floor(this.snapshot.scoreCentiseconds*(i+1)/10)}))};this.callbacks.onFinished({snapshot:this.snapshot});}
}`;
try {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
    locale: 'ja-JP',
    serviceWorkers:'block'
  });
  await isolateBrowserNetwork(context, `http://127.0.0.1:${server.address().port}`);
  await context.route('**/js/webgl-support.js', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: 'export const checkWebGL2Support=()=>({available:true});'
    })
  );
  await context.route('**/js/webgl-game.js', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: fixture })
  );
  const writes = [],
    reads = [],
    receipts = new Map();
  let loseAck = false;
  await context.route('https://*.supabase.co/**', async (r) => {
    const req = r.request();
    if (req.method() === 'GET') {
      await r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{ game_slug: 'saisupi', is_active: true, score_order: 'asc' }])
      });
      return;
    }
    const rpc = req.url().split('/').at(-1),
      data = req.postDataJSON();
    let response;
    if (rpc === 'get_best_score_ranking') {
      reads.push(data);
      response = Array.from({ length: 30 }, (_, i) => ({
        rank_no: i < 2 ? 1 : i + 1,
        display_name: i === 0 ? '<img src=x>' : `Player${i + 1}`,
        best_score: 1200 + i,
        play_count: 1
      }));
    } else if (rpc === 'record_game_play') {
      writes.push({ rpc, data });
      response = {
        accepted: true,
        game_slug: 'saisupi',
        display_name: data.p_display_name,
        result_type: 'play'
      };
    } else if (rpc === 'submit_score_once_shared_v1') {
      writes.push({ rpc, data });
      if (receipts.has(data.p_submission_id))
        assert.deepEqual(data, receipts.get(data.p_submission_id));
      else receipts.set(data.p_submission_id, data);
      if (loseAck) {
        loseAck = false;
        await r.fulfill({ status: 503, body: '{}' });
        return;
      }
      response = [
        {
          accepted: true,
          result_display_name: data.p_display_name,
          result_normalized_name: data.p_display_name,result_first_score:data.p_score,
          result_best_score: data.p_score,
          result_play_count: 1,
          is_first_play: true,
          is_new_best: true,
          was_duplicate: true
        }
      ];
    } else throw Error(`Unexpected write ${rpc}`);
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.shared = [];
    window.open = (value) => {
      window.shared.push(value);
      return { opener: null };
    };
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);
  await page.waitForFunction(
    () => document.querySelector('#language-select').options.length === 15
  );
  await checkAncestorDetection(page);
  for (const [lang] of LANGUAGES) {
    await page.selectOption('#language-select', lang);
    assert.equal(await page.textContent('#start-button'), CATALOGS[lang]['ゲームを始める']);
    assert.equal(await page.textContent('#home-lab-link'), CATALOGS[lang]['ランキング']);
    await checkShareTarget(page,'#home-share-button',{language:lang,screen:'home',engine:type.name()});
    assert.ok(
      (await page.evaluate(() => new URL(window.shared.at(-1)).searchParams.get('text'))).includes(
        CATALOGS[lang]['サイコロを転がし、10個の目を揃えるタイムアタックゲーム']
      )
    );
    await page.fill('#player-name-input', '   ');
    await page.click('#start-button');
    await page.waitForFunction(() => window.fixture?.active);
    const before = await page.evaluate(() => window.fixture.getSnapshot());
    await page.evaluate(() =>
      document.querySelector('#language-select').dispatchEvent(new Event('change'))
    );
    assert.deepEqual(
      await page.evaluate(() => window.fixture.getSnapshot()),
      before,
      'language changes do not reset a question, timer or score'
    );
    await page.evaluate(() => window.fixture.finish());
    await page.waitForFunction(
      () => document.querySelectorAll('#result-ranking-list .ranking-name').length === 30
    );
    assert.equal(
      writes.length,
      0,
      'anonymous result never records a public score or changes old telemetry'
    );
    assert.equal(await page.locator('#result-ranking-list img').count(), 0);
    assert.equal(await page.locator('#result-ranking-list li strong').nth(1).textContent(), '1.');
    await checkShareTarget(page,'#result-share-button',{language:lang,screen:'result',engine:type.name()});
    assert.ok(
      (await page.evaluate(() => new URL(window.shared.at(-1)).searchParams.get('text'))).includes(
        'https://chameleonjp-lab.github.io/saisupi/'
      )
    );
    await page.click('#result-home-button');
  }
  await page.fill('#player-name-input', '後の名前');
  await page.click('#last-result-button');
  await page.waitForFunction(
    () => document.querySelectorAll('#result-ranking-list .ranking-name').length === 30
  );
  assert.equal(writes.length, 0);
  await page.click('#result-home-button');
  await page.selectOption('#language-select', 'ja');
  await page.fill('#player-name-input', '開始名');
  await page.click('#start-button');
  await page.waitForFunction(() => window.fixture?.active);
  loseAck = true;
  await page.evaluate(() => {
    document.querySelector('#player-name-input').value = '変更後';
    window.fixture.finish();
  });
  await page.waitForSelector('#result-ranking-retry:not([hidden])');
  // A second failed play must not overwrite the first pending receipt.
  await page.click('#result-home-button');
  await page.fill('#player-name-input','別の名前');
  await page.click('#start-button');
  await page.waitForFunction(()=>window.fixture?.active);
  loseAck=true;
  await page.evaluate(()=>{window.fixture.snapshot.scoreCentiseconds=2345;window.fixture.finish();});
  await page.waitForSelector('#result-ranking-retry:not([hidden])');
  await page.click('#result-home-button');
  assert.equal(await page.locator('#pending-results button').count(),2);
  await page.fill('#player-name-input','');
  await page.locator('#pending-results button').filter({hasText:'12.34'}).click();
  await page.waitForFunction(() =>
    document.querySelector('#result-record-message').textContent.includes('登録しました')
  );
  assert.equal(receipts.size, 2);
  assert.ok([...receipts.values()].some(value=>value.p_display_name==='開始名'&&value.p_score===1234));
  assert.ok([...receipts.values()].some(value=>value.p_display_name==='別の名前'&&value.p_score===2345));
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('saisupi.pending-submissions.v1:') && !JSON.parse(localStorage.getItem(key)).acknowledged).length),1);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('saisupi.pending-submissions.v1:') && JSON.parse(localStorage.getItem(key)).acknowledged).length),1);
  const sent = writes.length;
  await page.evaluate(() => {
    document.querySelector('#language-select').value = 'en';
    document.querySelector('#language-select').dispatchEvent(new Event('change'));
  });
  assert.equal(writes.length, sent);
  await page.reload();
  await page.click('#last-result-button');
  await page.waitForFunction(
    () => document.querySelectorAll('#result-ranking-list .ranking-name').length === 30
  );
  assert.equal(receipts.size, 2);
  assert.equal(
    writes.filter((x) => x.rpc === 'record_game_play').length,
    2,
    'restoring a result does not repeat start telemetry'
  );
  assert.equal(await page.textContent('#result-player-name'), '開始名');
  assert.ok(reads.every((x) => x.p_limit === 30));
  await page.click('#result-home-button');
  await page.click('#sound-toggle');
  await page.locator('#sound-volume').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.reload();
  assert.equal(await page.getAttribute('#sound-toggle', 'aria-pressed'), 'false');
  assert.equal(await page.inputValue('#sound-volume'), '0');
  assert.equal(await page.inputValue('#language-select'), 'en');
  for (const size of [
    { width: 320, height: 568 },
    { width: 874, height: 402 }
  ]) {
    await page.setViewportSize(size);
    await page.locator('#home-share-button').scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true
    );
  }
  await page.setViewportSize({width:402,height:874});
  await page.selectOption('#language-select','ja');
  await page.fill('#player-name-input','保存試験');await page.click('#start-button');
  await page.waitForFunction(()=>window.fixture?.active);
  const scoreCount=writes.filter(x=>x.rpc==='submit_score_once_shared_v1').length;
  await page.evaluate(()=>{window.saveSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('saisupi.pending'))throw Error('quota');return window.saveSetItem.call(this,k,v)};window.fixture.finish()});
  await page.waitForSelector('#result-ranking-retry:not([hidden])');
  assert.equal(writes.filter(x=>x.rpc==='submit_score_once_shared_v1').length,scoreCount);
  assert.equal(await page.locator('#result-save-warning').isVisible(),true);
  await page.evaluate(()=>{Storage.prototype.setItem=window.saveSetItem});
  await page.click('#result-ranking-retry');
  await page.waitForFunction(()=>document.querySelector('#result-record-message').textContent.includes('登録しました'));
  assert.equal(await page.locator('#result-save-warning').isVisible(),false);
  assert.equal(writes.filter(x=>x.rpc==='submit_score_once_shared_v1').length,scoreCount+1);
  await page.reload();await page.click('#last-result-button');
  await page.waitForFunction(()=>document.querySelectorAll('#result-ranking-list .ranking-name').length===30);
  assert.equal(writes.filter(x=>x.rpc==='submit_score_once_shared_v1').length,scoreCount+1);
  assert.deepEqual(errors, []);
  console.log(
    `${type.name()}: all15 UI/share fixtures, anonymous/name snapshot/lost ACK/reload, top30 ties, safe text, off/0 and language persistence passed; 3D renderer simulated`
  );
  await context.close();
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
