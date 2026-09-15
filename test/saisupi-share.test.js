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

test('共有APIへURLプロパティを渡さず、本文へ渡す', async () => {
  let shared = null;
  const status = await shareResult(
    { title: 'サイスピ', text: 'サイスピ\nhttps://example.test/saisupi/', copyText: 'copy' },
    {
      canShare: () => true,
      share: async (data) => { shared = data; }
    }
  );
  assert.equal(status, RESULT_SHARE_STATUSES.SHARED);
  assert.deepEqual(shared, {
    title: 'サイスピ',
    text: 'サイスピ\nhttps://example.test/saisupi/'
  });
});
