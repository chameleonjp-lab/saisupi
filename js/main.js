import {createSubmissionId, validSubmissionId, queueResult, readOutbox, acknowledgeResult} from './saisupi-outbox.js';
import { t, formatTime, initLanguage, getLanguage, setLanguage, LANGUAGES, CATALOGS, bindStaticTranslations } from './i18n/index.js';
import {
  CHAMELEONJP_LAB_URL,
  SAISUPI_GAME_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
} from './saisupi-config.js';
import {
  DEFAULT_DIAGONAL_RATIO,
  DEFAULT_SWIPE_DISTANCE,
  directionFromDiagonalSwipe
} from './input-direction.js';
import { MotionPreferences } from './motion-preferences.js';
import { StartRequestGate } from './saisupi-startup.js';
import {
  createHomeShareContent,
  createResultShareContent,
  RESULT_SHARE_STATUSES,
  shareResult
} from './saisupi-share.js';
import { RankingClient, RankingError, RANKING_CLIENT_VERSION } from './saisupi-ranking.js';
import { SoundEffects } from './saisupi-sound-effects.js';
import { checkWebGL2Support } from './webgl-support.js';

let preferenceStorage = null; try { preferenceStorage = localStorage; } catch {}
initLanguage(preferenceStorage, navigator);
const refreshStaticLanguage = bindStaticTranslations(document.body);
const app = document.querySelector('#app');
const homeScreen = document.querySelector('#home-screen');
const gameScreen = document.querySelector('#game-screen');
const resultScreen = document.querySelector('#result-screen');
const stage = document.querySelector('#stage');
const canvas = document.querySelector('#game-canvas');
const loading = document.querySelector('#loading');
const message = document.querySelector('#message');
const phaseStatus = document.querySelector('#phase-status');
const runTime = document.querySelector('#run-time');
const targetProgress = document.querySelector('#target-progress');
const playerNameInput = document.querySelector('#player-name-input');
const playerNameError = document.querySelector('#player-name-error');
const NAME_KEY = 'saisupi.player-name.v1';
const RESULT_KEY = 'saisupi.pending-result.v1';
try { playerNameInput.value = preferenceStorage?.getItem(NAME_KEY) ?? ''; } catch {}
const homeError = document.querySelector('#home-error');
const activeGameTitle = document.querySelector('#game-screen-title');
const startButton = document.querySelector('#start-button');
const homeButton = document.querySelector('#home-button');
const retireButton = document.querySelector('#retire-button');
const directionButtons = [...document.querySelectorAll('[data-direction]')];
const webglErrorPanel = document.querySelector('#webgl-error-panel');
const webglErrorStatus = document.querySelector('#webgl-error-status');
const webglErrorHome = document.querySelector('#webgl-error-home');
const homeShareButton = document.querySelector('#home-share-button');
const homeShareStatus = document.querySelector('#home-share-status');
const replayButton = document.querySelector('#replay-button');
const resultReplayButton = document.querySelector('#result-replay-button');
const resultHomeButton = document.querySelector('#result-home-button');
const resultShareButton = document.querySelector('#result-share-button');
const resultShareStatus = document.querySelector('#result-share-status');
const resultScore = document.querySelector('#result-score');
const resultRecordMessage = document.querySelector('#result-record-message');
const resultPlayerName = document.querySelector('#result-player-name');
const resultCleared = document.querySelector('#result-cleared');
const resultBestScore = document.querySelector('#result-best-score');
const resultDetailList = document.querySelector('#result-detail-list');
const resultRankingStatus = document.querySelector('#result-ranking-status');
const resultRankingList = document.querySelector('#result-ranking-list');
const resultRankingRetry = document.querySelector('#result-ranking-retry');
const soundToggle = document.querySelector('#sound-toggle');
const soundToggleIcon = document.querySelector('#sound-toggle-icon');
const soundToggleLabel = document.querySelector('#sound-toggle-label');
const soundStatus = document.querySelector('#sound-status');

const motionPreferences = new MotionPreferences();
const startGate = new StartRequestGate();
const soundEffects = new SoundEffects();
const rankingClient = createRankingClient();

let game = null;
let pointerStart = null;
let gameModulePromise = null;
let startPending = false;
let currentPlayerName = '';
let latestResult = null;
let roundToken = 0;
let rankingState = createRankingState();

