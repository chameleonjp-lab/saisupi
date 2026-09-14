export const P1_PHASES = Object.freeze({
  WAITING_FOR_CLIMB: 'WAITING_FOR_CLIMB',
  CLIMBING: 'CLIMBING',
  RISING: 'RISING',
  READY: 'READY'
});

export class SaisupiSession {
  constructor() {
    this.epoch = 0;
    this.reset();
  }

  reset() {
    this.epoch += 1;
    this.phase = P1_PHASES.WAITING_FOR_CLIMB;
    this.busy = false;
    this.queuedDirection = null;
    return this.epoch;
  }

  invalidate() {
    return this.reset();
  }

  setPhase(phase) {
    this.phase = phase;
    return this.phase;
  }

  setBusy(busy) {
    this.busy = Boolean(busy);
    return this.busy;
  }

  queueDirection(direction) {
    if (!this.busy) return false;
    this.queuedDirection = direction;
    return true;
  }

  takeQueuedDirection() {
    const direction = this.queuedDirection;
    this.queuedDirection = null;
    return direction;
  }

  clearQueuedDirection() {
    this.queuedDirection = null;
  }
}
