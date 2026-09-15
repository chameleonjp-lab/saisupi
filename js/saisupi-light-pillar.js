export const LIGHT_PILLAR_DURATION = 1000;
export const LIGHT_PILLAR_GROW_DURATION = 220;
export const LIGHT_PILLAR_MAX_OPACITY = 0.38;

export function getLightPillarState(
  elapsedMs,
  {
    duration = LIGHT_PILLAR_DURATION,
    growDuration = LIGHT_PILLAR_GROW_DURATION,
    maxOpacity = LIGHT_PILLAR_MAX_OPACITY
  } = {}
) {
  if (
    !Number.isFinite(elapsedMs)
    || elapsedMs < 0
    || !Number.isFinite(duration)
    || duration <= 0
    || !Number.isFinite(growDuration)
    || growDuration <= 0
    || !Number.isFinite(maxOpacity)
    || maxOpacity <= 0
    || elapsedMs >= duration
  ) {
    return Object.freeze({
      visible: false,
      progress: 1,
      height: 0,
      opacity: 0
    });
  }

  const progress = Math.min(1, elapsedMs / growDuration);
  const fadeStart = Math.min(duration, Math.max(growDuration, duration * 0.68));
  const fadeProgress = elapsedMs <= fadeStart
    ? 0
    : (elapsedMs - fadeStart) / Math.max(1, duration - fadeStart);

  return Object.freeze({
    visible: true,
    progress,
    height: Math.max(0.05, progress),
    opacity: maxOpacity * (1 - Math.min(1, Math.max(0, fadeProgress)))
  });
}
