import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('OG and Twitter use the same actual-scene 1200 by 630 PNG',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const url='https://chameleonjp-lab.github.io/saisupi/assets/saisupi-og-v3.png';
 for(const attribute of ['property="og:image"','name="twitter:image"'])assert.ok(html.includes(`${attribute} content="${url}"`));
 assert.ok(html.includes('property="og:image:type" content="image/png"'));
 assert.ok(html.includes('property="og:image:width" content="1200"'));assert.ok(html.includes('property="og:image:height" content="630"'));
 assert.doesNotMatch(html,/<button[^>]*(?:id="[^"]*copy|>[^<]*コピー)/i);
 assert.ok(html.includes('id="home-share-fallback"'));assert.ok(html.includes('id="result-share-fallback"'));
 assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
 const png=readFileSync(new URL('../assets/saisupi-og-v3.png',import.meta.url));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
 const svg=readFileSync(new URL('../assets/saisupi-og-v3.svg',import.meta.url),'utf8');
 assert.ok(svg.includes('サイスピ'));assert.ok(svg.includes('data:image/png;base64,'));
 assert.doesNotMatch(svg,/<script|https?:\/\/(?!www\.w3\.org)/i);
});
