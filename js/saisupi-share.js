import {t,formatTime} from './i18n/index.js';
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
  return formatTime(scoreCentiseconds);
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
    t('サイスピ'),
    t('サイコロを転がし、10個の目を揃えるタイムアタックゲーム'),
    url,
    '#サイスピ #ゲーム制作'
  ].join('\n');

  return Object.freeze({
    title: t('サイスピ'),
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
    ? [t('サイスピを {time} でクリア',{time:formatScore(requireScore(result.scoreCentiseconds))}), url]
    : [t('サイスピをプレイしました'), url];
  const text = [...lines, '#サイスピ #ゲーム制作'].join('\n');

  return Object.freeze({
    title: t('サイスピ'),
    text,
    url,
    copyText: text
  });
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

export async function shareResult(content, navigatorObject = globalThis.navigator, windowObject = globalThis.window) {
  const intent = new URL('https://x.com/intent/post');
  intent.searchParams.set('text', content.text);
  try {
    const popup = windowObject?.open(intent.href, '_blank');
    if (popup) {
      popup.opener = null;
      return RESULT_SHARE_STATUSES.SHARED;
    }
  } catch { /* Copy remains available when a popup is blocked. */ }
  const copied = await copyShareText(navigatorObject, content.copyText);
  return copied ? RESULT_SHARE_STATUSES.COPIED : RESULT_SHARE_STATUSES.FAILED;
}
