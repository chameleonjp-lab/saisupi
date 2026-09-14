import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const index = read('index.html');
const main = read('js/main.js');
const game = read('js/webgl-game.js');

test('P1の画面は新作の開始導線だけを持つ', () => {
  assert.match(index, /id="start-button"/);
  assert.match(index, /id="player-name-input"/);
  assert.match(index, /埋まったサイコロ/);
  assert.doesNotMatch(index, /300秒|消去|連鎖|補充|TIME UP/);
  assert.match(main, /directionFromDiagonalSwipe/);
  assert.match(main, /ArrowUp/);
  assert.match(index, /id="run-time"/);
  assert.match(index, /id="target-progress"/);
});

test('旧ゲームのルール実行経路を新作へ持ち込まない', () => {
  for (const source of [index, main, game]) {
    assert.doesNotMatch(source, /findTriggeredGroups|findSpecialOneClear|resolveMatches|resolveSpecialOnes/);
    assert.doesNotMatch(source, /setInterval/);
    assert.doesNotMatch(source, /300秒|消去|連鎖|補充/);
  }
});

test('P1の見た目・操作の継承点を保持する', () => {
  assert.match(game, /new THREE\.WebGLRenderer/);
  assert.match(game, /player\.scale\.setScalar\(0\.9\)/);
  assert.match(game, /DICE_SIZE/);
  assert.match(game, /BOARD_SIZE/);
  assert.match(game, /queueDirection/);
  assert.match(game, /SaisupiSession/);
  assert.match(game, /interruptAnimations/);
  assert.match(main, /StartRequestGate/);
  assert.match(main, /shouldReduceMotion/);
  assert.match(main, /onVisibilityChange/);
  assert.match(main, /data-direction/);
  assert.match(game, /generateTargetRun/);
  assert.match(game, /SaisupiClock/);
  assert.match(game, /onTick/);
  assert.match(game, /RUNNING/);
  assert.match(game, /FINISHED/);
});
