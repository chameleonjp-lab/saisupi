function defaultNow() {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

export function scoreCentisecondsFromElapsedMs(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  return Math.floor(elapsedMs / 10);
}

export function formatScoreCentiseconds(scoreCentiseconds) {
  if (!Number.isInteger(scoreCentiseconds) || scoreCentiseconds < 0) return '--.--秒';
  const seconds = Math.floor(scoreCentiseconds / 100);
  const fraction = String(scoreCentiseconds % 100).padStart(2, '0');
  return String(seconds) + '.' + fraction + '秒';
}

export class SaisupiClock {
  constructor({ now = defaultNow } = {}) {
    if (typeof now !== 'function') throw new TypeError('時計関数が必要です');
    this.now = now;
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.finishedAt = null;
  }

  readNow() {
    const value = Number(this.now());
    return Number.isFinite(value) ? value : null;
  }

  start(startedAt = this.readNow()) {
    if (this.startedAt !== null || !Number.isFinite(startedAt)) return false;
    this.startedAt = startedAt;
    return true;
  }

  finish(finishedAt = this.readNow()) {
    if (
      this.startedAt === null
      || this.finishedAt !== null
      || !Number.isFinite(finishedAt)
      || finishedAt < this.startedAt
    ) return null;
    this.finishedAt = finishedAt;
    return this.elapsedMs(finishedAt);
  }

  elapsedMs(now = this.readNow()) {
    if (this.startedAt === null) return 0;
    const end = this.finishedAt ?? now;
    if (!Number.isFinite(end)) return 0;
    return Math.max(0, end - this.startedAt);
  }

  getSnapshot(now = this.readNow()) {
    const elapsedMs = this.elapsedMs(now);
    const displayScoreCentiseconds = scoreCentisecondsFromElapsedMs(elapsedMs) ?? 0;
    return Object.freeze({
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      elapsedMs,
      scoreCentiseconds: this.finishedAt === null
        ? null
        : displayScoreCentiseconds,
      displayTime: formatScoreCentiseconds(displayScoreCentiseconds)
    });
  }
}