function createRankingClient() {
  try {
    return new RankingClient({
      url: SUPABASE_URL,
      publishableKey: SUPABASE_PUBLISHABLE_KEY
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

function createRankingState(name = currentPlayerName) {
  return {
    token: roundToken,
    run: Object.freeze({displayName:name,submissionId:createSubmissionId(),clientVersion:RANKING_CLIENT_VERSION}),
    startRequested: false,
    startError: null,
    submissionAttempted: false,
    submission: null,
    submissionError: null,
    ranking: null,
    rankingError: null,
    syncPromise: null
  };
}

let messageSource = "", messageParameters = {};
function setMessage(text,parameters = {}) {
  messageSource=text;messageParameters=parameters;message.textContent = t(text,parameters);
}

function setHomeError(text = '') {
  homeError.textContent = text;
  homeError.hidden = text.length === 0;
}

function showNameError(text = '') {
  playerNameError.textContent = text;
  playerNameError.hidden = text.length === 0;
}

function capturePlayerName() {
  const name = playerNameInput.value.trim();
  if ([...name].length > 20) {
    showNameError(t('名前は20文字以内で入力してください'));
    playerNameInput.focus();
    return null;
  }
  showNameError();
  playerNameInput.value = name;
  try { preferenceStorage?.setItem(NAME_KEY,name); } catch {}
  return name;
}

function showHome() {
  startGate.invalidate();
  roundToken += 1;
  rankingState = createRankingState();
  startPending = false;
  pointerStart = null;
  latestResult = null;
  game?.setActive(false);
  game?.dispose();
  game = null;
  loading.hidden = true;
  webglErrorPanel.hidden = true;
  gameScreen.hidden = true;
  resultScreen.hidden = true;
  homeScreen.hidden = false;
  app.dataset.screen = 'home';
  delete app.dataset.resultType;
  phaseStatus.textContent = t('待機中');
  runTime.textContent = formatTime(0);
  targetProgress.textContent = t('達成 {count}/10', {count:0});
  activeGameTitle.textContent = t('サイコロへ登る');
  retireButton.disabled = true;
  homeShareStatus.textContent = '';
  resultShareStatus.textContent = '';
  setHomeError();
  refreshPendingResults();
  window.setTimeout(() => startButton.focus(), 0);
}

function showGame(name) {
  activeGameTitle.textContent = name ? t('{name}のプレイ', {name}) : t('サイコロへ登る');
  homeScreen.hidden = true;
  resultScreen.hidden = true;
  gameScreen.hidden = false;
  app.dataset.screen = 'playing';
  retireButton.disabled = startPending;
  phaseStatus.textContent = t('待機中');
  setMessage('埋まったサイコロへ近づいて登ります');
}

function showWebGLError(text) {
  webglErrorStatus.textContent = text;
  webglErrorPanel.hidden = false;
}

function updateFromSnapshot(snapshot) {
  if (!snapshot) return;
  const labels = {
    WAITING_FOR_CLIMB: t('待機中'),
    CLIMBING: t('登っています'),
    RISING: t('上昇中'),
    READY: t('移動できます'),
    RUNNING: t('計測中'),
    FINISHED: t('完了')
  };
  phaseStatus.textContent = labels[snapshot.phase] ?? t('操作中');
  runTime.textContent = formatTime(snapshot.scoreCentiseconds ?? 0);
  targetProgress.textContent = t('達成 {count}/10', {count:snapshot.completedTargetCount ?? 0});
}

function formatRankingScore(score) { return formatTime(score); }

function renderTargetDetails(snapshot) {
  resultDetailList.textContent = '';
  const timings = Array.isArray(snapshot.targetTimings) ? snapshot.targetTimings : [];
  for (let index = 1; index <= 10; index += 1) {
    const timing = timings.find((candidate) => candidate.index === index);
    const item = document.createElement('li');
    if (timing?.completed) item.classList.add('is-complete');
    const label = document.createElement('span');
    label.textContent = `${index}`;
    const value = document.createElement('strong');
    value.textContent = formatTime(timing?.scoreCentiseconds);
    item.append(label, value);
    resultDetailList.append(item);
  }
}

function renderRankingRows(rows) {
  resultRankingList.textContent = '';
  if (!Array.isArray(rows) || rows.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = t('まだランキング記録がありません');
    resultRankingList.append(empty);
    return;
  }
  for (const row of rows) {
    const item = document.createElement('li');
    const rank = document.createElement('strong');
    rank.textContent = `${row.rank}.`;
    const name = document.createElement('span');
    name.className = 'ranking-name';
    name.textContent = row.displayName;
    const score = document.createElement('span');
    score.className = 'ranking-score';
    score.textContent = formatRankingScore(row.score);
    item.append(rank, name, score);
    resultRankingList.append(item);
  }
}

function rankingFailureMessage(error) {
  if (error instanceof RankingError && error.status === 404) {
    return t('オンラインランキングは準備中です');
  }
  return t('オンラインランキングに接続できませんでした');
}

function setResultRecordMessage(text) {
  resultRecordMessage.textContent = text;
}

function startPlayRecording(name, token) {
  if (!name || rankingState.token !== token || rankingState.startRequested) return;
  rankingState.startRequested = true;
  if (!rankingClient) {
    rankingState.startError = new Error('ランキングクライアントを利用できません');
    return;
  }
  void rankingClient.startPlay({ displayName: name }).catch((error) => {
    if (token === roundToken && rankingState.token === token) {
      rankingState.startError = error;
    }
    console.error(error);
  });
}

async function syncResultRanking(snapshot, token) {
  if (
    !snapshot
    || token !== roundToken
    || rankingState.token !== token
    || rankingState.syncPromise
  ) return;

  const state = rankingState;
  const promise = (async () => {
    if (!rankingClient) {
      setResultRecordMessage(t('オンラインランキングは準備中です'));
      resultRankingStatus.textContent = t('ランキングは現在利用できません');
      resultRankingRetry.hidden = true;
      return;
    }

    if (snapshot.retired) {
      resultBestScore.textContent = '—';
      setResultRecordMessage(t('リタイアしたため、スコアは登録しません'));
    } else if (!state.run.displayName) {
      resultBestScore.textContent = '—';
      setResultRecordMessage(t('名前なしのため公開登録しません。'));
    } else if (!state.submission && !state.submissionAttempted) {
      state.submissionAttempted = true;
      resultRankingStatus.textContent = t('スコアを登録しています…');
      try {
        state.submission = await rankingClient.submitScore({
          displayName: state.run.displayName,
          submissionId: state.run.submissionId,
          clientVersion: state.run.clientVersion,
          score: snapshot.scoreCentiseconds
        });
        state.submissionError = null;
        try { acknowledgeResult(preferenceStorage,state.run.submissionId); refreshPendingResults(); } catch { /* Keep receipt; a later retry is idempotent. */ }
        if (token !== roundToken) return;
        resultBestScore.textContent = formatRankingScore(state.submission.bestScore);
        setResultRecordMessage(
          state.submission.isNewBest
            ? t('自己ベストを更新し、ランキングへ登録しました')
            : t('ランキングへ登録しました')
        );
      } catch (error) {
        state.submissionError = error;
        state.submissionAttempted = false;
        if (token !== roundToken) return;
        setResultRecordMessage(rankingFailureMessage(error));
        resultRankingRetry.hidden = false;
      }
    } else if (state.submission) {
      resultBestScore.textContent = formatRankingScore(state.submission.bestScore);
    }

    if (token !== roundToken) return;
    try {
      resultRankingStatus.textContent = t('ランキングを読み込んでいます…');
      state.ranking = await rankingClient.getTopRanking();
      state.rankingError = null;
      if (token !== roundToken) return;
      renderRankingRows(state.ranking);
      resultRankingStatus.textContent = t('上位30名');
    } catch (error) {
      state.rankingError = error;
      if (token !== roundToken) return;
      resultRankingStatus.textContent = rankingFailureMessage(error);
      resultRankingRetry.hidden = false;
    }
  })().finally(() => {
    if (rankingState === state) rankingState.syncPromise = null;
  });
  state.syncPromise = promise;

  await promise;
}

function showResult(snapshot, token) {
  if (!snapshot || token !== roundToken) return;
  const retired = snapshot.retired === true;
  latestResult = Object.freeze({ ...snapshot, retired });
  document.querySelector('#result-save-warning').hidden = true;
  try {
    queueResult(preferenceStorage,rankingState.run,latestResult);
    if(!preferenceStorage)throw Error('storage unavailable');
    preferenceStorage.setItem(RESULT_KEY,JSON.stringify({run:rankingState.run,result:latestResult}));
    document.querySelector('#last-result-button').hidden = false;
  } catch { document.querySelector('#result-save-warning').hidden = false; }
  game?.setActive(false);
  resultScore.textContent = retired ? t('リタイア') : formatTime(snapshot.scoreCentiseconds);
  resultScore.classList.toggle('is-retired', retired);
  resultPlayerName.textContent = currentPlayerName || '—';
  resultCleared.textContent = `${snapshot.completedTargetCount ?? 0}/10`;
  resultBestScore.textContent = retired ? '—' : t('送信中…');
  resultRankingStatus.textContent = t('読み込み中…');
  resultRankingRetry.hidden = true;
  resultShareStatus.textContent = '';
  setResultRecordMessage(retired ? t('リタイアしたため、スコアは登録しません') : t('ランキングへ送信しています…'));
  renderTargetDetails(snapshot);
  resultRankingList.replaceChildren();
  homeScreen.hidden = true;
  gameScreen.hidden = true;
  resultScreen.hidden = false;
  app.dataset.screen = 'result';
  app.dataset.resultType = retired ? 'retired' : 'clear';
  retireButton.disabled = true;
  void syncResultRanking(latestResult, token);
}

const callbacks = {
  onMessage: setMessage,
  onMove: () => {
    soundEffects.playFlick();
    phaseStatus.textContent = t('移動中');
  },
  onRollStart: () => {
    soundEffects.playRoll();
  },
  onMoveComplete: updateFromSnapshot,
  onClimbStart: () => {
    phaseStatus.textContent = t('登っています');
    setMessage('サイコロへ登っています');
  },
  onClimbComplete: () => {
    phaseStatus.textContent = t('上昇中');
  },
  onTargetsReady: ({ snapshot }) => {
    updateFromSnapshot(snapshot);
  },
  onExposed: ({ snapshot }) => {
    updateFromSnapshot(snapshot);
    setMessage('計測を開始しました。サイコロを目標へ合わせます');
  },
  onRoll: ({ top }) => {
    phaseStatus.textContent = t('移動できます');
    setMessage('サイコロの上面は{value}です', {value:top});
  },
  onTargetHit: ({ finished, snapshot }) => {
    if (!finished) soundEffects.playClear();
    updateFromSnapshot(snapshot);
    if (!finished) setMessage('目標をそろえました');
  },
  onFinished: ({ snapshot }) => {
    updateFromSnapshot(snapshot);
    const token = roundToken;
    showResult(snapshot, token);
  },
  onTick: updateFromSnapshot,
  onReset: updateFromSnapshot,
  onContextLost: () => {
    phaseStatus.textContent = t('3D復旧待ち');
    showWebGLError(t('3D表示を復旧するまで操作できません'));
  },
  onContextRestored: () => {
    webglErrorPanel.hidden = true;
    updateFromSnapshot(game?.getSnapshot());
  },
  onContextRecoveryFailed: () => {
    showWebGLError(t('3D表示を復旧できませんでした。ホームへ戻ってください'));
  },
  onVisibilityChange: (isVisible) => {
    soundEffects.handleVisibility(!isVisible);
    if (isVisible) updateFromSnapshot(game?.getSnapshot());
  }
};

async function ensureGame(requestId) {
  if (game) return true;
  if (!gameModulePromise) {
    gameModulePromise = import('./webgl-game.js').then(({ WebGLSaisupi }) => WebGLSaisupi);
  }

  try {
    const WebGLSaisupi = await gameModulePromise;
    if (!startGate.isCurrent(requestId) || app.dataset.screen !== 'playing') return false;
    const instance = new WebGLSaisupi(canvas, callbacks, {
      shouldReduceMotion: () => motionPreferences.reducedMotion
    });
    if (!startGate.isCurrent(requestId) || app.dataset.screen !== 'playing') {
      instance.dispose();
      return false;
    }
    game = instance;
    game.setActive(true);
    loading.hidden = true;
    return true;
  } catch (error) {
    console.error(error);
    gameModulePromise = null;
    loading.hidden = true;
    return false;
  }
}

async function startGame() {
  if (game || startPending) return;
  const name = capturePlayerName();
  if (name === null) return;

  void soundEffects.unlock();
  const support = checkWebGL2Support();
  if (!support.available) {
    setHomeError(t('この端末またはブラウザでは3D表示を利用できません'));
    return;
  }

  const requestId = startGate.begin();
  roundToken += 1;
  rankingState = createRankingState(name);
  const token = roundToken;
  currentPlayerName = name;
  startPending = true;
  setHomeError();
  showGame(name);
  loading.hidden = false;
  const ready = await ensureGame(requestId);
  if (!startGate.isCurrent(requestId) || app.dataset.screen !== 'playing') return;
  startPending = false;
  retireButton.disabled = false;
  if (!ready) {
    showHome();
    setHomeError(t('3D表示を開始できませんでした。通信状態を確認してください'));
    return;
  }
  startPlayRecording(name, token);
}

function retireGame() {
  if (!game || app.dataset.screen !== 'playing' || startPending) return;
  startGate.invalidate();
  roundToken += 1;
  rankingState = createRankingState();
  const token = roundToken;
  latestResult = null;
  game.setActive(false);
  showResult(Object.freeze({ ...game.getSnapshot(), retired: true }), token);
}

function replayGame() {
  if (startPending) return;
  if (!game) { void startGame(); return; }
  void soundEffects.unlock();
  startGate.invalidate();
  roundToken += 1;
  rankingState = createRankingState();
  const token = roundToken;
  latestResult = null;
  showGame(currentPlayerName);
  game.reset();
  game.setActive(true);
  startPlayRecording(currentPlayerName, token);
}

function requestMove(direction) {
  if (!game || app.dataset.screen !== 'playing' || !webglErrorPanel.hidden) return;
  const button = directionButtons.find(
    (candidate) => candidate.dataset.direction === direction
  );
  button?.classList.add('is-active');
  window.setTimeout(() => button?.classList.remove('is-active'), 120);
  game.move(direction);
}

function isEditableTarget(target) {
  return target instanceof Element
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

stage.addEventListener('pointerdown', (event) => {
  if (
    event.target.closest('[data-direction]')
    || app.dataset.screen !== 'playing'
    || !webglErrorPanel.hidden
  ) return;

  pointerStart = {
    x: event.clientX,
    y: event.clientY,
    id: event.pointerId
  };
  stage.setPointerCapture?.(event.pointerId);
});

stage.addEventListener('pointerup', (event) => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const deltaX = event.clientX - pointerStart.x;
  const deltaY = event.clientY - pointerStart.y;
  const direction = directionFromDiagonalSwipe(deltaX, deltaY, {
    minimumDistance: DEFAULT_SWIPE_DISTANCE,
    minimumDiagonalRatio: DEFAULT_DIAGONAL_RATIO
  });
  pointerStart = null;
  if (direction) {
    void soundEffects.unlock();
    requestMove(direction);
  } else if (Math.hypot(deltaX, deltaY) >= DEFAULT_SWIPE_DISTANCE) {
    setMessage('盤面に沿って斜め方向へフリックしてください');
  }
});

stage.addEventListener('pointercancel', () => {
  pointerStart = null;
});

const keyMap = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right'
};

document.addEventListener('keydown', (event) => {
  const direction = keyMap[event.key];
  if (!direction || app.dataset.screen !== 'playing' || !webglErrorPanel.hidden) return;
  event.preventDefault();
  void soundEffects.unlock();
  requestMove(direction);
});

for (const button of directionButtons) {
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    void soundEffects.unlock();
    requestMove(event.currentTarget.dataset.direction);
  });
  button.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    void soundEffects.unlock();
    requestMove(event.currentTarget.dataset.direction);
  });
}

