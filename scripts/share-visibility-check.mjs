import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

function measure(element){
 const r=element.getBoundingClientRect(),s=getComputedStyle(element);let opacity=1,visible=true;
 for(let n=element;n;n=n.parentElement){const c=getComputedStyle(n);opacity*=Number(c.opacity);if(n.hidden||c.display==='none'||['hidden','collapse'].includes(c.visibility))visible=false;}
 const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
 return {width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,vw:innerWidth,vh:innerHeight,hit:hit===element||element.contains(hit),opacity,visible,color:s.color,background:s.backgroundColor,disabled:element.disabled,label:element.textContent.trim(),clipped:element.scrollWidth>element.clientWidth+1||element.scrollHeight>element.clientHeight+1};
}
export async function checkAncestorDetection(page){
 const button=page.locator('#home-share-button');
 for(const [property,value] of [['opacity','0'],['display','none']]){
  const old=await button.evaluate((el,[p,v])=>{const old=el.parentElement.style[p];el.parentElement.style[p]=v;return old;},[property,value]);
  try {const m=await button.evaluate(measure);assert.ok(m.opacity===0||!m.visible,`hidden ${property} must be detected`);}
  finally {await button.evaluate((el,[p,v])=>{el.parentElement.style[p]=v;},[property,old]);}
 }
}
export async function checkShareTarget(page,selector,{language,screen,engine,source='fixture'}){
 const sizes=['ja','en','de'].includes(language)?[{width:402,height:874},{width:874,height:402},{width:402,height:600}]:[{width:402,height:874}];
 const directory=resolve(new URL('../test-artifacts/share/',import.meta.url).pathname);await mkdir(directory,{recursive:true});
 for(const size of sizes){
  await page.setViewportSize(size);const button=page.locator(selector);await button.scrollIntoViewIfNeeded();const m=await button.evaluate(measure);
  assert.equal(await button.isVisible(),true);assert.equal(m.visible,true);assert.equal(m.opacity,1);assert.equal(m.disabled,false);assert.equal(m.hit,true);
  assert.ok(m.width>=44&&m.height>=44,`44px ${JSON.stringify(m)}`);assert.ok(m.left>=0&&m.right<=m.vw+1&&m.top>=0&&m.bottom<=m.vh+1,'viewport reachable');assert.equal(m.clipped,false,'complete label fits');
  assert.equal(m.background,'rgb(0, 0, 0)');assert.equal(m.color,'rgb(255, 255, 255)');assert.ok(m.label);if(language==='ja')assert.equal(m.label,'Xでシェア');
  await button.focus();assert.equal(await button.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');
  await page.mouse.move((m.left+m.right)/2,(m.top+m.bottom)/2);await page.mouse.down();const pressed=await button.evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));
  if(['ja','en','de'].includes(language))await page.screenshot({path:resolve(directory,`${engine}-${source}-${language}-${screen}-${size.width}x${size.height}-pressed.png`)});
  await page.mouse.move(0,0);await page.mouse.up();assert.equal(pressed.background,'rgb(0, 0, 0)');assert.equal(pressed.color,'rgb(255, 255, 255)');
  const before=await page.evaluate(()=>window.shared.length);await button.tap();await page.waitForFunction(n=>window.shared.length===n+1,before);
  const intent=new URL(await page.evaluate(()=>window.shared.at(-1)));assert.equal(intent.origin,'https://x.com');assert.equal(intent.pathname,'/intent/post');
  const text=intent.searchParams.get('text');assert.ok(text.includes('https://chameleonjp-lab.github.io/saisupi/'));assert.match(text,/#サイスピ #ゲーム制作/u);
  if(screen==='result')assert.ok(text.includes(await page.locator('#result-score').textContent()),'shares current result, not best');
  if(['ja','en','de'].includes(language))await page.screenshot({path:resolve(directory,`${engine}-${source}-${language}-${screen}-${size.width}x${size.height}.png`)});
 }
}
