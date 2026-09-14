export const SAISUPI_RULE_VERSION = 'p1-base-v1';

export const BOARD_SIZE = 7;
export const DICE_SIZE = 0.92;
export const FLOOR_Y = 0;
export const DICE_Y = 0.52;
export const PLAYER_Y = 1.18;
export const GROUND_PLAYER_Y = 0.18;
export const BURIED_DICE_Y = -0.24;
export const RISE_DURATION = 720;
export const RISE_DEPTH = 1.18;

export const INITIAL_PLAYER_POSITION = Object.freeze({
  row: 4,
  column: 3
});

export const INITIAL_BURIED_DIE = Object.freeze({
  id: 'die-1',
  row: 3,
  column: 3,
  state: 'buried'
});