async function handleHomeShare() {
  if (app.dataset.screen !== 'home') return;
  homeShareStatus.textContent = '';
  try {
    const content = createHomeShareContent({ pageUrl: SAISUPI_GAME_URL || window.location.href });
    const status = await shareResult(content);
    const fallback = document.querySelector('#home-share-fallback');
    fallback.value = content.copyText;
    fallback.hidden = status !== RESULT_SHARE_STATUSES.FAILED;
    homeShareStatus.textContent = {
      [RESULT_SHARE_STATUSES.SHARED]: t('Xの投稿画面を開きました'),
      [RESULT_SHARE_STATUSES.COPIED]: t('シェア文をコピーしました'),
      [RESULT_SHARE_STATUSES.CANCELLED]: t('共有をキャンセルしました'),
      [RESULT_SHARE_STATUSES.FAILED]: t('下のシェア文を選択してコピーできます')
    }[status];
  } catch (error) {
    console.error(error);
    homeShareStatus.textContent = t('下のシェア文を選択してコピーできます');
  }
}

async function handleResultShare() {
  if (app.dataset.screen !== 'result' || !latestResult) return;
  resultShareStatus.textContent = '';
  try {
    const content = createResultShareContent({
      result: latestResult,
      pageUrl: SAISUPI_GAME_URL || window.location.href
    });
    const status = await shareResult(content);
    const fallback = document.querySelector('#result-share-fallback');
    fallback.value = content.copyText;
    fallback.hidden = status !== RESULT_SHARE_STATUSES.FAILED;
    resultShareStatus.textContent = {
      [RESULT_SHARE_STATUSES.SHARED]: t('Xの投稿画面を開きました'),
      [RESULT_SHARE_STATUSES.COPIED]: t('結果のシェア文をコピーしました'),
      [RESULT_SHARE_STATUSES.CANCELLED]: t('共有をキャンセルしました'),
      [RESULT_SHARE_STATUSES.FAILED]: t('下のシェア文を選択してコピーできます')
    }[status];
  } catch (error) {
    console.error(error);
    resultShareStatus.textContent = t('下のシェア文を選択してコピーできます');
  }
}

