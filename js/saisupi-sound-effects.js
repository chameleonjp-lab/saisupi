export const VOLUME_PREFERENCE_KEY = 'saisupi:sound-volume:v1';

export const SOUND_PREFERENCE_KEY = 'saisupi:sound-enabled:v1';

function readStoredPreference(storage) {
  try {
    const stored = storage?.getItem(SOUND_PREFERENCE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return true;
  } catch {
    return true;
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
    this.volume = 1;
    try { const raw=storage?.getItem(VOLUME_PREFERENCE_KEY);const value=Number(raw);if(raw!==null && raw!==undefined && Number.isFinite(value)&&value>=0&&value<=1)this.volume=value; } catch {}
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
      volume: this.volume,
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

  setVolume(value) {
    if (!Number.isFinite(value) || value < 0 || value > 1) return;
    this.volume = value;
    try { this.storage?.setItem(VOLUME_PREFERENCE_KEY,String(value)); } catch {}
    if (value === 0) this.stopActiveSounds();
    try { if (this.context && this.masterGain) this.masterGain.gain.setValueAtTime(0.42 * value,this.context.currentTime); } catch {}
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
      this.masterGain.gain.setValueAtTime(0.42 * this.volume, context.currentTime);
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
      try { this.masterGain?.disconnect?.(); } catch {}
      this.releaseContext(context);
      this.masterGain = null;
      try { Promise.resolve(context.close?.()).catch(() => {}); } catch {}
      this.audioUnavailable = true;
      return null;
    }
  }

  async unlock() {
    if (this.unlockPromise) return this.unlockPromise;
    const promise = this.unlockAudioContext();
    this.unlockPromise = promise;
    // Share only synchronous calls from this gesture, not an indefinitely
    // pending browser resume. Later gestures must still invoke resume directly.
    Promise.resolve().then(() => {
      if (this.unlockPromise === promise) this.unlockPromise = null;
    });
    return promise;
  }

  async unlockAudioContext() {
    if (!this.enabled || this.volume === 0 || this.hidden) return false;
    const context = this.ensureContext();
    if (!context) return false;
    try {
      if (context.state === 'suspended' || context.state === 'interrupted') await context.resume();
      if (this.context !== context) return false;
      if (!this.enabled || this.volume === 0 || this.hidden) {
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
    return this.enabled && this.volume > 0 && !this.hidden && this.context?.state === 'running' ? this.context : null;
  }

  releaseContext(context) {
    if (!context || this.context !== context) return;
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
      try { node.disconnect?.(); } catch {}
      for (const linkedNode of linkedNodes) { try { linkedNode.disconnect?.(); } catch {} }
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
    let created = [];
    try {
    const context = this.getPlayableContext();
    if (!context) return false;
    const oscillator = context.createOscillator();
    created.push(oscillator);
    const envelope = context.createGain();
    created.push(envelope);
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
    } catch { for (const node of created) { try { node.stop?.(); } catch {} try { node.disconnect?.(); } catch {} } this.stopActiveSounds(); return false; }
  }

  playNoise({ when, duration, gain, frequency, type = 'bandpass', q = 0.9 }) {
    let created = [];
    try {
    const context = this.getPlayableContext();
    if (!context) return false;
    const source = context.createBufferSource();
    created.push(source);
    const filter = context.createBiquadFilter();
    created.push(filter);
    const envelope = context.createGain();
    created.push(envelope);
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
    } catch { for (const node of created) { try { node.stop?.(); } catch {} try { node.disconnect?.(); } catch {} } this.stopActiveSounds(); return false; }
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
      Promise.resolve(context?.close?.()).catch(() => {});
    } catch {
      // 終了処理の失敗は無視する。
    }
  }
}
