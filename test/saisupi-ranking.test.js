import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RankingClient,
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

test('既存RPCでプレイ開始、スコア登録、上位10件を取得する', async () => {
  const calls = [];
  const client = new RankingClient({
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test_key_123456789',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/record_game_play')) {
        return response({
          accepted: true,
          game_slug: 'saisupi',
          display_name: 'テスト',
          result_type: 'play'
        });
      }
      if (url.endsWith('/submit_score')) {
        return response([{
          accepted: true,
          result_display_name: 'テスト',
          result_best_score: 1234,
          result_play_count: 2,
          is_first_play: false,
          is_new_best: true
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
  assert.deepEqual(await client.submitScore({ displayName: 'テスト', score: 1234 }), {
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
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.headers.apikey, 'sb_publishable_test_key_123456789');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer sb_publishable_test_key_123456789');
  assert.equal(JSON.parse(calls[0].options.body).p_client_version, RANKING_CLIENT_VERSION);
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
    () => client.submitScore({ displayName: 'テスト', score: -1 }),
    /score must be/
  );
  assert.equal(RANKING_LIMIT, 10);
});