function renderSoundToggle(snapshot = soundEffects.getSnapshot()) {
  soundToggle.setAttribute('aria-pressed', String(snapshot.enabled));
  soundToggle.setAttribute(
    'aria-label',
    snapshot.enabled ? t('効果音をオフにする') : t('効果音をオンにする')
  );
  soundToggleIcon.textContent = snapshot.enabled ? '🔊' : '🔇';
  soundToggleLabel.textContent = snapshot.enabled ? t('効果音 オン') : t('効果音 オフ');
}

soundToggle.addEventListener('click', async () => {
  soundToggle.disabled = true;
  const enabled = !soundEffects.getSnapshot().enabled;
  const snapshot = await soundEffects.setEnabled(enabled);
  renderSoundToggle(snapshot);
  soundStatus.textContent = enabled ? t('効果音をオンにしました') : t('効果音をオフにしました');
  if (enabled) soundEffects.playFlick();
  soundToggle.disabled = false;
});

startButton.addEventListener('click', () => {
  void startGame();
});
homeButton.addEventListener('click', showHome);
retireButton.addEventListener('click', retireGame);
webglErrorHome.addEventListener('click', showHome);
replayButton.addEventListener('click', replayGame);
resultReplayButton.addEventListener('click', replayGame);
resultHomeButton.addEventListener('click', showHome);
homeShareButton.addEventListener('click', () => {
  void handleHomeShare();
});
resultShareButton.addEventListener('click', () => {
  void handleResultShare();
});
resultRankingRetry.addEventListener('click', () => {
  if (latestResult) void syncResultRanking(latestResult, roundToken);
});

