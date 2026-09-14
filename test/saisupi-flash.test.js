import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIMER_FLASH_DURATION,
  getOneShotFlashIntensity
} from '../js/saisupi-flash.js';

test('タイマー開始の発光は開始時だけ明るくなり、1回で消える', () => {
  assert.equal(TIMER_FLASH_DURATION, 500);
  assert.equal(getOneShotFlashIntensity(0), 1);
  assert.equal(getOneShotFlashIntensity(TIMER_FLASH_DURATION / 2), 0.5);
  assert.equal(getOneShotFlashIntensity(TIMER_FLASH_DURATION), 0);
  assert.equal(getOneShotFlashIntensity(TIMER_FLASH_DURATION + 1), 0);
  assert.equal(getOneShotFlashIntensity(-1), 0);
  assert.equal(getOneShotFlashIntensity(Number.NaN), 0);
});

test('発光時間を過ぎても通常状態へ戻ったまま再点灯しない', () => {
  const samples = [0, 100, 250, 499, 500, 1000]
    .map((elapsed) => getOneShotFlashIntensity(elapsed));
  assert.deepEqual(samples.slice(0, 3), [1, 0.8, 0.5]);
  assert.ok(Math.abs(samples[3] - 0.002) < Number.EPSILON);
  assert.deepEqual(samples.slice(4), [0, 0]);
});
