import {
  BOARD_SIZE,
  INITIAL_BURIED_DIE,
  TARGET_GENERATION_VERSION,
  TARGET_LAYOUT_VERSION,
  TARGET_POSITIONS
} from './saisupi-config.js';
import { boardKey, isInsideBoard } from './board-rules.js';

export const TARGET_COUNT = 10;

export function validateTargetPositions(positions = TARGET_POSITIONS) {
  if (!Array.isArray(positions) || positions.length !== TARGET_COUNT) {
    throw new RangeError('目標は10個必要です');
  }

  const keys = new Set();
  const ids = new Set();
  const normalized = positions.map((position) => {
    const id = String(position?.id ?? '');
    const row = Number(position?.row);
    const column = Number(position?.column);
    const key = boardKey(row, column);
    if (!id || ids.has(id)) throw new RangeError('目標IDが重複しています');
    if (
      !Number.isInteger(row)
      || !Number.isInteger(column)
      || !isInsideBoard(row, column, BOARD_SIZE)
    ) {
      throw new RangeError('目標が盤面外です');
    }
    if (keys.has(key)) throw new RangeError('目標位置が重複しています');
    if (row === INITIAL_BURIED_DIE.row && column === INITIAL_BURIED_DIE.column) {
      throw new RangeError('開始サイコロと目標位置が重複しています');
    }
    ids.add(id);
    keys.add(key);
    return Object.freeze({ id, row, column });
  });

  return Object.freeze(normalized);
}

function randomTargetValue(random) {
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('目の乱数は0以上1未満で指定してください');
  }
  return Math.floor(value * 6) + 1;
}

export function generateTargetRun({
  random = Math.random,
  positions = TARGET_POSITIONS
} = {}) {
  if (typeof random !== 'function') throw new TypeError('乱数関数が必要です');
  const validated = validateTargetPositions(positions);
  const targets = validated.map((position) => Object.freeze({
    ...position,
    value: randomTargetValue(random)
  }));

  return Object.freeze({
    layoutVersion: TARGET_LAYOUT_VERSION,
    generationVersion: TARGET_GENERATION_VERSION,
    targets: Object.freeze(targets)
  });
}

export function findTargetAt(targets, row, column) {
  return targets.find((target) => target.row === row && target.column === column) ?? null;
}
