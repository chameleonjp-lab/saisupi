import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createHomeShareContent,
  createResultShareContent,
  RESULT_SHARE_STATUSES,
  shareResult
} from '../js/saisupi-share.js';

test('ホーム共有文はURLを本文のテキストとして含める', () => {
  const content = createHomeShareContent({
    pageUrl: 'https://chameleonjp-lab.github.io/saisupi/?from=test#home'
  });
  assert.equal(content.url, 'https://chameleonjp-lab.github.io/saisupi/');
  assert.match(content.text, /URL: https:\/\/chameleonjp-lab\.github\.io\/saisupi\//u);
  assert.equal(content.copyText, content.text);
});

test('結果共有文はスコア詳細とテキストURLを含める', () => {
  const content = createResultShareContent({
    pageUrl: 'https://chameleonjp-lab.github.io/saisupi/',
    recordMessage: '自己ベストを更新しました',
    result: {
      scoreCentiseconds: 1234,
      targetTimings: [
        { index: 1, elapsedMs: 3210 },
        { index: 10, elapsedMs: 12340 }
      ]
    }
  });
  assert.match(content.text, /12\.34秒/u);
  assert.match(content.text, /1:3\.21秒/u);
  assert.match(content.text, /10:12\.34秒/u);
  assert.match(content.text, /URL: https:\/\/chameleonjp-lab\.github\.io\/saisupi\//u);
});

test('共有APIへURLプロパティを渡さず、本文へ渡す', async () => {
  let shared = null;
  const status = await shareResult(
    { title: 'サイスピ', text: 'URL: https://example.test/saisupi/', copyText: 'copy' },
    {
      canShare: () => true,
      share: async (data) => { shared = data; }
    }
  );
  assert.equal(status, RESULT_SHARE_STATUSES.SHARED);
  assert.deepEqual(shared, {
    title: 'サイスピ',
    text: 'URL: https://example.test/saisupi/'
  });
});
