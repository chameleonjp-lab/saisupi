export const TIMER_FLASH_DURATION = 500;

export function getOneShotFlashIntensity(elapsedMs, duration = TIMER_FLASH_DURATION) {
  if (
    !Number.isFinite(elapsedMs)
    || elapsedMs < 0
    || !Number.isFinite(duration)
    || duration <= 0
    || elapsedMs >= duration
  ) return 0;

  return 1 - (elapsedMs / duration);
}
