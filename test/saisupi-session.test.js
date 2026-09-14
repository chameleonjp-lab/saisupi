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

test('露出完了後だけ計測を開始し、10地点を一度ずつ完了できる', () => {
  const session = new SaisupiSession();
  const targets = Array.from({ length: 10 }, (_, index) => ({
    id: 'target-' + String(index + 1).padStart(2, '0'),
    row: 1,
    column: index,
    value: (index % 6) + 1
  }));

  session.setTargets(targets);
  session.setPhase(P1_PHASES.RISING);
  assert.equal(session.startRunning(1000), true);
  assert.equal(session.phase, P1_PHASES.RUNNING);
  assert.equal(session.startRunning(1001), false);
  assert.deepEqual(session.getTargetProgress(), { completed: 0, total: 10 });

  assert.equal(session.completeTarget('target-01'), true);
  assert.equal(session.completeTarget('target-01'), false);
  assert.equal(session.completeTarget('missing-target'), false);
  assert.deepEqual(session.getTargetProgress(), { completed: 1, total: 10 });
  assert.equal(session.finish(2000), false);

  for (let index = 1; index < targets.length; index += 1) {
    assert.equal(session.completeTarget(targets[index].id), true);
  }
  assert.equal(session.isRunComplete(), true);
  assert.equal(session.finish(2345), true);
  assert.equal(session.phase, P1_PHASES.FINISHED);
  assert.equal(session.startedAt, 1000);
  assert.equal(session.finishedAt, 2345);
  assert.equal(session.finish(3000), false);
  assert.equal(session.completeTarget('target-01'), false);
});

test('アニメーション中断時は実行状態とターゲットを保持し、入力キューだけ破棄する', () => {
  const session = new SaisupiSession();
  session.setTargets(Array.from({ length: 10 }, (_, index) => ({ id: 'target-' + index })));
  session.setPhase(P1_PHASES.RISING);
  session.startRunning(500);
  session.setBusy(true);
  session.queueDirection('left');

  const epoch = session.epoch;
  session.invalidateAnimation();

  assert.ok(session.epoch > epoch);
  assert.equal(session.phase, P1_PHASES.RUNNING);
  assert.equal(session.startedAt, 500);
  assert.equal(session.targets.length, 10);
  assert.equal(session.busy, false);
  assert.equal(session.queuedDirection, null);
});

test('不正なターゲット集合では計測を開始しない', () => {
  const session = new SaisupiSession();
  assert.throws(
    () => session.setTargets(Array.from({ length: 10 }, () => ({ id: 'same' }))),
    /目標IDが重複または不正/
  );
  session.setPhase(P1_PHASES.RISING);
  assert.equal(session.startRunning(100), false);
});
