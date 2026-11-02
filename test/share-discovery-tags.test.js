import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,setLanguage} from '../js/i18n/index.js';
import {createHomeShareContent,createResultShareContent,shareResult} from '../js/saisupi-share.js';
const pageUrl='https://chameleonjp-lab.github.io/saisupi/';
for(const [language] of LANGUAGES) test(`${language}: official tags reach composer and fit the weighted limit`,async()=>{
 setLanguage(language);
 try {
  const contents=[createHomeShareContent({pageUrl}),... [0,1234,2147483647,null].map(scoreCentiseconds=>createResultShareContent({pageUrl,result:{scoreCentiseconds}}))];
  for(const content of contents){
   assert.match(content.text,/(?:^|\s)#サイスピ(?:\s|$)/u);assert.match(content.text,/(?:^|\s)#ゲーム制作(?:\s|$)/u);
   assert.equal((content.text.match(/#サイスピ/gu)||[]).length,1);assert.equal((content.text.match(/#ゲーム制作/gu)||[]).length,1);
   const weight=[...content.text.replace(pageUrl,'x'.repeat(23))].reduce((n,c)=>n+(c.codePointAt(0)<=0x10ff?1:2),0);assert.ok(weight<=280,`${language}: ${weight}`);
   let intent;await shareResult(content,{}, {open:url=>{intent=new URL(url);return {opener:null};}});
   assert.equal(intent.searchParams.get('text'),content.text);assert.equal(content.copyText,content.text);
  }
 } finally {setLanguage('ja');}
});
