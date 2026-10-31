import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOGS,
  LANGUAGES,
  t,
  resolveLanguage,
  setLanguage,
  formatTime
} from '../js/i18n/index.js';
import { createHomeShareContent, createResultShareContent } from '../js/saisupi-share.js';
const keys = Object.keys(CATALOGS.ja).sort();
test('all15 catalogs cover every visible message and preserve placeholders', () => {
  assert.equal(LANGUAGES.length, 15);
  for (const [lang] of LANGUAGES) {
    const catalog = CATALOGS[lang];
    assert.deepEqual(Object.keys(catalog).sort(), keys, lang);
    for (const key of keys) {
      assert.equal(typeof catalog[key], 'string');
      assert.ok(catalog[key].trim());
      assert.deepEqual(
        catalog[key].match(/\{\w+\}/g)?.sort() ?? [],
        key.match(/\{\w+\}/g)?.sort() ?? [],
        `${lang}: ${key}`
      );
    }
    assert.equal(
      t('{name}のプレイ', { name: '<img>日本語玩家' }, lang).includes('<img>日本語玩家'),
      true
    );
  }
});
test('saved language precedes browser aliases; unknown browser uses English', () => {
  assert.equal(resolveLanguage('de', { languages: ['ja-JP'] }), 'de');
  for (const [tag, lang] of [
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'],
    ['pt-PT', 'pt-BR'],
    ['en-US', 'en'],
    ['ko-KR', 'ko']
  ])
    assert.equal(resolveLanguage(null, { language: tag }), lang);
  assert.equal(resolveLanguage(null, { language: 'ar' }), 'en');
});
test('all languages share the finalized current result and canonical URL without identity', () => {
  try {
    for (const [lang] of LANGUAGES) {
      setLanguage(lang);
      const result = createResultShareContent({
        result: { scoreCentiseconds: 1234 },
        pageUrl: 'https://chameleonjp-lab.github.io/saisupi/?debug=1#test'
      });
      assert.ok(result.text.includes(formatTime(1234)));
      assert.ok(result.text.includes('https://chameleonjp-lab.github.io/saisupi/'));
      assert.ok(!result.text.includes('debug'));
      assert.notEqual(result.text, createHomeShareContent({ pageUrl: result.url }).text);
    }
  } finally {
    setLanguage('ja');
  }
});

test('explicit script language wins over region and unknown keys stay literal',()=>{
 assert.equal(resolveLanguage(null,{language:'zh-Hans-TW'}),'zh-Hans');
 assert.equal(t('toString'),'toString');assert.equal(t('__proto__'),'__proto__');
});
