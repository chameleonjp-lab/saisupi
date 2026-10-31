import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createHomeShareContent,
  createResultShareContent,
  RESULT_SHARE_STATUSES,
  shareResult
} from '../js/saisupi-share.js';

test('ホーム共有文は指定された3行をそのまま本文にする', () => {
  const content = createHomeShareContent({
    pageUrl: 'https://chameleonjp-lab.github.io/saisupi/?from=test#home'
  });
  assert.equal(content.url, 'https://chameleonjp-lab.github.io/saisupi/');
  assert.equal(content.text, [
    'サイスピ',
    'サイコロを転がし、10個の目を揃えるタイムアタックゲーム',
    'https://chameleonjp-lab.github.io/saisupi/'
  ].join('\n'));
  assert.doesNotMatch(content.text, /URL:|#サイスピ/u);
  assert.equal(content.copyText, content.text);
});

test('結果共有文はスコアとテキストURLの2行にする', () => {
  const content = createResultShareContent({
    pageUrl: 'https://chameleonjp-lab.github.io/saisupi/',
    result: {
      scoreCentiseconds: 10418
    }
  });
  assert.equal(content.text, [
    'サイスピを 104.18秒 でクリア',
    'https://chameleonjp-lab.github.io/saisupi/'
  ].join('\n'));
  assert.doesNotMatch(content.text, /URL:|#サイスピ/u);
});

test('Xへ本文と改行・記号を正確に渡し、投稿完了とは扱わない', async () => {
  let opened;
  const text = 'サイスピ & #\nhttps://example.test/saisupi/';
  const status = await shareResult({text, copyText:text}, {}, {
    open(url) { opened=url; return {opener:{}}; }
  });
  assert.equal(status, RESULT_SHARE_STATUSES.SHARED);
  assert.equal(new URL(opened).searchParams.get('text'), text);
  assert.equal(new URL(opened).origin, 'https://x.com');
});
test('ポップアップが開けない場合に本文をコピーする', async () => {
  let copied;
  const status = await shareResult({text:'text',copyText:'text'}, {clipboard:{async writeText(text){copied=text;}}}, {open(){return null;}});
  assert.equal(status,RESULT_SHARE_STATUSES.COPIED);
  assert.equal(copied,'text');
});
