import test from 'node:test';
import assert from 'node:assert/strict';

import { SoundEffects, SOUND_PREFERENCE_KEY } from '../js/saisupi-sound-effects.js';

function createStorage(value = null) {
  let stored = value;
  return {
    getItem() { return stored; },
    setItem(_key, next) { stored = next; }
  };
}

test('効果音は保存された明示的なオフ以外ではデフォルトオンになる', () => {
  const defaultSound = new SoundEffects({
    storage: createStorage(),
    contextFactory: () => null
  });
  assert.equal(defaultSound.getSnapshot().enabled, true);

  const offSound = new SoundEffects({
    storage: createStorage('false'),
    contextFactory: () => null
  });
  assert.equal(offSound.getSnapshot().enabled, false);

  const onSound = new SoundEffects({
    storage: createStorage('true'),
    contextFactory: () => null
  });
  assert.equal(onSound.getSnapshot().enabled, true);
  assert.equal(SOUND_PREFERENCE_KEY, 'saisupi:sound-enabled:v1');
});
