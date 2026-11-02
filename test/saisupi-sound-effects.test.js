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

function retryHarness() {
  const contexts = [];
  const values = new Map();
  function makeContext() {
    let settle;
    const context = {
      state: 'suspended', currentTime: 0, destination: {}, resumeCalls: 0, suspendCalls: 0, closeCalls: 0,
      createGain: () => ({ gain: { setValueAtTime() {} }, connect() {}, disconnect() {} }),
      addEventListener() {}, removeEventListener() {},
      resume() { this.resumeCalls++; if (this.resumeCalls === 1) return new Promise(resolve => { settle = resolve; }); this.state = 'running'; return Promise.resolve(); },
      suspend() { this.suspendCalls++; this.state = 'suspended'; return Promise.resolve(); },
      close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); },
      settle() { settle(); }
    };
    contexts.push(context);
    return context;
  }
  const sound = new SoundEffects({ storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, contextFactory: makeContext });
  return { sound, contexts, values };
}

test('next gesture retries permanently pending resume without automatic replay', async () => {
  const { sound, contexts } = retryHarness();
  const old = sound.unlock();
  void sound.unlock();
  const context = contexts[0];
  assert.equal(context.resumeCalls, 1);
  assert.equal(sound.playClear(), false);
  await new Promise(setImmediate);
  const next = sound.unlock();
  assert.equal(context.resumeCalls, 2);
  assert.equal(await next, true);
  context.settle();
  await old;
  assert.equal(sound.activeSounds.size, 0);
  assert.equal(contexts.length, 1);
});

for (const state of ['off', 'zero', 'hidden']) {
  test(`pending recovery respects ${state} and remains retryable`, { timeout: 1000 }, async () => {
    const { sound, contexts, values } = retryHarness();
    const old = sound.unlock();
    const context = contexts[0];
    await new Promise(setImmediate);
    if (state === 'off') await sound.setEnabled(false);
    if (state === 'zero') sound.setVolume(0);
    if (state === 'hidden') sound.handleVisibility(true);
    assert.equal(await sound.unlock(), false);
    assert.equal(context.resumeCalls, 1);
    assert.equal(sound.playClear(), false);
    context.settle();
    assert.equal(await old, false);
    if (state === 'off') { assert.equal(values.get(SOUND_PREFERENCE_KEY), 'false'); await sound.setEnabled(true); }
    if (state === 'zero') { assert.equal(values.get('saisupi:sound-volume:v1'), '0'); sound.setVolume(0.3); }
    sound.handleVisibility(false);
    assert.equal(await sound.unlock(), true);
    assert.equal(context.resumeCalls, 2);
    assert.equal(sound.activeSounds.size, 0);
  });
}

for (const release of ['closed', 'dispose']) {
  test(`late resume after ${release} never targets the replacement context`, async () => {
    const { sound, contexts } = retryHarness();
    const old = sound.unlock();
    const first = contexts[0];
    if (release === 'dispose') sound.dispose(); else first.state = 'closed';
    await new Promise(setImmediate);
    void sound.unlock();
    assert.equal(contexts.length, 2);
    const replacement = contexts[1];
    await new Promise(setImmediate);
    assert.equal(await sound.unlock(), true);
    sound.hidden = true;
    first.settle();
    assert.equal(await old, false);
    assert.equal(replacement.suspendCalls, 0);
    replacement.settle();
    await Promise.resolve();
    assert.equal(sound.activeSounds.size, 0);
  });
}
