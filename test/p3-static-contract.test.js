import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const index = read('index.html');
const main = read('js/main.js');
const game = read('js/webgl-game.js');
const sound = read('js/saisupi-sound-effects.js');

test('P4のホーム・結果画面に共有、再プレイ、ランキング、実験場導線がある', () => {
  for (const id of [
    'home-share-button',
    'home-lab-link',
    'retire-button',
    'result-screen',
    'result-detail-list',
    'result-ranking-list',
    'result-ranking-retry',
    'replay-button',
    'result-replay-button',
    'result-share-button',
    'result-home-button',
    'result-lab-link'
  ]) assert.match(index, new RegExp(`id="${id}"`, 'u'));
  assert.match(index, /chameleonjp-lab\.github\.io\/chameleonjp_lab\//u);
  assert.match(index, /class="home-steps"/u);
  assert.match(index, /og:image.*saisupi-og\.jpg/us);
});

test('一致時の光柱とテッテレーSEは3秒の成功イベントへ接続する', () => {
  assert.match(game, /startLightPillar\(target, landedAt\)/u);
  assert.match(game, /LIGHT_PILLAR_DURATION/u);
  assert.match(game, /updateLightPillars\(now\)/u);
  assert.match(game, /targetHaloMaterial/u);
  assert.match(game, /mesh\.position\.y = state\.height \/ 2/u);
  assert.match(main, /soundEffects\.playClear\(\)/u);
  assert.match(sound, /\[392, 523\.25, 659\.25\]/u);
});

test('開始記録と結果スコア送信は既存Supabase RPCを使う', () => {
  assert.match(main, /startPlayRecording/u);
  assert.match(main, /rankingClient\.startPlay/u);
  assert.match(main, /rankingClient\.submitScore/u);
  assert.match(main, /rankingClient\.getTopRanking/u);
  assert.match(main, /retireGame/u);
  assert.match(main, /resultReplayButton/u);
  assert.match(main, /selectstart/u);
  assert.match(main, /paste/u);
  assert.match(main, /event\.preventDefault\(\)/u);
});
