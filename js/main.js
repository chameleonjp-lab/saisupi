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
import { LIGHT_PILLAR_DURATION } from './saisupi-light-pillar.js';
import {
  createHomeShareContent,
  createResultShareContent,
  RESULT_SHARE_STATUSES,
  shareResult
} from './saisupi-share.js';
import { RankingClient, RankingError } from './saisupi-ranking.js';
import { SoundEffects } from './saisupi-sound-effects.js';
import { checkWebGL2Support } from './webgl-support.js';

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
const homeError = document.querySelector('#home-error');
const activeGameTitle = document.querySelector('#game-screen-title');
const startButton = document.querySelector('#start-button');
const homeButton = document.querySelector('#home-button');
const directionButtons = [...document.querySelectorAll('[data-direction]')];
const webglErrorPanel = document.querySelector('#webgl-error-panel');
const webglErrorStatus = document.querySelector('#webgl-error-status');
const webglErrorHome = document.querySelector('#webgl-error-home');
const homeShareButton = document.querySelector('#home-share-button');
const homeShareStatus = document.querySelector('#home-share-status');
const replayButton = document.querySelector('#replay-button');
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
let finishTimerId = null;
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

function createRankingState() {
  return {
    token: roundToken,
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

function setMessage(text) {
  message.textContent = text;
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
  if (name.length < 1) {
    showNameError('名前を入力してください');
    playerNameInput.focus();
    return null;
  }
  if ([...name].length > 20) {
    showNameError('名前は20文字以内で入力してください');
    playerNameInput.focus();
    return null;
  }
  showNameError();
  playerNameInput.value = name;
  return name;
}

function clearFinishTimer() {
  if (finishTimerId === null) return;
  window.clearTimeout(finishTimerId);
  finishTimerId = null;
}

function showHome() {
  startGate.invalidate();
  roundToken += 1;
  rankingState = createRankingState();
  clearFinishTimer();
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
  phaseStatus.textContent = '待機中';
  runTime.textContent = '0.00秒';
  targetProgress.textContent = '達成 0/10';
  activeGameTitle.textContent = 'サイコロへ登る';
  homeShareStatus.textContent = '';
  resultShareStatus.textContent = '';
  setHomeError();
  window.setTimeout(() => startButton.focus(), 0);
}

function showGame(name) {
  activeGameTitle.textContent = name + 'のプレイ';
  homeScreen.hidden = true;
  resultScreen.hidden = true;
  gameScreen.hidden = false;
  app.dataset.screen = 'playing';
  phaseStatus.textContent = '待機中';
  setMessage('埋まったサイコロへ近づいて登ります');
}

function showWebGLError(text) {
  webglErrorStatus.textContent = text;
  webglErrorPanel.hidden = false;
}

function updateFromSnapshot(snapshot) {
  if (!snapshot) return;
  const labels = {
    WAITING_FOR_CLIMB: '待機中',
    CLIMBING: '登っています',
    RISING: '上昇中',
    READY: '移動できます',
    RUNNING: '計測中',
    FINISHED: '完了'
  };
  phaseStatus.textContent = labels[snapshot.phase] ?? '操作中';
  runTime.textContent = snapshot.displayTime ?? '0.00秒';
  targetProgress.textContent = '達成 '
    + String(snapshot.completedTargetCount ?? 0)
    + '/'
    + String(snapshot.targetCount ?? 10);
}

function formatRankingScore(score) {
  if (!Number.isSafeInteger(score) || score < 0) return '--.--秒';
  const whole = Math.floor(score / 100);
  const fraction = String(score % 100).padStart(2, '0');
  return `${whole}.${fraction}秒`;
}

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
    value.textContent = timing?.displayTime ?? '--.--秒';
    item.append(label, value);
    resultDetailList.append(item);
  }
}

function renderRankingRows(rows) {
  resultRankingList.textContent = '';
  if (!Array.isArray(rows) || rows.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'まだランキング記録がありません';
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
    return 'オンラインランキングは準備中です';
  }
  return 'オンラインランキングに接続できませんでした';
}

