import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RankingClient,
  RankingError,
  RANKING_CLIENT_VERSION,
  RANKING_LIMIT
} from '../js/saisupi-ranking.js';

function response(data, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() { return data; }
  };
}

test('既存RPCでプレイ開始、スコア登録、上位30件を取得する', async () => {
  const calls = [];
  const client = new RankingClient({
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test_key_123456789',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/rest/v1/games?')) {
        return response([{
          game_slug: 'saisupi',
          is_active: true,
          score_order: 'asc'
        }]);
      }
      if (url.endsWith('/record_game_play')) {
        return response({
          accepted: true,
          game_slug: 'saisupi',
          display_name: 'テスト',
          result_type: 'play'
        });
      }
      if (url.endsWith('/submit_score_once_shared_v1')) {
        return response([{
          accepted: true,
          result_display_name: 'テスト',
          result_best_score: 1234,
          result_play_count: 2,
          is_first_play: false,
          is_new_best: true,
          was_duplicate: false
        }]);
      }
      return response([{ rank_no: 1, display_name: 'テスト', best_score: 1234, play_count: 2 }]);
    }
  });

  assert.deepEqual(await client.startPlay({ displayName: 'テスト' }), {
    started: true,
    gameSlug: 'saisupi',
    displayName: 'テスト'
  });
  assert.deepEqual(await client.submitScore({ displayName: 'テスト', score: 1234, submissionId: '00000000-0000-4000-8000-000000000001' }), {
    accepted: true,
    gameSlug: 'saisupi',
    displayName: 'テスト',
    submittedScore: 1234,
    bestScore: 1234,
    playCount: 2,
    isFirstPlay: false,
    isNewBest: true
  });
  assert.deepEqual(await client.getTopRanking(), [{
    rank: 1,
    displayName: 'テスト',
    score: 1234,
    playCount: 2,
    position: 1
  }]);
  assert.equal(calls.length, 4);
  assert.match(calls[0].url, /\/rest\/v1\/games\?/u);
  assert.equal(calls[1].options.headers.apikey, 'sb_publishable_test_key_123456789');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer sb_publishable_test_key_123456789');
  assert.equal(JSON.parse(calls[1].options.body).p_client_version, RANKING_CLIENT_VERSION);
});

test('ゲーム登録がないとランキング通信を開始しない', async () => {
  const calls = [];
  const client = new RankingClient({
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test_key_123456789',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response([]);
    }
  });

  await assert.rejects(
    () => client.getTopRanking(),
    (error) => {
      assert.ok(error instanceof RankingError);
      assert.equal(error.code, 'game-not-registered');
      assert.equal(error.status, 404);
      return true;
    }
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/games\?/u);
});

test('ランキングクライアントは不正な名前・スコアを送信しない', async () => {
  const client = new RankingClient({
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test_key_123456789',
    fetchImpl: async () => response([])
  });
  await assert.rejects(
    () => client.startPlay({ displayName: ' 名前' }),
    /displayName is invalid/
  );
  await assert.rejects(
    () => client.submitScore({ displayName: 'テスト', score: -1, submissionId: '00000000-0000-4000-8000-000000000001' }),
    /score must be/
  );
  assert.equal(RANKING_LIMIT, 30);
});

test('lost acknowledgement retries the exact receipt and never calls legacy submit', async()=>{
 const calls=[];let attempts=0;
 const client=new RankingClient({url:'https://example.supabase.co',publishableKey:'sb_publishable_test_key_123456789',fetchImpl:async(url,options)=>{
  if(url.includes('/games?'))return response([{game_slug:'saisupi',is_active:true,score_order:'asc'}]);
  calls.push({url,body:JSON.parse(options.body)});
  assert.ok(url.endsWith('/submit_score_once_shared_v1'));
  if(++attempts===1)throw Error('response lost');
  return response([{accepted:true,result_display_name:'開始名',result_best_score:1234,result_play_count:1,is_first_play:true,is_new_best:true,was_duplicate:true}]);
 }});
 const result=Object.freeze({displayName:'開始名',score:1234,submissionId:'00000000-0000-4000-8000-000000000001'});
 await assert.rejects(client.submitScore(result));await client.submitScore(result);
 assert.deepEqual(calls[0].body,calls[1].body);assert.equal(calls[0].body.p_submission_id,result.submissionId);
});