playerNameInput.addEventListener('input', () => {
  try { preferenceStorage?.setItem(NAME_KEY,playerNameInput.value); } catch {}
  if (!playerNameError.hidden) showNameError();
});

document.addEventListener('contextmenu', (event) => {
  if (isEditableTarget(event.target)) return;
  event.preventDefault();
});

for (const eventName of ['selectstart', 'copy', 'cut', 'paste', 'dragstart']) {
  document.addEventListener(eventName, (event) => {
    if (!isEditableTarget(event.target)) event.preventDefault();
  });
}

document.addEventListener('gesturestart', (event) => event.preventDefault());

window.addEventListener('resize', () => {
  game?.resize();
});

document.addEventListener('visibilitychange',()=>soundEffects.handleVisibility(document.hidden));

window.addEventListener('pagehide', () => {
  startGate.invalidate();
  roundToken += 1;
  startPending = false;
  pointerStart = null;
  game?.dispose();
  game = null;
  soundEffects.handleVisibility(true);
});

window.addEventListener('pageshow', () => {
  soundEffects.handleVisibility(false);
  if (!game && app.dataset.screen === 'playing') showHome();
});

window.addEventListener('beforeunload', () => {
  motionPreferences.dispose();
  soundEffects.dispose();
});

document.querySelector('#home-lab-link')?.setAttribute('href', CHAMELEONJP_LAB_URL);
document.querySelector('#result-lab-link')?.setAttribute('href', CHAMELEONJP_LAB_URL);
renderSoundToggle();
showHome();

