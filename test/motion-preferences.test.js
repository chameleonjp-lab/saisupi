import test from 'node:test';
import assert from 'node:assert/strict';

import { MotionPreferences } from '../js/motion-preferences.js';

test('動きを減らす設定を読み取り、変更を通知する', () => {
  let current = false;
  const mediaQueryList = {
    get matches() {
      return current;
    },
    addEventListener() {},
    removeEventListener() {}
  };
  const preferences = new MotionPreferences({
    matchMedia: () => mediaQueryList
  });

  const values = [];
  const unsubscribe = preferences.subscribe((value) => values.push(value));
  preferences.update(true);
  preferences.update(false);
  unsubscribe();
  preferences.dispose();

  assert.deepEqual(values, [false, true, false]);
});

