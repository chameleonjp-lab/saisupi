export const SOUND_PREFERENCE_KEY = 'saisupi:sound-enabled:v1';

function readStoredPreference(storage) {
  try {
    return storage?.getItem(SOUND_PREFERENCE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredPreference(storage, enabled) {
  try {
    storage?.setItem(SOUND_PREFERENCE_KEY, String(enabled));
  } catch {
    // Storageが使えなくてもゲーム操作は継続する。
  }
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function defaultContextFactory() {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

export class SoundEffects {
  constructor({
    storage = defaultStorage(),
    contextFactory = defaultContextFactory,
    random = Math.random
  } = {}) {
    this.storage = storage;
    this.contextFactory = contextFactory;
    this.random = random;
    this.enabled = readStoredPreference(storage);
    this.context = null;
    this.masterGain = null;
    this.noiseBuffer = null;
    this.audioUnavailable = false;
    this.activeSounds = new Set();
    this.lastClearAt = -Infinity;
    this.hidden = false;
    this.unlockPromise = null;
    this.stateChangeHandler = null;
  }

  getSnapshot() {
    return Object.freeze({
      enabled: this.enabled,
      available: !this.audioUnavailable,
      running: this.context?.state === 'running',
      state: this.context?.state ?? null
    });
  }

  async setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    writeStoredPreference(this.storage, this.enabled);
    if (this.enabled) await this.unlock();
    else await this.suspend();
    return this.getSnapshot();
  }

  ensureContext() {
    if (this.context?.state === 'closed') this.releaseContext(this.context);
    if (this.context) return this.context;
    let context = null;
    try {
      context = this.contextFactory?.() ?? null;
    } catch {
      context = null;
    }
    if (!context || context.state === 'closed') {
      this.audioUnavailable = true;
      return null;
    }
    try {
      this.masterGain = context.createGain();
      this.masterGain.gain.setValueAtTime(0.42, context.currentTime);
      this.masterGain.connect(context.destination);
      this.context = context;
      this.noiseBuffer = null;
      this.lastClearAt = -Infinity;
      this.audioUnavailable = false;
      this.stateChangeHandler = () => {
        if (this.context !== context) return;
        if (context.state !== 'running') this.stopActiveSounds();
        if (context.state === 'closed') this.releaseContext(context);
      };
      context.addEventListener?.('statechange', this.stateChangeHandler);
      if (!context.addEventListener) context.onstatechange = this.stateChangeHandler;
      return context;
    } catch {
      this.releaseContext(context);
      this.audioUnavailable = true;
      return null;
    }
  }

  async unlock() {
    if (this.unlockPromise) return this.unlockPromise;
    const promise = this.unlockAudioContext();
    this.unlockPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.unlockPromise === promise) this.unlockPromise = null;
    }
  }

  async unlockAudioContext() {
    if (!this.enabled || this.hidden) return false;
    const context = this.ensureContext();
    if (!context) return false;
    try {
      if (context.state === 'suspended' || context.state === 'interrupted') await context.resume();
      if (!this.enabled || this.hidden) {
        await this.suspend();
        return false;
      }
      return context.state === 'running';
    } catch {
      return false;
    }
  }

  async suspend() {
    this.stopActiveSounds();
    try {
      if (this.context?.state === 'running') await this.context.suspend();
    } catch {
      // 音声失敗でゲームを止めない。
    }
  }

  handleVisibility(hidden) {
    this.hidden = Boolean(hidden);
    if (this.hidden) void this.suspend();
  }

  getPlayableContext() {
    return this.enabled && this.context?.state === 'running' ? this.context : null;
  }

  releaseContext(context) {
    if (this.context !== context) return;
    context.removeEventListener?.('statechange', this.stateChangeHandler);
    if (!context.removeEventListener && context.onstatechange === this.stateChangeHandler) {
      context.onstatechange = null;
    }
    this.stopActiveSounds();
    this.context = null;
    this.masterGain = null;
    this.noiseBuffer = null;
    this.stateChangeHandler = null;
  }

  trackSound(node, linkedNodes = []) {
    const activeSound = { node, linkedNodes };
    const cleanup = () => {
      if (!this.activeSounds.delete(activeSound)) return;
      node.disconnect?.();
      for (const linkedNode of linkedNodes) linkedNode.disconnect?.();
    };
    activeSound.cleanup = cleanup;
    this.activeSounds.add(activeSound);
    node.addEventListener?.('ended', cleanup, { once: true });
  }

  stopActiveSounds() {
    for (const activeSound of [...this.activeSounds]) {
      try {
        activeSound.node.stop?.();
      } catch {
        // 既に終了した音源へのstopは無視する。
      }
      activeSound.cleanup();
    }
  }

  createNoiseBuffer(context) {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.ceil(context.sampleRate * 0.42);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < data.length; index += 1) {
      previous = previous * 0.64 + (this.random() * 2 - 1) * 0.36;
      data[index] = previous;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  playTone({ when, frequency, endFrequency = frequency, duration, gain, type = 'sine' }) {
    const context = this.getPlayableContext();
    if (!context) return false;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), when + duration);
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope);
    envelope.connect(this.masterGain);
    this.trackSound(oscillator, [envelope]);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.01);
    return true;
  }

  playNoise({ when, duration, gain, frequency, type = 'bandpass', q = 0.9 }) {
    const context = this.getPlayableContext();
    if (!context) return false;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this.createNoiseBuffer(context);
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, when);
    filter.Q.setValueAtTime(q, when);
    envelope.gain.setValueAtTime(gain, when);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.masterGain);
    this.trackSound(source, [filter, envelope]);
    source.start(when);
    source.stop(when + duration + 0.01);
    return true;
  }

  playFlick() {
    const context = this.getPlayableContext();
    if (!context) return false;
    const now = context.currentTime;
    this.playNoise({ when: now, duration: 0.065, gain: 0.13, frequency: 1450, q: 1.3 });
    this.playTone({ when: now, frequency: 620, endFrequency: 310, duration: 0.07, gain: 0.075, type: 'triangle' });
    return true;
  }

  playRoll() {
    const context = this.getPlayableContext();
    if (!context) return false;
    const now = context.currentTime;
    for (const [offset, frequency, gain] of [[0, 310, 0.18], [0.09, 230, 0.16], [0.19, 175, 0.22]]) {
      this.playNoise({ when: now + offset, duration: 0.075, gain, frequency, type: 'lowpass', q: 0.7 });
      this.playTone({ when: now + offset, frequency: frequency * 0.62, endFrequency: frequency * 0.4, duration: 0.085, gain: gain * 0.36, type: 'square' });
    }
    return true;
  }

  playClear() {
    const context = this.getPlayableContext();
    if (!context) return false;
    const now = context.currentTime;
    if (now - this.lastClearAt < 0.045) return false;
    this.lastClearAt = now;
    for (const [index, frequency] of [392, 523.25, 659.25].entries()) {
      this.playTone({ when: now + index * 0.065, frequency, duration: 0.17, gain: 0.12 - index * 0.012, type: 'triangle' });
    }
    return true;
  }

  dispose() {
    this.stopActiveSounds();
    const context = this.context;
    this.releaseContext(context);
    try {
      context?.close?.();
    } catch {
      // 終了処理の失敗は無視する。
    }
  }
}