const languageSelect = document.querySelector('#language-select');
for (const [id,label] of LANGUAGES) { const option=document.createElement('option');option.value=id;option.textContent=label;languageSelect.append(option); }
languageSelect.value = getLanguage();
languageSelect.addEventListener('change', () => {
  const reverse = new Map(Object.entries(CATALOGS[getLanguage()]).map(([source,value]) => [value,source]));
  setLanguage(languageSelect.value,preferenceStorage);
  for(const node of [message,phaseStatus,playerNameError,homeError,webglErrorStatus,resultRecordMessage,resultBestScore,resultRankingStatus,homeShareStatus,resultShareStatus,soundStatus]) { const source=reverse.get(node.textContent);if(source)node.textContent=t(source); }
  refreshStaticLanguage();renderSoundToggle();refreshPendingResults();
  setMessage(messageSource,messageParameters);
  if(game){updateFromSnapshot(game.getSnapshot());activeGameTitle.textContent=currentPlayerName?t('{name}のプレイ',{name:currentPlayerName}):t('サイコロへ登る');}
  const homeFallback=document.querySelector('#home-share-fallback');
  if(!homeFallback.hidden)homeFallback.value=createHomeShareContent({pageUrl:SAISUPI_GAME_URL}).copyText;
  const resultFallback=document.querySelector('#result-share-fallback');
  if(latestResult&&!resultFallback.hidden)resultFallback.value=createResultShareContent({result:latestResult,pageUrl:SAISUPI_GAME_URL}).copyText;
  if(latestResult) { resultScore.textContent=latestResult.retired?t('リタイア'):formatTime(latestResult.scoreCentiseconds);renderTargetDetails(latestResult);if(rankingState.ranking)renderRankingRows(rankingState.ranking);if(rankingState.submission)resultBestScore.textContent=formatTime(rankingState.submission.bestScore); }
});
refreshStaticLanguage();renderSoundToggle();

