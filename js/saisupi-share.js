export const RESULT_SHARE_STATUSES = Object.freeze({
  SHARED: 'shared',
  COPIED: 'copied',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
});

function requireScore(score) {
  if (!Number.isSafeInteger(score) || score < 0) {
    throw new TypeError('scoreCentiseconds must be a non-negative safe integer');
  }
  return score;
}

function formatScore(scoreCentiseconds) {
  const seconds = Math.floor(scoreCentiseconds / 100);
  const fraction = String(scoreCentiseconds % 100).padStart(2, '0');
  return `${seconds}.${fraction}秒`;
}

function normalizeTiming(timing) {
  if (!timing || !Number.isSafeInteger(timing.index) || timing.index < 1) return null;
  if (!Number.isFinite(timing.elapsedMs) || timing.elapsedMs < 0) return null;
  return `${timing.index}:${formatScore(Math.floor(timing.elapsedMs / 10))}`;
}

export function normalizeShareUrl(pageUrl) {
  const url = new URL(pageUrl);
  url.search = '';
  url.hash = '';
  return url.href;
}

export function createHomeShareContent({ pageUrl }) {
  const url = normalizeShareUrl(pageUrl);
  const text = [
    'サイスピ',
    'サイコロを転がし、10個の目を上面にそろえるタイムアタックゲームです。',
    `URL: ${url}`,
    '#サイスピ'
  ].join('\n');

  return Object.freeze({
    title: 'サイスピ',
    text,
    url,
    copyText: text
  });
}

export function createResultShareContent({
  result,
  recordMessage = '結果を記録しました',
  pageUrl
}) {
  if (!result || typeof recordMessage !== 'string' || !recordMessage.trim()) {
    throw new TypeError('result and record message are required');
  }

  const score = requireScore(result.scoreCentiseconds);
  const timings = Array.isArray(result.targetTimings)
    ? result.targetTimings.map(normalizeTiming).filter(Boolean)
    : [];
  const url = normalizeShareUrl(pageUrl);
  const lines = [
    `サイスピで${formatScore(score)}！`,
    recordMessage.trim()
  ];
  if (timings.length > 0) lines.push(`達成タイム（1〜10） ${timings.join(' / ')}`);
  lines.push(`URL: ${url}`, '#サイスピ');
  const text = lines.join('\n');

  return Object.freeze({
    title: 'サイスピの結果',
    text,
    url,
    copyText: text
  });
}

function supportsShare(navigatorObject, shareData) {
  if (typeof navigatorObject?.share !== 'function') return false;
  if (typeof navigatorObject.canShare !== 'function') return true;
  try {
    return navigatorObject.canShare(shareData);
  } catch {
    return false;
  }
}

async function copyShareText(navigatorObject, text) {
  if (typeof navigatorObject?.clipboard?.writeText !== 'function') return false;
  try {
    await navigatorObject.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareResult(content, navigatorObject = globalThis.navigator) {
  const shareData = { title: content.title, text: content.text };
  if (supportsShare(navigatorObject, shareData)) {
    try {
      await navigatorObject.share(shareData);
      return RESULT_SHARE_STATUSES.SHARED;
    } catch (error) {
      if (error?.name === 'AbortError') return RESULT_SHARE_STATUSES.CANCELLED;
    }
  }
  const copied = await copyShareText(navigatorObject, content.copyText);
  return copied ? RESULT_SHARE_STATUSES.COPIED : RESULT_SHARE_STATUSES.FAILED;
}
