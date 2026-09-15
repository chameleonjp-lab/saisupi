import { SAISUPI_GAME_SLUG } from './saisupi-config.js';

export const RANKING_LIMIT = 10;
export const RANKING_CLIENT_VERSION = 'saisupi-web-1';
const MAX_SCORE = 100_000_000;

export class RankingError extends Error {
  constructor(code, message, cause, { retryable = false, status = null, rpcName = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'RankingError';
    this.code = code;
    this.retryable = retryable === true;
    this.status = Number.isInteger(status) ? status : null;
    this.rpcName = typeof rpcName === 'string' ? rpcName : null;
  }
}

function normalizeEndpoint(url) {
  if (typeof url !== 'string' || !/^https:\/\/[^/]+\.supabase\.co\/?$/u.test(url)) {
    throw new TypeError('Supabase URL is invalid');
  }
  return url.replace(/\/$/u, '');
}

function requireDisplayName(displayName) {
  if (
    typeof displayName !== 'string'
    || displayName.trim() !== displayName
    || displayName.length < 1
    || [...displayName].length > 20
  ) throw new TypeError('displayName is invalid or not normalized');
  return displayName;
}

function requireScore(score) {
  if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) {
    throw new RangeError('score must be a safe non-negative integer');
  }
  return score;
}

function parseSingleRow(data, message) {
  if (!Array.isArray(data) || data.length !== 1 || !data[0]) {
    throw new RankingError('invalid-response', message);
  }
  return data[0];
}

function parseStartResponse(data, expected) {
  const row = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  if (
    row?.accepted !== true
    || row.game_slug !== expected.gameSlug
    || row.display_name !== expected.displayName
    || row.result_type !== 'play'
  ) throw new RankingError('invalid-response', 'プレイ開始の応答が不正です');
  return Object.freeze({
    started: true,
    gameSlug: row.game_slug,
    displayName: row.display_name
  });
}

function parseSubmitResponse(data, expected) {
  const row = parseSingleRow(data, 'スコア登録の応答が不正です');
  if (
    row.accepted !== true
    || row.result_display_name !== expected.displayName
    || !Number.isSafeInteger(row.result_best_score)
    || row.result_best_score < 0
    || row.result_best_score > MAX_SCORE
    || !Number.isSafeInteger(row.result_play_count)
    || row.result_play_count < 1
    || typeof row.is_first_play !== 'boolean'
    || typeof row.is_new_best !== 'boolean'
  ) throw new RankingError('invalid-response', 'スコア登録の応答が不正です');
  return Object.freeze({
    accepted: true,
    gameSlug: expected.gameSlug,
    displayName: row.result_display_name,
    submittedScore: expected.score,
    bestScore: row.result_best_score,
    playCount: row.result_play_count,
    isFirstPlay: row.is_first_play,
    isNewBest: row.is_new_best
  });
}

function parseRankingResponse(data) {
  if (!Array.isArray(data)) throw new RankingError('invalid-response', 'ランキングの応答が不正です');
  return Object.freeze(data.slice(0, RANKING_LIMIT).map((row, index) => {
    const rank = Number(row?.rank_no);
    const displayName = row?.display_name;
    const score = row?.best_score;
    if (
      !Number.isSafeInteger(rank)
      || rank < 1
      || typeof displayName !== 'string'
      || displayName.length < 1
      || !Number.isSafeInteger(score)
      || score < 0
      || score > MAX_SCORE
    ) throw new RankingError('invalid-response', 'ランキングの行が不正です');
    return Object.freeze({
      rank,
      displayName,
      score,
      playCount: Number.isSafeInteger(row.play_count) ? row.play_count : null,
      position: index + 1
    });
  }));
}

export class RankingClient {
  constructor({
    url,
    publishableKey,
    fetchImpl = globalThis.fetch,
    timeoutMs = 8_000
  }) {
    this.url = normalizeEndpoint(url);
    if (typeof publishableKey !== 'string' || publishableKey.length < 20) {
      throw new TypeError('Supabase publishable key is invalid');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch is unavailable');
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new RangeError('timeoutMs is invalid');
    this.publishableKey = publishableKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async #rpc(functionName, parameters) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = {
      apikey: this.publishableKey,
      Authorization: `Bearer ${this.publishableKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
    try {
      const response = await this.fetchImpl.call(
        globalThis,
        `${this.url}/rest/v1/rpc/${functionName}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(parameters),
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal
        }
      );
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok) {
        throw new RankingError(
          'request-failed',
          'ランキング通信に失敗しました',
          undefined,
          {
            retryable: response.status === 408
              || response.status === 425
              || response.status === 429
              || response.status >= 500,
            status: response.status,
            rpcName: functionName
          }
        );
      }
      return data;
    } catch (error) {
      if (error instanceof RankingError) throw error;
      if (error?.name === 'AbortError') {
        throw new RankingError('timeout', 'ランキング通信が時間切れになりました', error, {
          retryable: true,
          rpcName: functionName
        });
      }
      throw new RankingError('network', 'ランキングへ接続できませんでした', error, {
        retryable: true,
        rpcName: functionName
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async startPlay({ displayName }) {
    const expected = {
      displayName: requireDisplayName(displayName),
      gameSlug: SAISUPI_GAME_SLUG
    };
    const parameters = {
      p_display_name: expected.displayName,
      p_game_slug: expected.gameSlug,
      p_result_type: 'play',
      p_client_version: RANKING_CLIENT_VERSION
    };
    return parseStartResponse(await this.#rpc('record_game_play', parameters), expected);
  }

  async submitScore({ displayName, score }) {
    const expected = {
      displayName: requireDisplayName(displayName),
      gameSlug: SAISUPI_GAME_SLUG,
      score: requireScore(score)
    };
    const parameters = {
      p_display_name: expected.displayName,
      p_game_slug: expected.gameSlug,
      p_score: expected.score,
      p_client_version: RANKING_CLIENT_VERSION
    };
    return parseSubmitResponse(await this.#rpc('submit_score', parameters), expected);
  }

  async getTopRanking() {
    const parameters = {
      p_game_slug: SAISUPI_GAME_SLUG,
      p_limit: RANKING_LIMIT
    };
    return parseRankingResponse(await this.#rpc('get_best_score_ranking', parameters));
  }
}

export { parseRankingResponse, parseStartResponse, parseSubmitResponse };
