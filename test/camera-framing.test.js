import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_BASE_SIZE,
  CAMERA_POSITION,
  CAMERA_TARGET,
  calculateCameraFrustum,
  MIN_BOARD_VIEW_WIDTH
} from '../js/camera-framing.js';

test('盤面のカメラ位置と注視点を元版から継承する', () => {
  assert.equal(BOARD_BASE_SIZE, 8.2);
  assert.deepEqual(CAMERA_POSITION, { x: 7.8, y: 9.2, z: 8.8 });
  assert.deepEqual(CAMERA_TARGET, { x: 0, y: 0.5, z: 0 });
});

test('縦長画面でも盤面を収めるフラスタムを計算する', () => {
  const frustum = calculateCameraFrustum(390, 844);
  assert.ok(frustum.viewWidth >= MIN_BOARD_VIEW_WIDTH);
  assert.ok(frustum.viewHeight > frustum.viewWidth);
  assert.ok(frustum.left < 0);
  assert.ok(frustum.right > 0);
});