const lastResultButton = document.querySelector('#last-result-button');
function readSavedResult() {
  try {
    const saved=JSON.parse(preferenceStorage?.getItem(RESULT_KEY)??'null');
    if(saved?.run && saved.run.clientVersion===undefined)saved.run.clientVersion='saisupi-web-1';
    return saved && typeof saved.run?.displayName==='string' && (validSubmissionId(saved.run.submissionId)||saved.run.submissionId===null) && (saved.result?.retired===true || Number.isSafeInteger(saved.result?.scoreCentiseconds)) ? saved : null;
  } catch { return null; }
}
lastResultButton.hidden=!readSavedResult();
lastResultButton.addEventListener('click',()=>{
  const saved=readSavedResult();if(!saved)return;
  roundToken+=1;currentPlayerName=saved.run.displayName;rankingState=createRankingState();rankingState.run=Object.freeze(saved.run);
  showResult(Object.freeze(saved.result),roundToken);
});

const soundVolume = document.querySelector('#sound-volume');
soundVolume.value = String(soundEffects.getSnapshot().volume);
soundVolume.addEventListener('input',()=>{soundEffects.setVolume(Number(soundVolume.value));if(Number(soundVolume.value)>0)void soundEffects.unlock();});

function refreshPendingResults() {
 const host=document.querySelector('#pending-results');if(!host)return;host.replaceChildren();
 let entries=[];try {entries=readOutbox(preferenceStorage);}catch{return;}
 for(const saved of entries){const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent=`${t('送信待ち')} · ${formatTime(saved.result.scoreCentiseconds)}`;
  button.addEventListener('click',()=>{roundToken+=1;currentPlayerName=saved.run.displayName;rankingState=createRankingState();rankingState.run=Object.freeze(saved.run);showResult(Object.freeze(saved.result),roundToken);});host.append(button);}
}
refreshPendingResults();