function setResultRecordMessage(text) {
  resultRecordMessage.textContent = text;
}

function startPlayRecording(name, token) {
  if (rankingState.token !== token || rankingState.startRequested) return;
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
      setResultRecordMessage('オンラインランキングは準備中です');
      resultRankingStatus.textContent = 'ランキングは現在利用できません';
      resultRankingRetry.hidden = true;
      return;
    }

    if (!state.submission && !state.submissionAttempted) {
      state.submissionAttempted = true;
      resultRankingStatus.textContent = 'スコアを登録しています…';
      try {
        state.submission = await rankingClient.submitScore({
          displayName: currentPlayerName,
          score: snapshot.scoreCentiseconds
        });
        state.submissionError = null;
        if (token !== roundToken) return;
        resultBestScore.textContent = formatRankingScore(state.submission.bestScore);
        setResultRecordMessage(
          state.submission.isNewBest
            ? '自己ベストを更新し、ランキングへ登録しました'
            : 'ランキングへ登録しました'
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
      resultRankingStatus.textContent = 'ランキングを読み込んでいます…';
      state.ranking = await rankingClient.getTopRanking();
      state.rankingError = null;
      if (token !== roundToken) return;
      renderRankingRows(state.ranking);
      resultRankingStatus.textContent = '上位10人';
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
  latestResult = snapshot;
  finishTimerId = null;
  game?.setActive(false);
  resultScore.textContent = snapshot.displayTime ?? '--.--秒';
  resultPlayerName.textContent = currentPlayerName || '—';
  resultCleared.textContent = `${snapshot.completedTargetCount ?? 0}/10`;
  resultBestScore.textContent = '送信中…';
  resultRankingStatus.textContent = '読み込み中…';
  resultRankingRetry.hidden = true;
  resultShareStatus.textContent = '';
  setResultRecordMessage('ランキングへ送信しています…');
  renderTargetDetails(snapshot);
  renderRankingRows([]);
  homeScreen.hidden = true;
  gameScreen.hidden = true;
  resultScreen.hidden = false;
  app.dataset.screen = 'result';
  void syncResultRanking(snapshot, token);
}

const callbacks = {
  onMessage: setMessage,
  onMove: () => {
    soundEffects.playFlick();
    phaseStatus.textContent = '移動中';
  },
  onRollStart: () => {
    soundEffects.playRoll();
  },
  onMoveComplete: updateFromSnapshot,
  onClimbStart: () => {
    phaseStatus.textContent = '登っています';
    setMessage('サイコロへ登っています');
  },
  onClimbComplete: () => {
    phaseStatus.textContent = '上昇中';
  },
  onTargetsReady: ({ snapshot }) => {
    updateFromSnapshot(snapshot);
  },
  onExposed: ({ snapshot }) => {
    updateFromSnapshot(snapshot);
    setMessage('計測を開始しました。サイコロを目標へ合わせます');
  },
  onRoll: ({ top }) => {
    phaseStatus.textContent = '移動できます';
    setMessage('サイコロの上面は' + String(top) + 'です');
  },
  onTargetHit: ({ snapshot }) => {
    soundEffects.playClear();
    updateFromSnapshot(snapshot);
    setMessage('目標をそろえました');
  },
  onFinished: ({ snapshot }) => {
    updateFromSnapshot(snapshot);
    setMessage('完了。記録は' + snapshot.displayTime + 'です');
    clearFinishTimer();
    const token = roundToken;
    finishTimerId = window.setTimeout(() => {
      if (token !== roundToken || app.dataset.screen !== 'playing') return;
      showResult(snapshot, token);
    }, LIGHT_PILLAR_DURATION);
  },
  onTick: updateFromSnapshot,
  onReset: updateFromSnapshot,
  onContextLost: () => {
    phaseStatus.textContent = '3D復旧待ち';
    showWebGLError('3D表示を復旧するまで操作できません');
  },
  onContextRestored: () => {
    webglErrorPanel.hidden = true;
    updateFromSnapshot(game?.getSnapshot());
  },
  onContextRecoveryFailed: () => {
    showWebGLError('3D表示を復旧できませんでした。ホームへ戻ってください');
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
  if (!name) return;

  void soundEffects.unlock();
  const support = checkWebGL2Support();
  if (!support.available) {
    setHomeError('この端末またはブラウザでは3D表示を利用できません');
    return;
  }

  const requestId = startGate.begin();
  roundToken += 1;
  rankingState = createRankingState();
  const token = roundToken;
  currentPlayerName = name;
  startPending = true;
  setHomeError();
  showGame(name);
  loading.hidden = false;
  const ready = await ensureGame(requestId);
  if (!startGate.isCurrent(requestId) || app.dataset.screen !== 'playing') return;
  startPending = false;
  if (!ready) {
    showHome();
    setHomeError('3D表示を開始できませんでした。通信状態を確認してください');
    return;
  }
  startPlayRecording(name, token);
}

function replayGame() {
  if (!game || !currentPlayerName || startPending) return;
  void soundEffects.unlock();
  clearFinishTimer();
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
    && Boolean(target.closest('input, textarea, [contenteditable="true"]'));
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
    homeShareStatus.textContent = {
      [RESULT_SHARE_STATUSES.SHARED]: 'ゲームを共有しました',
      [RESULT_SHARE_STATUSES.COPIED]: 'シェア文をコピーしました',
      [RESULT_SHARE_STATUSES.CANCELLED]: '共有をキャンセルしました',
      [RESULT_SHARE_STATUSES.FAILED]: 'シェア文をコピーできませんでした'
    }[status];
  } catch (error) {
    console.error(error);
    homeShareStatus.textContent = 'シェア文をコピーできませんでした';
  }
}

async function handleResultShare() {
  if (app.dataset.screen !== 'result' || !latestResult) return;
  resultShareStatus.textContent = '';
  try {
    const recordMessage = resultRecordMessage.textContent || '結果を記録しました';
    const content = createResultShareContent({
      result: latestResult,
      recordMessage,
      pageUrl: SAISUPI_GAME_URL || window.location.href
    });
    const status = await shareResult(content);
    resultShareStatus.textContent = {
      [RESULT_SHARE_STATUSES.SHARED]: '結果を共有しました',
      [RESULT_SHARE_STATUSES.COPIED]: '結果のシェア文をコピーしました',
      [RESULT_SHARE_STATUSES.CANCELLED]: '共有をキャンセルしました',
      [RESULT_SHARE_STATUSES.FAILED]: 'シェア文をコピーできませんでした'
    }[status];
  } catch (error) {
    console.error(error);
    resultShareStatus.textContent = 'シェア文をコピーできませんでした';
  }
}

function renderSoundToggle(snapshot = soundEffects.getSnapshot()) {
  soundToggle.setAttribute('aria-pressed', String(snapshot.enabled));
  soundToggle.setAttribute(
    'aria-label',
    snapshot.enabled ? '効果音をオフにする' : '効果音をオンにする'
  );
  soundToggleIcon.textContent = snapshot.enabled ? '🔊' : '🔇';
  soundToggleLabel.textContent = snapshot.enabled ? '効果音 オン' : '効果音 オフ';
}

soundToggle.addEventListener('click', async () => {
  soundToggle.disabled = true;
  const enabled = !soundEffects.getSnapshot().enabled;
  const snapshot = await soundEffects.setEnabled(enabled);
  renderSoundToggle(snapshot);
  soundStatus.textContent = enabled ? '効果音をオンにしました' : '効果音をオフにしました';
  if (enabled) soundEffects.playFlick();
  soundToggle.disabled = false;
});

startButton.addEventListener('click', () => {
  void startGame();
});
homeButton.addEventListener('click', showHome);
webglErrorHome.addEventListener('click', showHome);
replayButton.addEventListener('click', replayGame);
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

window.addEventListener('pagehide', () => {
  startGate.invalidate();
  roundToken += 1;
  clearFinishTimer();
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
