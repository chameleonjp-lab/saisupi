import test from 'node:test';
import assert from 'node:assert/strict';

import { P1_PHASES, SaisupiSession } from '../js/saisupi-session.js';

test('登る、上昇、露出完了のP1状態を順に管理する', () => {
  const session = new SaisupiSession();
  assert.equal(session.phase, P1_PHASES.WAITING_FOR_CLIMB);
  session.setBusy(true);
  session.setPhase(P1_PHASES.CLIMBING);
  session.setPhase(P1_PHASES.RISING);
  session.setPhase(P1_PHASES.READY);
  session.setBusy(false);
  assert.equal(session.phase, P1_PHASES.READY);
  assert.equal(session.busy, false);
});

test('移動中は最後の1方向だけを保持し、リセットで破棄する', () => {
  const session = new SaisupiSession();
  session.setBusy(true);
  assert.equal(session.queueDirection('left'), true);
  assert.equal(session.queueDirection('right'), true);
  assert.equal(session.takeQueuedDirection(), 'right');
  assert.equal(session.takeQueuedDirection(), null);

  const epoch = session.epoch;
  session.queueDirection('up');
  session.reset();
  assert.ok(session.epoch > epoch);
  assert.equal(session.queuedDirection, null);
  assert.equal(session.busy, false);
  assert.equal(session.phase, P1_PHASES.WAITING_FOR_CLIMB);
});
