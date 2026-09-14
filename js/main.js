import {
  DEFAULT_DIAGONAL_RATIO,
  DEFAULT_SWIPE_DISTANCE,
  directionFromDiagonalSwipe
} from './input-direction.js';
import { checkWebGL2Support } from './webgl-support.js';
import { MotionPreferences } from './motion-preferences.js';
import { StartRequestGate } from './saisupi-startup.js';

const app = document.querySelector('#app');
const homeScreen = document.querySelector('#home-screen');
const gameScreen = document.querySelector('#game-screen');
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
const motionPreferences = new MotionPreferences();
const startGate = new StartRequestGate();

let game = null;
let pointerStart = null;
let gameModulePromise = null;
let startPending = false;

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

function showHome() {
  startGate.invalidate();
  startPending = false;
  pointerStart = null;
  game?.setActive(false);
  game?.dispose();
  game = null;
  loading.hidden = true;
  webglErrorPanel.hidden = true;
  gameScreen.hidden = true;
  homeScreen.hidden = false;
  app.dataset.screen = 'home';
  phaseStatus.textContent = '待機中';
  runTime.textContent = '0.00秒';
  targetProgress.textContent = '達成 0/10';
  activeGameTitle.textContent = 'サイコロへ登る';
  setHomeError();
  window.setTimeout(() => startButton.focus(), 0);
}

function showGame(name) {
  activeGameTitle.textContent = name + 'のプレイ';
  homeScreen.hidden = true;
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

const callbacks = {
  onMessage: setMessage,
  onMove: () => {
    phaseStatus.textContent = '移動中';
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
    updateFromSnapshot(snapshot);
    setMessage('目標をそろえました');
  },
  onFinished: ({ snapshot }) => {
    updateFromSnapshot(snapshot);
    setMessage('完了。記録は' + snapshot.displayTime + 'です');
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

  const support = checkWebGL2Support();
  if (!support.available) {
    setHomeError('この端末またはブラウザでは3D表示を利用できません');
    return;
  }

  const requestId = startGate.begin();
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
  }
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
  requestMove(direction);
});

for (const button of directionButtons) {
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    requestMove(event.currentTarget.dataset.direction);
  });
  button.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    requestMove(event.currentTarget.dataset.direction);
  });
}

startButton.addEventListener('click', () => {
  void startGame();
});

homeButton.addEventListener('click', showHome);
webglErrorHome.addEventListener('click', showHome);

playerNameInput.addEventListener('input', () => {
  if (!playerNameError.hidden) showNameError();
});

document.addEventListener('contextmenu', (event) => {
  if (event.target.closest('input, a')) return;
  event.preventDefault();
});

document.addEventListener('gesturestart', (event) => event.preventDefault());

window.addEventListener('resize', () => {
  game?.resize();
});

window.addEventListener('pagehide', () => {
  startGate.invalidate();
  startPending = false;
  pointerStart = null;
  game?.dispose();
  game = null;
});

window.addEventListener('pageshow', () => {
  if (!game && app.dataset.screen === 'playing') showHome();
});

window.addEventListener('beforeunload', () => {
  motionPreferences.dispose();
});

showHome();
