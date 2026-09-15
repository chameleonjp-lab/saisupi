import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const index = read('index.html');
const style = read('css/style.css');
const main = read('js/main.js');
const game = read('js/webgl-game.js');

test('効果音ボタンはゲーム画面のときだけ表示する', () => {
  assert.match(index, /id="sound-toggle"/u);
  assert.match(style, /\.app-footer\s*\{[\s\S]*display:\s*none/u);
  assert.match(style, /\.app\[data-screen="playing"\]\s*~\s*\.app-footer\s*\{[\s\S]*display:\s*flex/u);
  assert.match(main, /app\.dataset\.screen\s*=\s*'playing'/u);
  assert.match(main, /app\.dataset\.screen\s*=\s*'result'/u);
});

test('10個目は成功演出を出さず、結果画面へ直ちに進む', () => {
  assert.match(game, /if \(!finished\) this\.startLightPillar\(target, landedAt\)/u);
  assert.match(main, /onTargetHit:\s*\(\{ finished, snapshot \}\)/u);
  assert.match(main, /if \(!finished\) soundEffects\.playClear\(\)/u);
  assert.match(main, /onFinished:\s*\(\{ snapshot \}\)\s*=>\s*\{[\s\S]*showResult\(snapshot, token\)/u);
  assert.doesNotMatch(main, /LIGHT_PILLAR_DURATION/u);
});

test('ゲーム内の描画品質向上の部品を保持する', () => {
  assert.match(game, /MeshPhysicalMaterial/u);
  assert.match(game, /dieEdgeGeometry/u);
  assert.match(game, /targetPadEdgeGeometry/u);
  assert.match(game, /createLightFrameBars/u);
  assert.match(game, /BOARD_TILE_SIZE = 0\.88/u);
  assert.doesNotMatch(game, /targetHaloGeometry|targetRingGeometry|targetPipGlowGeometry/u);
  assert.doesNotMatch(game, /lightPillarRingGeometry/u);
  assert.match(game, /updateTargetMarkers/u);
  assert.match(game, /new THREE\.PointLight/u);
});
