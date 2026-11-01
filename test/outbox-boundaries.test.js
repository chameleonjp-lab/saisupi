import test from 'node:test';import assert from 'node:assert/strict';import {queueResult,readOutbox,acknowledgeResult,OUTBOX_KEY} from '../js/saisupi-outbox.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('acknowledged UUID cannot be queued again; silent storage rejection is detected', () => {
  const values = new Map();
  const storage = { getItem:k=>values.get(k)??null, setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k), get length(){return values.size}, key:i=>[...values.keys()][i] };
  const run={displayName:'A',submissionId:id(81),clientVersion:'v1'};
  queueResult(storage,run,{scoreCentiseconds:10}); acknowledgeResult(storage,run.submissionId);
  queueResult(storage,run,{scoreCentiseconds:10});
  assert.equal(readOutbox(storage).length,0);
  assert.throws(()=>queueResult({...storage,setItem(){}},{...run,submissionId:id(82)},{scoreCentiseconds:11}),/persist|Storage|save/i);
});

test('one malformed receipt is preserved without blocking valid sibling results', () => {
 const values = new Map([[OUTBOX_KEY+':'+id(90),'{broken']]);
 const storage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),get length(){return values.size},key:i=>[...values.keys()][i]};
 const run={displayName:'B',submissionId:id(91),clientVersion:'v1'};
 queueResult(storage,run,{scoreCentiseconds:20});
 assert.equal(readOutbox(storage).length,1);
 assert.equal(values.get(OUTBOX_KEY+':'+id(90)),'{broken');
 assert.throws(()=>queueResult(storage,{...run,submissionId:id(90)},{scoreCentiseconds:20}));
});
test('a quota-failed play remains available in memory when a later play saves',()=>{
 const map=new Map();let fail=true;
 const storage={getItem:k=>map.get(k)??null,setItem(k,v){if(fail)throw Error('quota');map.set(k,v)},get length(){return map.size},key:i=>[...map.keys()][i]};
 const run=n=>({displayName:'A',submissionId:id(n),clientVersion:'v1'});
 assert.throws(()=>queueResult(storage,run(95),{scoreCentiseconds:1}));fail=false;
 queueResult(storage,run(96),{scoreCentiseconds:2});
 assert.equal(readOutbox(storage).length,2);
 queueResult(storage,run(95),{scoreCentiseconds:1});
 assert.ok(map.has(OUTBOX_KEY+':'+id(95)));
});
test('same UUID with altered result metadata is rejected before sending',()=>{
 const map=new Map();const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),get length(){return map.size},key:i=>[...map.keys()][i]};
 const run={displayName:'A',submissionId:id(97),clientVersion:'v1'};
 queueResult(storage,run,{scoreCentiseconds:1,elapsedMs:10});const raw=map.get(OUTBOX_KEY+':'+id(97));
 assert.throws(()=>queueResult(storage,run,{scoreCentiseconds:1,elapsedMs:11}),/conflict/i);assert.equal(map.get(OUTBOX_KEY+':'+id(97)),raw);
});
test('broken legacy document preserves raw and allows listing healthy per-play receipt',()=>{
 const run={displayName:'A',submissionId:id(98),clientVersion:'v1'};const map=new Map([[OUTBOX_KEY,'{broken'],[OUTBOX_KEY+':'+id(98),JSON.stringify({run,result:{scoreCentiseconds:1}})]]);
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),get length(){return map.size},key:i=>[...map.keys()][i]};
 assert.equal(readOutbox(storage).length,1);assert.equal(map.get(OUTBOX_KEY),'{broken');
 assert.throws(()=>queueResult(storage,run,{scoreCentiseconds:1}),/legacy|outbox|JSON/i);
});
