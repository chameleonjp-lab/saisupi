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
    'サイコロを転がし、10個の目を揃えるタイムアタックゲーム',
    url
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
  pageUrl
}) {
  if (!result) {
    throw new TypeError('result is required');
  }

  const url = normalizeShareUrl(pageUrl);
  const lines = Number.isSafeInteger(result.scoreCentiseconds)
    && result.scoreCentiseconds >= 0
    ? [`サイスピを ${formatScore(requireScore(result.scoreCentiseconds))} でクリア`, url]
    : ['サイスピをプレイしました', url];
  const text = lines.join('\n');

  return Object.freeze({
    title: 'サイスピ',
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
