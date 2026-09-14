import test from 'node:test';
import assert from 'node:assert/strict';

import { directionFromDiagonalSwipe } from '../js/input-direction.js';

test('斜めフリックの4方向対応を元版どおりに返す', () => {
  assert.equal(directionFromDiagonalSwipe(40, -30), 'up');
  assert.equal(directionFromDiagonalSwipe(40, 30), 'right');
  assert.equal(directionFromDiagonalSwipe(-40, 30), 'down');
  assert.equal(directionFromDiagonalSwipe(-40, -30), 'left');
});

test('短すぎる、または斜めでない入力を受け付けない', () => {
  assert.equal(directionFromDiagonalSwipe(10, 10), null);
  assert.equal(directionFromDiagonalSwipe(60, 0), null);
  assert.equal(directionFromDiagonalSwipe(0, 60), null);
});

