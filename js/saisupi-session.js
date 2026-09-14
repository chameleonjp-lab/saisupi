export const P1_PHASES = Object.freeze({
  WAITING_FOR_CLIMB: 'WAITING_FOR_CLIMB',
  CLIMBING: 'CLIMBING',
  RISING: 'RISING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  FINISHED: 'FINISHED'
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
    this.targets = [];
    this.completedTargetIds = new Set();
    this.startedAt = null;
    this.finishedAt = null;
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

  invalidateAnimation() {
    this.epoch += 1;
    this.busy = false;
    this.queuedDirection = null;
    return this.epoch;
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

  setTargets(targets) {
    if (!Array.isArray(targets) || targets.length !== 10) {
      throw new RangeError('目標は10個必要です');
    }
    const ids = new Set();
    for (const target of targets) {
      if (!target?.id || ids.has(target.id)) {
        throw new RangeError('目標IDが重複または不正です');
      }
      ids.add(target.id);
    }
    this.targets = Object.freeze(targets.map((target) => Object.freeze({ ...target })));
    this.completedTargetIds.clear();
    return this.targets;
  }

  startRunning(startedAt) {
    if (
      this.phase !== P1_PHASES.RISING
      || this.startedAt !== null
      || this.targets.length !== 10
      || !Number.isFinite(startedAt)
    ) return false;
    this.startedAt = startedAt;
    this.phase = P1_PHASES.RUNNING;
    return true;
  }

  completeTarget(targetId) {
    if (this.phase !== P1_PHASES.RUNNING) return false;
    if (!this.targets.some((target) => target.id === targetId)) return false;
    if (this.completedTargetIds.has(targetId)) return false;
    this.completedTargetIds.add(targetId);
    return true;
  }

  isRunComplete() {
    return this.targets.length === 10
      && this.completedTargetIds.size === this.targets.length;
  }

  finish(finishedAt) {
    if (
      this.phase !== P1_PHASES.RUNNING
      || this.finishedAt !== null
      || !Number.isFinite(finishedAt)
      || this.startedAt === null
      || finishedAt < this.startedAt
      || !this.isRunComplete()
    ) return false;
    this.finishedAt = finishedAt;
    this.phase = P1_PHASES.FINISHED;
    this.busy = false;
    this.queuedDirection = null;
    return true;
  }

  getTargetProgress() {
    return Object.freeze({
      completed: this.completedTargetIds.size,
      total: this.targets.length
    });
  }
}
