import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_SIZE,
  BURIED_DICE_Y,
  DICE_SIZE,
  INITIAL_BURIED_DIE,
  INITIAL_PLAYER_POSITION,
  RISE_DURATION,
  SAISUPI_RULE_VERSION,
  TARGET_GENERATION_VERSION,
  TARGET_LAYOUT_VERSION,
  TARGET_POSITIONS
} from '../js/saisupi-config.js';

test('P1は7×7盤面の中央に埋まったサイコロを置く', () => {
  assert.equal(BOARD_SIZE, 7);
  assert.equal(DICE_SIZE, 0.92);
  assert.deepEqual(INITIAL_BURIED_DIE, {
    id: 'die-1',
    row: 3,
    column: 3,
    state: 'buried'
  });
  assert.deepEqual(INITIAL_PLAYER_POSITION, { row: 4, column: 3 });
  assert.equal(BURIED_DICE_Y, -0.24);
  assert.equal(RISE_DURATION, 720);
});

test('P2の暫定設定は版付きで10座標を公開する', () => {
  assert.equal(SAISUPI_RULE_VERSION, 'p2-target-time-provisional-v1');
  assert.equal(TARGET_LAYOUT_VERSION, 'layout-a-provisional-v1');
  assert.equal(TARGET_GENERATION_VERSION, 'independent-uniform-v1');
  assert.equal(TARGET_POSITIONS.length, 10);
});
