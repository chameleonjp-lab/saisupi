import test from 'node:test';import assert from 'node:assert/strict';
import {parseSubmitResponse} from '../js/saisupi-ranking.js';
const expected={displayName:'Alice',gameSlug:'saisupi',score:12};
const row={accepted:true,result_display_name:'Alice',result_normalized_name:'Alice',result_first_score:12,result_best_score:12,result_play_count:1,is_first_play:true,is_new_best:true,was_duplicate:false};
test('normal receipt rejects missing first score and mismatched normalized owner',()=>{
 for(const patch of [{result_first_score:undefined},{result_first_score:'12'},{result_normalized_name:'Other'}])assert.throws(()=>parseSubmitResponse([{...row,...patch}],expected));
 assert.equal(parseSubmitResponse([row],expected).accepted,true);
});


import {RankingClient} from '../js/saisupi-ranking.js';
import {submitDurableResult} from '../js/saisupi-result.js';
import {readOutbox} from '../js/saisupi-outbox.js';
test('invalid SQL integer or ascending best keeps durable result retryable',async()=>{
 for(const patch of [{result_first_score:2147483648},{result_first_score:-2147483649},{result_play_count:2147483648},{result_best_score:1235}]){
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),get length(){return data.size},key:i=>[...data.keys()][i]};
  const run={displayName:'Alice',submissionId:crypto.randomUUID(),clientVersion:'v'};
  const result={phase:'FINISHED',retired:false,elapsedMs:12340,scoreCentiseconds:1234,completedTargetCount:10,targetCount:10,targetTimings:Array.from({length:10},(_,i)=>({index:i+1,completed:true,scoreCentiseconds:i===9?1234:i*100}))};
  let invalid=true;const requests=[];const client=new RankingClient({url:'https://example.supabase.co',publishableKey:'sb_publishable_test_key_123456789',fetchImpl:async(url,opts)=>{if(url.includes('/rest/v1/games?'))return{ok:true,json:async()=>[{game_slug:'saisupi',is_active:true,score_order:'asc'}]};requests.push(JSON.parse(opts.body));return{ok:true,json:async()=>[{accepted:true,result_normalized_name:'Alice',result_display_name:'Alice',result_first_score:0,result_best_score:1234,result_play_count:1,is_first_play:true,is_new_best:true,was_duplicate:!invalid,...(invalid?patch:{})}]};}});
  await assert.rejects(submitDurableResult(storage,run,result,client),undefined,JSON.stringify(patch));assert.equal(readOutbox(storage).length,1);
  invalid=false;await submitDurableResult(storage,run,result,client);assert.equal(readOutbox(storage).length,0);assert.deepEqual(requests[0],requests[1]);
 }
});
