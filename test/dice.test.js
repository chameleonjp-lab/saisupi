import test from 'node:test';
import assert from 'node:assert/strict';

import { BASE_ORIENTATION, Dice } from '../js/dice.js';

const expected = {
  up: { top: 2, bottom: 5, front: 6, back: 1, left: 3, right: 4 },
  down: { top: 5, bottom: 2, front: 1, back: 6, left: 3, right: 4 },
  left: { top: 4, bottom: 3, front: 2, back: 5, left: 1, right: 6 },
  right: { top: 3, bottom: 4, front: 2, back: 5, left: 6, right: 1 }
};

test('サイコロの基本姿勢は元版と同じ面配置を使う', () => {
  assert.deepEqual(BASE_ORIENTATION, {
    top: 1,
    bottom: 6,
    front: 2,
    back: 5,
    left: 3,
    right: 4
  });
});

for (const [direction, values] of Object.entries(expected)) {
  test('サイコロの' + direction + '回転で6面が正しく入れ替わる', () => {
    const orientation = { ...BASE_ORIENTATION };
    Dice.rotateValues(orientation, direction);
    assert.deepEqual(orientation, values);
  });
}

test('移動完了後のrollは位置と6面を同時に更新できる', () => {
  const die = new Dice('die-1', 3, 3, { ...BASE_ORIENTATION });
  die.roll('right', 3, 4);
  assert.equal(die.row, 3);
  assert.equal(die.column, 4);
  assert.equal(die.top, 3);
});

