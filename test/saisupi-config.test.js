import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_SIZE,
  BURIED_DICE_Y,
  DICE_SIZE,
  INITIAL_BURIED_DIE,
  INITIAL_PLAYER_POSITION,
  RISE_DURATION,
  SAISUPI_GAME_SLUG,
  SAISUPI_OG_IMAGE_URL,
  SAISUPI_RULE_VERSION,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
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

test('P4の暫定設定と共有画像URLを公開する', () => {
  assert.equal(SAISUPI_RULE_VERSION, 'p4-polish-ranking-provisional-v1');
  assert.equal(SAISUPI_GAME_SLUG, 'saisupi');
  assert.equal(SAISUPI_OG_IMAGE_URL, 'https://chameleonjp-lab.github.io/saisupi/assets/saisupi-og.jpg');
  assert.match(SUPABASE_URL, /^https:\/\/.+\.supabase\.co$/u);
  assert.match(SUPABASE_PUBLISHABLE_KEY, /^sb_publishable_/u);
  assert.doesNotMatch(SUPABASE_PUBLISHABLE_KEY, /service_role|secret/iu);
  assert.equal(TARGET_LAYOUT_VERSION, 'layout-a-provisional-v1');
  assert.equal(TARGET_GENERATION_VERSION, 'independent-uniform-v1');
  assert.equal(TARGET_POSITIONS.length, 10);
});
