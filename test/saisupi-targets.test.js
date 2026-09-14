import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_BURIED_DIE,
  TARGET_POSITIONS
} from '../js/saisupi-config.js';
import {
  TARGET_COUNT,
  findTargetAt,
  generateTargetRun,
  judgeTargetLanding,
  validateTargetPositions
} from '../js/saisupi-targets.js';
import { P1_PHASES, SaisupiSession } from '../js/saisupi-session.js';

test('仮配置Aは盤面内の重複しない10座標を持つ', () => {
  const positions = validateTargetPositions();
  assert.equal(positions.length, TARGET_COUNT);
  assert.equal(new Set(positions.map((position) => position.id)).size, TARGET_COUNT);
  assert.equal(new Set(positions.map((position) => position.row + ',' + position.column)).size, TARGET_COUNT);
  assert.equal(
    findTargetAt(positions, INITIAL_BURIED_DIE.row, INITIAL_BURIED_DIE.column),
    null
  );
});

test('目は10個を一括生成し、乱数を引き直さない', () => {
  const values = [0, 0.16, 0.33, 0.50, 0.66, 0.83, 0.99];
  let index = 0;
  const run = generateTargetRun({
    random: () => values[index++ % values.length]
  });
  assert.equal(index, TARGET_COUNT);
  assert.deepEqual(
    run.targets.map((target) => target.value),
    [1, 1, 2, 4, 4, 5, 6, 1, 1, 2]
  );
  assert.deepEqual(
    run.targets.map(({ id, row, column }) => ({ id, row, column })),
    TARGET_POSITIONS
  );
});

test('不正な位置と乱数を開始前に拒否する', () => {
  assert.throws(
    () => validateTargetPositions([{ id: 'target-01', row: -1, column: 0 }]),
    /目標は10個必要です/
  );
  assert.throws(
    () => validateTargetPositions([
      ...TARGET_POSITIONS.slice(0, -1),
      { ...TARGET_POSITIONS[0], id: 'target-10' }
    ]),
    /目標位置が重複しています/
  );
  assert.throws(
    () => validateTargetPositions([
      ...TARGET_POSITIONS.slice(0, -1),
      { ...TARGET_POSITIONS[9], row: 5.5 }
    ]),
    /目標が盤面外です/
  );
  assert.throws(
    () => generateTargetRun({ random: () => 1 }),
    /0以上1未満/
  );
});

test('移動完了後の座標と上面が一致した目標だけを一度達成する', () => {
  const run = generateTargetRun({ random: () => 0 });
  const session = new SaisupiSession();
  session.setTargets(run.targets);
  session.setPhase(P1_PHASES.RISING);
  assert.equal(session.startRunning(1000), true);

  const target = run.targets[0];
  assert.equal(judgeTargetLanding({
    session,
    targets: run.targets,
    row: target.row,
    column: target.column,
    upperFace: target.value
  }), target);
  assert.equal(session.getTargetProgress().completed, 1);
  assert.equal(judgeTargetLanding({
    session,
    targets: run.targets,
    row: target.row,
    column: target.column,
    upperFace: target.value
  }), null);
  assert.equal(judgeTargetLanding({
    session,
    targets: run.targets,
    row: run.targets[1].row,
    column: run.targets[1].column,
    upperFace: 2
  }), null);
  assert.equal(judgeTargetLanding({
    session,
    targets: run.targets,
    row: target.row,
    column: target.column + 1,
    upperFace: target.value
  }), null);
});
