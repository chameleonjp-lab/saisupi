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

test('volume zero is preserved and does not initialize audio',async()=>{
 const values=new Map([['saisupi:sound-volume:v1','0']]);let contexts=0;
 const sound=new SoundEffects({storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},contextFactory:()=>{contexts++;return null;}});
 assert.equal(sound.getSnapshot().volume,0);await sound.unlock();assert.equal(contexts,0);
 sound.setVolume(0.5);assert.equal(values.get('saisupi:sound-volume:v1'),'0.5');
 sound.setVolume(0);assert.equal(values.get('saisupi:sound-volume:v1'),'0');
});

test('disposing before audio initialization and twice is safe',()=>{const sound=new SoundEffects({storage:null,contextFactory:()=>null});assert.doesNotThrow(()=>sound.dispose());assert.doesNotThrow(()=>sound.dispose());});

test('one node disconnect error does not block sibling cleanup or game operations',()=>{
 let disconnected=0;const sound=new SoundEffects({storage:null});
 sound.trackSound({stop(){},disconnect(){throw Error('node failed')}},[{disconnect(){disconnected++}}]);
 assert.doesNotThrow(()=>sound.stopActiveSounds());assert.equal(disconnected,1);assert.equal(sound.activeSounds.size,0);
});
test('unavailable oscillator does not throw from an in-game sound cue',()=>{
 const sound=new SoundEffects({storage:null});sound.context={state:'running',currentTime:1,createOscillator(){throw Error('device')}};
 assert.doesNotThrow(()=>sound.playClear());
});
