import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIGHT_PILLAR_DURATION,
  getLightPillarState
} from '../js/saisupi-light-pillar.js';

test('成功時の光柱は半透明で、1秒間だけ表示する', () => {
  assert.equal(LIGHT_PILLAR_DURATION, 1000);
  const start = getLightPillarState(0);
  const middle = getLightPillarState(500);
  const end = getLightPillarState(1000);

  assert.equal(start.visible, true);
  assert.ok(start.opacity > 0 && start.opacity < 1);
  assert.ok(start.height > 0);
  assert.equal(middle.visible, true);
  assert.ok(middle.height >= start.height);
  assert.equal(end.visible, false);
  assert.equal(end.opacity, 0);
});

test('不正な時刻や終了後は光柱を表示しない', () => {
  for (const elapsed of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1000, 1200]) {
    assert.equal(getLightPillarState(elapsed).visible, false);
  }
});
