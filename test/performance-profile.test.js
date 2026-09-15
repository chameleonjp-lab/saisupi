import test from 'node:test';
import assert from 'node:assert/strict';

import { getPerformanceProfile, PERFORMANCE_PROFILES } from '../js/performance-profile.js';

test('タッチ端末のサイコロ回転は180msにし、PCはサイノメ準拠の280msを維持する', () => {
  assert.equal(getPerformanceProfile({ isTouch: true }).actionTimings.rollMs, 180);
  assert.equal(getPerformanceProfile({ isTouch: false }).actionTimings.rollMs, 280);
  assert.equal(PERFORMANCE_PROFILES.standard.actionTimings.rollMs, 280);
});
