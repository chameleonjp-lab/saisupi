export const SAISUPI_RULE_VERSION = 'p5-visual-polish-v1';
export const SAISUPI_GAME_SLUG = 'saisupi';
export const SAISUPI_GAME_URL = 'https://chameleonjp-lab.github.io/saisupi/';
export const CHAMELEONJP_LAB_URL = 'https://chameleonjp-lab.github.io/chameleonjp_lab/';
export const SAISUPI_OG_IMAGE_URL = 'https://chameleonjp-lab.github.io/saisupi/assets/saisupi-og.jpg';
export const SUPABASE_URL = 'https://mlpnjgezrnhdxsxolyzj.supabase.co';
// ブラウザへ置ける publishable key のみを使用する。service_role は保存しない。
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM';

export const BOARD_SIZE = 7;
export const DICE_SIZE = 0.92;
export const FLOOR_Y = 0;
export const DICE_Y = 0.52;
export const PLAYER_Y = 1.18;
export const GROUND_PLAYER_Y = 0.18;
export const BURIED_DICE_Y = -0.24;
export const RISE_DURATION = 720;
export const RISE_DEPTH = 1.18;

// 計画書の配置案A。D02〜D04が確定するまで公式記録には使わない仮設定。
export const TARGET_LAYOUT_VERSION = 'layout-a-provisional-v1';
export const TARGET_GENERATION_VERSION = 'independent-uniform-v1';
export const TARGET_POSITIONS = Object.freeze([
  Object.freeze({ id: 'target-01', row: 1, column: 1 }),
  Object.freeze({ id: 'target-02', row: 1, column: 3 }),
  Object.freeze({ id: 'target-03', row: 1, column: 5 }),
  Object.freeze({ id: 'target-04', row: 2, column: 2 }),
  Object.freeze({ id: 'target-05', row: 2, column: 4 }),
  Object.freeze({ id: 'target-06', row: 4, column: 2 }),
  Object.freeze({ id: 'target-07', row: 4, column: 4 }),
  Object.freeze({ id: 'target-08', row: 5, column: 1 }),
  Object.freeze({ id: 'target-09', row: 5, column: 3 }),
  Object.freeze({ id: 'target-10', row: 5, column: 5 })
]);

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
