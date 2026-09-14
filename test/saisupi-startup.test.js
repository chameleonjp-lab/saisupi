import test from 'node:test';
import assert from 'node:assert/strict';

import { StartRequestGate } from '../js/saisupi-startup.js';

test('古い開始要求はホームへ戻った時点で無効になる', () => {
  const gate = new StartRequestGate();
  const first = gate.begin();
  gate.invalidate();
  assert.equal(gate.isCurrent(first), false);

  const second = gate.begin();
  assert.equal(gate.isCurrent(second), true);
  assert.equal(gate.isCurrent(first), false);
});
