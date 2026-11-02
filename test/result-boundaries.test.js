import test from 'node:test';import assert from 'node:assert/strict';import {validResult,submitDurableResult} from '../js/saisupi-result.js';
const result={phase:'FINISHED',retired:false,elapsedMs:12340,scoreCentiseconds:1234,completedTargetCount:10,targetCount:10,targetTimings:Array.from({length:10},(_,i)=>({index:i+1,completed:true,scoreCentiseconds:i===9?1234:i*100}))};
test('completed snapshots reject altered score, count, timing and nonfinish phase',()=>{
 assert.equal(validResult(result),true);
 for(const patch of [{scoreCentiseconds:1},{completedTargetCount:9},{phase:'RUNNING'},{targetTimings:[]},{elapsedMs:-1}])assert.equal(validResult({...result,...patch}),false);
});
test('failed durable save prevents public score request',async()=>{
 let calls=0;const run={displayName:'A',submissionId:crypto.randomUUID(),clientVersion:'v1'};
 await assert.rejects(submitDurableResult({getItem:()=>null,setItem(){throw Error('quota')}},run,result,{submitScore(){calls++}}));assert.equal(calls,0);
});
