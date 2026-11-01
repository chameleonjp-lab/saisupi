import test from 'node:test';import assert from 'node:assert/strict';
import {parseSubmitResponse} from '../js/saisupi-ranking.js';
const expected={displayName:'Alice',gameSlug:'saisupi',score:12};
const row={accepted:true,result_display_name:'Alice',result_normalized_name:'Alice',result_first_score:12,result_best_score:12,result_play_count:1,is_first_play:true,is_new_best:true,was_duplicate:false};
test('normal receipt rejects missing first score and mismatched normalized owner',()=>{
 for(const patch of [{result_first_score:undefined},{result_first_score:'12'},{result_normalized_name:'Other'}])assert.throws(()=>parseSubmitResponse([{...row,...patch}],expected));
 assert.equal(parseSubmitResponse([row],expected).accepted,true);
});
