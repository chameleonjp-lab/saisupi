import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { boardKey, isInsideBoard } from './board-rules.js';
import { BASE_ORIENTATION, Dice } from './dice.js';
import {
  BOARD_SIZE,
  BURIED_DICE_Y,
  DICE_SIZE,
  DICE_Y,
  FLOOR_Y,
  GROUND_PLAYER_Y,
  INITIAL_BURIED_DIE,
  INITIAL_PLAYER_POSITION,
  PLAYER_Y,
  RISE_DEPTH,
  RISE_DURATION,
  TARGET_LAYOUT_VERSION
} from './saisupi-config.js';
import {
  BOARD_BASE_SIZE,
  CAMERA_POSITION,
  CAMERA_TARGET,
  calculateCameraFrustum
} from './camera-framing.js';
import { getPerformanceProfile } from './performance-profile.js';
import { P1_PHASES, SaisupiSession } from './saisupi-session.js';
import { SaisupiClock } from './saisupi-clock.js';
import {
  TIMER_FLASH_DURATION,
  getOneShotFlashIntensity
} from './saisupi-flash.js';
import {
  TARGET_COUNT,
  generateTargetRun,
  judgeTargetLanding
} from './saisupi-targets.js';
import {
  LIGHT_PILLAR_DURATION,
  getLightPillarState
} from './saisupi-light-pillar.js';

const DIRECTIONS = Object.freeze({
  up: Object.freeze({
    row: -1,
    column: 0,
    axis: new THREE.Vector3(1, 0, 0),
    angle: -Math.PI / 2
  }),
  down: Object.freeze({
    row: 1,
    column: 0,
    axis: new THREE.Vector3(1, 0, 0),
    angle: Math.PI / 2
  }),
  left: Object.freeze({
    row: 0,
    column: -1,
    axis: new THREE.Vector3(0, 0, 1),
    angle: Math.PI / 2
  }),
  right: Object.freeze({
    row: 0,
    column: 1,
    axis: new THREE.Vector3(0, 0, 1),
    angle: -Math.PI / 2
  })
});

function trackResource(resources, resource) {
  resources.add(resource);
  return resource;
}

function disposeResources(resources) {
  for (const resource of resources) resource.dispose?.();
  resources.clear();
}

function gridToWorld(row, column, y = DICE_Y) {
  return new THREE.Vector3(column - (BOARD_SIZE - 1) / 2, y, row - (BOARD_SIZE - 1) / 2);
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function createPipPositions(value) {
  const a = 0.22;
  const positions = {
    1: [[0, 0]],
    2: [[-a, a], [a, -a]],
    3: [[-a, a], [0, 0], [a, -a]],
    4: [[-a, a], [a, a], [-a, -a], [a, -a]],
    5: [[-a, a], [a, a], [0, 0], [-a, -a], [a, -a]],
    6: [[-a, a], [a, a], [-a, 0], [a, 0], [-a, -a], [a, -a]]
  };
  return positions[value];
}

function addFacePips(group, value, face, pipGeometry, pipMaterial) {
  for (const [u, v] of createPipPositions(value)) {
    const pip = new THREE.Mesh(pipGeometry, pipMaterial);
    const edge = DICE_SIZE / 2 + 0.012;

    if (face === 'top') pip.position.set(u, edge, v);
    if (face === 'bottom') pip.position.set(u, -edge, -v);
    if (face === 'front') pip.position.set(u, v, edge);
    if (face === 'back') pip.position.set(-u, v, -edge);
    if (face === 'left') pip.position.set(-edge, v, u);
    if (face === 'right') pip.position.set(edge, v, -u);

    pip.renderOrder = 2;
    group.add(pip);
  }
}

function createDieMesh(
  useShadows,
  resources,
  dieGeometry,
  dieEdgeGeometry,
  dieEdgeMaterial,
  pipGeometry,
  pipMaterial
) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf4ead5,
    roughness: 0.36,
    metalness: 0.04,
    clearcoat: 0.22,
    clearcoatRoughness: 0.24,
    emissive: 0x000000,
    emissiveIntensity: 0
  });
  trackResource(resources, bodyMaterial);
  const body = new THREE.Mesh(dieGeometry, bodyMaterial);
  body.castShadow = useShadows;
  body.receiveShadow = useShadows;
  group.add(body);

  const edge = new THREE.LineSegments(dieEdgeGeometry, dieEdgeMaterial);
  edge.scale.setScalar(1.002);
  edge.renderOrder = 1;
  group.add(edge);

  addFacePips(group, 1, 'top', pipGeometry, pipMaterial);
  addFacePips(group, 6, 'bottom', pipGeometry, pipMaterial);
  addFacePips(group, 2, 'front', pipGeometry, pipMaterial);
  addFacePips(group, 5, 'back', pipGeometry, pipMaterial);
  addFacePips(group, 3, 'left', pipGeometry, pipMaterial);
  addFacePips(group, 4, 'right', pipGeometry, pipMaterial);

  group.userData.bodyMaterial = bodyMaterial;
  return group;
}

function createTargetPipPositions(value) {
  const a = 0.10;
  const positions = {
    1: [[0, 0]],
    2: [[-a, a], [a, -a]],
    3: [[-a, a], [0, 0], [a, -a]],
    4: [[-a, a], [a, a], [-a, -a], [a, -a]],
    5: [[-a, a], [a, a], [0, 0], [-a, -a], [a, -a]],
    6: [[-a, a], [a, a], [-a, 0], [a, 0], [-a, -a], [a, -a]]
  };
  return positions[value];
}

function createTargetMarker(target, {
  padGeometry,
  haloGeometry,
  ringGeometry,
  pipGlowGeometry,
  pipGeometry,
  padMaterial,
  haloMaterial,
  ringMaterial,
  pipGlowMaterial,
  pipMaterial
}) {
  const group = new THREE.Group();
  const pad = new THREE.Mesh(padGeometry, padMaterial);
  pad.renderOrder = 0;
  group.add(pad);

  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.018;
  halo.renderOrder = 1;
  group.add(halo);

  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  ring.renderOrder = 2;
  group.add(ring);

  for (const [u, v] of createTargetPipPositions(target.value)) {
    const glow = new THREE.Mesh(pipGlowGeometry, pipGlowMaterial);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(u, 0.031, v);
    glow.renderOrder = 3;
    group.add(glow);

    const pip = new THREE.Mesh(pipGeometry, pipMaterial);
    pip.rotation.x = -Math.PI / 2;
    pip.position.set(u, 0.038, v);
    pip.renderOrder = 4;
    group.add(pip);
  }

  group.position.copy(gridToWorld(target.row, target.column, FLOOR_Y + 0.065));
  group.userData.targetId = target.id;
  group.userData.halo = halo;
  group.userData.ring = ring;
  group.userData.pulseOffset = (Number.parseInt(String(target.id).slice(-2), 10) || 1) * 0.31;
  return group;
}

function setDieFlashIntensity(die, intensity) {
  const bodyMaterial = die.mesh?.userData.bodyMaterial;
  if (!bodyMaterial) return;
  if (intensity <= 0) {
    bodyMaterial.emissive.setHex(0x000000);
    bodyMaterial.emissiveIntensity = 0;
    return;
  }
  bodyMaterial.emissive.setHex(0xffc64b);
  bodyMaterial.emissiveIntensity = intensity * 2.1;
}

function createPlayer(useShadows, resources) {
  const player = new THREE.Group();
  const yellow = trackResource(resources, new THREE.MeshPhysicalMaterial({
    color: 0xf6bd3f,
    roughness: 0.34,
    metalness: 0.02,
    clearcoat: 0.20,
    clearcoatRoughness: 0.22,
    emissive: 0x251400,
    emissiveIntensity: 0.05
  }));
  const dark = trackResource(resources, new THREE.MeshStandardMaterial({
    color: 0x32220f,
    roughness: 0.54,
    metalness: 0.04
  }));
  const eyeWhite = trackResource(resources, new THREE.MeshPhysicalMaterial({
    color: 0xfff7e3,
    roughness: 0.24,
    clearcoat: 0.22,
    clearcoatRoughness: 0.18
  }));

  const body = new THREE.Mesh(
    trackResource(resources, new RoundedBoxGeometry(0.27, 0.34, 0.20, 5, 0.07)),
    yellow
  );
  body.position.y = 0.24;
  body.castShadow = useShadows;
  player.add(body);

  const head = new THREE.Mesh(
    trackResource(resources, new THREE.SphereGeometry(0.18, 28, 20)),
    yellow
  );
  head.position.y = 0.57;
  head.castShadow = useShadows;
  player.add(head);

  const eyeGeometry = trackResource(resources, new THREE.SphereGeometry(0.044, 18, 12));
  const pupilGeometry = trackResource(resources, new THREE.SphereGeometry(0.020, 14, 10));
  for (const x of [-0.065, 0.065]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeWhite);
    eye.position.set(x, 0.60, 0.158);
    player.add(eye);

    const pupil = new THREE.Mesh(pupilGeometry, dark);
    pupil.position.set(x, 0.60, 0.198);
    player.add(pupil);
  }

  const mouth = new THREE.Mesh(
    trackResource(resources, new THREE.TorusGeometry(0.042, 0.008, 8, 18, Math.PI)),
    dark
  );
  mouth.position.set(0, 0.522, 0.177);
  mouth.rotation.z = Math.PI;
  player.add(mouth);

  const limbGeometry = trackResource(resources, new THREE.CapsuleGeometry(0.035, 0.18, 6, 12));
  for (const x of [-0.13, 0.13]) {
    const arm = new THREE.Mesh(limbGeometry, yellow);
    arm.position.set(x, 0.28, 0);
    arm.rotation.z = x < 0 ? -0.28 : 0.28;
    arm.castShadow = useShadows;
    player.add(arm);
  }
  for (const x of [-0.075, 0.075]) {
    const leg = new THREE.Mesh(limbGeometry, yellow);
    leg.position.set(x, 0.02, 0);
    leg.castShadow = useShadows;
    player.add(leg);
  }

  player.scale.setScalar(0.9);
  return player;
}

export class WebGLSaisupi {
  constructor(canvas, callbacks = {}, options = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.shouldReduceMotion = typeof options.shouldReduceMotion === 'function'
      ? options.shouldReduceMotion
      : () => false;
    this.performanceProfile = options.performanceProfile ?? getPerformanceProfile();
    this.actionTimings = this.performanceProfile.actionTimings;
    this.getNow = typeof options.now === 'function'
      ? options.now
      : () => performance.now();
    this.random = typeof options.random === 'function'
      ? options.random
      : Math.random;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1018);
    this.scene.fog = new THREE.Fog(0x0b1018, 10, 19);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.performanceProfile.antialias,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;
    this.renderer.shadowMap.enabled = this.performanceProfile.shadows;
    if (this.performanceProfile.shadows) {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 50);
    this.camera.position.set(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);
    this.camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);

    this.resources = new Set();
    this.dieGeometry = trackResource(
      this.resources,
      new RoundedBoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE, 8, 0.14)
    );
    this.dieEdgeGeometry = trackResource(
      this.resources,
      new THREE.EdgesGeometry(this.dieGeometry, 22)
    );
    this.dieEdgeMaterial = trackResource(this.resources, new THREE.LineBasicMaterial({
      color: 0x8d795f,
      transparent: true,
      opacity: 0.42
    }));
    this.pipGeometry = trackResource(
      this.resources,
      new THREE.SphereGeometry(0.067, 16, 12)
    );
    this.pipMaterial = trackResource(this.resources, new THREE.MeshPhysicalMaterial({
      color: 0x17130f,
      roughness: 0.38,
      metalness: 0.06,
      clearcoat: 0.16,
      clearcoatRoughness: 0.24,
      emissive: 0x080401,
      emissiveIntensity: 0.16
    }));
    this.targetPadGeometry = trackResource(
      this.resources,
      new THREE.CylinderGeometry(0.43, 0.43, 0.035, 48)
    );
    this.targetHaloGeometry = trackResource(
      this.resources,
      new THREE.CircleGeometry(0.43, 48)
    );
    this.targetRingGeometry = trackResource(
      this.resources,
      new THREE.RingGeometry(0.27, 0.33, 48)
    );
    this.targetPipGeometry = trackResource(
      this.resources,
      new THREE.CircleGeometry(0.064, 24)
    );
    this.targetPipGlowGeometry = trackResource(
      this.resources,
      new THREE.CircleGeometry(0.105, 24)
    );
    this.targetPadMaterial = trackResource(this.resources, new THREE.MeshStandardMaterial({
      color: 0x3e2c1b,
      roughness: 0.42,
      metalness: 0.18,
      emissive: 0x241000,
      emissiveIntensity: 0.22
    }));
    this.targetHaloMaterial = trackResource(this.resources, new THREE.MeshBasicMaterial({
      color: 0xffa51f,
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));
    this.targetRingMaterial = trackResource(this.resources, new THREE.MeshBasicMaterial({
      color: 0xffbd42,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));
    this.targetPipMaterial = trackResource(this.resources, new THREE.MeshBasicMaterial({
      color: 0xfff6cc,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));
    this.targetPipGlowMaterial = trackResource(this.resources, new THREE.MeshBasicMaterial({
      color: 0xffbd42,
      transparent: true,
      opacity: 0.30,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));
    this.lightPillarGeometry = trackResource(
      this.resources,
      new THREE.CylinderGeometry(0.30, 0.30, 1, 32, 1, true)
    );
    this.lightPillarCoreGeometry = trackResource(
      this.resources,
      new THREE.CylinderGeometry(0.11, 0.16, 1, 24, 1, true)
    );
    this.lightPillarRingGeometry = trackResource(
      this.resources,
      new THREE.TorusGeometry(0.25, 0.024, 8, 48)
    );

    this.dice = new Map();
    this.session = new SaisupiSession();
    this.clock = new SaisupiClock({ now: () => this.getGameTime() });
    this.targetRun = null;
    this.targetMarkers = new Map();
    this.lightPillars = new Set();
    this.player = createPlayer(this.performanceProfile.shadows, this.resources);
    this.scene.add(this.player);
    this.playerRow = INITIAL_PLAYER_POSITION.row;
    this.playerColumn = INITIAL_PLAYER_POSITION.column;
    this.activeKey = null;
    this.diceSequence = 0;
    this.epoch = this.session.epoch;
    this.animationFrameTasks = new Set();
    this.animationCancellers = new Set();
    this.frameId = null;
    this.renderActive = false;
    this.isVisible = !document.hidden;
    this.contextLost = false;
    this.disposed = false;
    this.renderClock = new THREE.Clock();

    this.createLights();
    this.createBoard();
    this.bindLifecycleEvents();

    const parent = this.canvas.parentElement;
    this.resizeObserver = typeof ResizeObserver === 'function' && parent
      ? new ResizeObserver(() => this.resize())
      : null;
    this.resizeObserver?.observe(parent);
    this.reset();
    this.resize();
  }

  bindLifecycleEvents() {
    this.handleContextLost = (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.interruptAnimations();
      this.cancelFrame();
      this.callbacks.onContextLost?.();
    };

    this.handleContextRestored = () => {
      try {
        this.renderer.resetState?.();
        this.resize();
        this.contextLost = false;
        this.callbacks.onContextRestored?.();
        this.requestFrame();
      } catch (error) {
        console.error(error);
        this.contextLost = true;
        this.callbacks.onContextRecoveryFailed?.();
      }
    };

    this.handleVisibilityChange = () => {
      this.isVisible = !document.hidden;
      if (!this.isVisible) this.interruptAnimations();
      if (this.isVisible) this.requestFrame();
      else this.cancelFrame();
      this.callbacks.onVisibilityChange?.(this.isVisible);
    };

    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  createLights() {
    const hemisphere = new THREE.HemisphereLight(0xfff1ce, 0x192235, 1.55);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xffe0a0, 3.2);
    key.position.set(-4, 10, 6);
    key.castShadow = this.performanceProfile.shadows;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.bias = -0.0008;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x6d8fd8, 1.25);
    rim.position.set(7, 5, -7);
    this.scene.add(rim);

    const warmFill = new THREE.PointLight(0xffbd58, 3.6, 12, 2);
    warmFill.position.set(-1.6, 5.2, 2.8);
    this.scene.add(warmFill);

    const coolFill = new THREE.PointLight(0x6f8fff, 2.1, 11, 2);
    coolFill.position.set(4.6, 2.4, -4.4);
    this.scene.add(coolFill);
  }

  createBoard() {
    const environmentGeometry = trackResource(
      this.resources,
      new THREE.PlaneGeometry(24, 24)
    );
    const environmentMaterial = trackResource(this.resources, new THREE.MeshStandardMaterial({
      color: 0x080d16,
      roughness: 0.94,
      metalness: 0
    }));
    const environment = new THREE.Mesh(environmentGeometry, environmentMaterial);
    environment.rotation.x = -Math.PI / 2;
    environment.position.y = -0.58;
    environment.receiveShadow = true;
    this.scene.add(environment);

    const baseGeometry = trackResource(
      this.resources,
      new RoundedBoxGeometry(BOARD_BASE_SIZE, 0.48, BOARD_BASE_SIZE, 8, 0.24)
    );
    const baseMaterial = trackResource(this.resources, new THREE.MeshPhysicalMaterial({
      color: 0x151c2a,
      roughness: 0.58,
      metalness: 0.12,
      clearcoat: 0.25,
      clearcoatRoughness: 0.32
    }));
    const base = new THREE.Mesh(
      baseGeometry,
      baseMaterial
    );
    base.position.y = -0.28;
    base.receiveShadow = this.performanceProfile.shadows;
    base.castShadow = this.performanceProfile.shadows;
    this.scene.add(base);

    const tileGeometry = trackResource(
      this.resources,
      new RoundedBoxGeometry(0.92, 0.10, 0.92, 6, 0.08)
    );
    const materials = [
      trackResource(this.resources, new THREE.MeshStandardMaterial({
        color: 0x323b4b,
        roughness: 0.68,
        metalness: 0.08,
        emissive: 0x070a11,
        emissiveIntensity: 0.28
      })),
      trackResource(this.resources, new THREE.MeshStandardMaterial({
        color: 0x27303f,
        roughness: 0.73,
        metalness: 0.06,
        emissive: 0x050810,
        emissiveIntensity: 0.24
      }))
    ];

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        const tile = new THREE.Mesh(tileGeometry, materials[(row + column) % 2]);
        tile.position.set(
          column - (BOARD_SIZE - 1) / 2,
          FLOOR_Y,
          row - (BOARD_SIZE - 1) / 2
        );
        tile.receiveShadow = this.performanceProfile.shadows;
        this.scene.add(tile);
      }
    }

    const frameMaterial = trackResource(this.resources, new THREE.MeshStandardMaterial({
      color: 0x86602f,
      roughness: 0.34,
      metalness: 0.52,
      emissive: 0x2a1505,
      emissiveIntensity: 0.20
    }));
    const frameLongGeometry = trackResource(
      this.resources,
      new RoundedBoxGeometry(7.92, 0.09, 0.075, 6, 0.028)
    );
    const frameShortGeometry = trackResource(
      this.resources,
      new RoundedBoxGeometry(0.075, 0.09, 7.92, 6, 0.028)
    );
    for (const z of [-4.03, 4.03]) {
      const rail = new THREE.Mesh(frameLongGeometry, frameMaterial);
      rail.position.set(0, 0.092, z);
      rail.castShadow = this.performanceProfile.shadows;
      rail.receiveShadow = this.performanceProfile.shadows;
      this.scene.add(rail);
    }
    for (const x of [-4.03, 4.03]) {
      const rail = new THREE.Mesh(frameShortGeometry, frameMaterial);
      rail.position.set(x, 0.092, 0);
      rail.castShadow = this.performanceProfile.shadows;
      rail.receiveShadow = this.performanceProfile.shadows;
      this.scene.add(rail);
    }

    const grid = new THREE.GridHelper(BOARD_SIZE, BOARD_SIZE, 0xc28a3e, 0x69758a);
    grid.position.y = 0.065;
    grid.material.transparent = true;
    grid.material.opacity = 0.38;
    trackResource(this.resources, grid.geometry);
    if (Array.isArray(grid.material)) {
      for (const material of grid.material) trackResource(this.resources, material);
    } else {
      trackResource(this.resources, grid.material);
    }
    this.scene.add(grid);
  }

  reset() {
    if (this.disposed) return;
    this.epoch = this.session.reset();
    this.cancelAnimationWaiters();
    this.animationFrameTasks.clear();
    this.cancelFrame();
    this.clock.reset();
    this.targetRun = null;
    this.removeTargetMarkers();
    this.removeLightPillars();

    for (const die of this.dice.values()) this.removeDie(die);
    this.dice.clear();
    this.diceSequence = 0;

    const buriedDie = this.addDie(
      INITIAL_BURIED_DIE.row,
      INITIAL_BURIED_DIE.column,
      INITIAL_BURIED_DIE.state,
      INITIAL_BURIED_DIE.id
    );
    buriedDie.mesh.position.y = BURIED_DICE_Y;
    buriedDie.mesh.userData.bodyMaterial.emissive.setHex(0x12304a);
    buriedDie.mesh.userData.bodyMaterial.emissiveIntensity = 0.28;

    this.playerRow = INITIAL_PLAYER_POSITION.row;
    this.playerColumn = INITIAL_PLAYER_POSITION.column;
    this.activeKey = null;
    this.player.rotation.set(0, 0, 0);
    this.placePlayer();
    this.callbacks.onReset?.(this.getSnapshot());
    this.callbacks.onMessage?.('埋まったサイコロへ近づいて登ります');
    this.requestFrame();
  }

  removeTargetMarkers() {
    for (const marker of this.targetMarkers.values()) this.scene.remove(marker);
    this.targetMarkers.clear();
  }

  removeLightPillar(effect) {
    if (!effect || !this.lightPillars.delete(effect)) return;
    this.scene.remove(effect.group);
    for (const material of effect.materials ?? [effect.material]) {
      this.resources.delete(material);
      material.dispose();
    }
  }

  removeLightPillars() {
    for (const effect of [...this.lightPillars]) this.removeLightPillar(effect);
  }

  startLightPillar(target, startedAt) {
    if (!target || !Number.isFinite(startedAt)) return false;
    const outerMaterial = trackResource(this.resources, new THREE.MeshBasicMaterial({
      color: 0xffd66b,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));
    const coreMaterial = trackResource(this.resources, new THREE.MeshBasicMaterial({
      color: 0xfff2a8,
      transparent: true,
      opacity: 0.54,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));
    const ringMaterial = trackResource(this.resources, new THREE.MeshBasicMaterial({
      color: 0xffc95c,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));
    const group = new THREE.Group();
    const outerMesh = new THREE.Mesh(this.lightPillarGeometry, outerMaterial);
    const coreMesh = new THREE.Mesh(this.lightPillarCoreGeometry, coreMaterial);
    const ringMesh = new THREE.Mesh(this.lightPillarRingGeometry, ringMaterial);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.scale.setScalar(0.72);
    ringMesh.position.y = 0.028;
    ringMesh.renderOrder = 3;
    group.add(ringMesh);
    const initialState = getLightPillarState(0);
    for (const [mesh, renderOrder] of [[outerMesh, 4], [coreMesh, 5]]) {
      mesh.scale.y = initialState.height;
      mesh.position.y = initialState.height / 2;
      mesh.renderOrder = renderOrder;
      group.add(mesh);
    }
    group.position.copy(gridToWorld(target.row, target.column, FLOOR_Y + 0.065));
    group.userData.targetId = target.id;
    this.scene.add(group);
    const effect = {
      group,
      meshes: [outerMesh, coreMesh],
      ring: ringMesh,
      ringMaterial,
      ringDuration: 640,
      materials: [outerMaterial, coreMaterial, ringMaterial],
      startedAt,
      duration: LIGHT_PILLAR_DURATION
    };
    this.lightPillars.add(effect);
    return true;
  }

  updateLightPillars(now) {
    for (const effect of [...this.lightPillars]) {
      const elapsed = now - effect.startedAt;
      if (elapsed < 0) continue;
      const state = getLightPillarState(elapsed, { duration: effect.duration });
      if (!state.visible) {
        this.removeLightPillar(effect);
        continue;
      }
      for (const mesh of effect.meshes) {
        mesh.scale.y = state.height;
        mesh.position.y = state.height / 2;
      }
      effect.materials[0].opacity = state.opacity;
      effect.materials[1].opacity = Math.min(0.66, state.opacity * 1.45);
      const ringProgress = Math.min(
        1,
        Math.max(0, elapsed / effect.ringDuration)
      );
      const ringScale = 0.72 + easeOutCubic(ringProgress) * 1.65;
      effect.ring.scale.setScalar(ringScale);
      effect.ring.rotation.z = elapsed * 0.0018;
      effect.ringMaterial.opacity = 0.86 * (1 - ringProgress);
    }
  }

  prepareTargets() {
    if (this.targetRun) return this.targetRun;
    const run = generateTargetRun({ random: this.random });
    this.targetRun = run;
    this.session.setTargets(run.targets);
    for (const target of run.targets) {
      const marker = createTargetMarker(target, {
        padGeometry: this.targetPadGeometry,
        haloGeometry: this.targetHaloGeometry,
        ringGeometry: this.targetRingGeometry,
        pipGlowGeometry: this.targetPipGlowGeometry,
        pipGeometry: this.targetPipGeometry,
        padMaterial: this.targetPadMaterial,
        haloMaterial: this.targetHaloMaterial,
        ringMaterial: this.targetRingMaterial,
        pipGlowMaterial: this.targetPipGlowMaterial,
        pipMaterial: this.targetPipMaterial
      });
      this.targetMarkers.set(target.id, marker);
      this.scene.add(marker);
    }
    return run;
  }

  updateTargetMarkers(elapsedSeconds) {
    const reduceMotion = this.shouldReduceMotion();
    for (const marker of this.targetMarkers.values()) {
      if (!marker.visible) continue;
      const pulse = reduceMotion
        ? 0.5
        : 0.5 + 0.5 * Math.sin(elapsedSeconds * 3.4 + marker.userData.pulseOffset);
      const markerScale = 1 + pulse * 0.035;
      marker.scale.setScalar(markerScale);
      marker.userData.halo.scale.setScalar(1 + pulse * 0.12);
      marker.userData.ring.scale.setScalar(1 + pulse * 0.05);
    }
  }

  setActive(active) {
    this.renderActive = Boolean(active);
    if (!this.renderActive) {
      this.cancelFrame();
      return;
    }
    this.requestFrame();
  }

  getSnapshot() {
    const activeDie = this.activeKey ? this.dice.get(this.activeKey) : null;
    const clockSnapshot = this.clock.getSnapshot(this.getGameTime());
    const progress = this.session.getTargetProgress();
    return Object.freeze({
      phase: this.session.phase,
      playerRow: this.playerRow,
      playerColumn: this.playerColumn,
      activeKey: this.activeKey,
      busy: this.session.busy,
      buriedDie: [...this.dice.values()].find((die) => die.state === 'buried')?.id ?? null,
      upperFace: activeDie?.top ?? null,
      targetLayoutVersion: this.targetRun?.layoutVersion ?? TARGET_LAYOUT_VERSION,
      targetCount: this.targetRun?.targets.length ?? TARGET_COUNT,
      completedTargetCount: progress.completed,
      completedTargetIds: Object.freeze([...this.session.completedTargetIds]),
      targetTimings: this.session.getTargetTimings(),
      elapsedMs: clockSnapshot.elapsedMs,
      scoreCentiseconds: clockSnapshot.scoreCentiseconds,
      displayTime: clockSnapshot.displayTime,
      contextLost: this.contextLost
    });
  }

  addDie(row, column, state, id) {
    this.diceSequence += 1;
    const die = new Dice(id ?? 'die-' + String(this.diceSequence), row, column, {
      ...BASE_ORIENTATION
    });
    die.state = state;
    die.mesh = createDieMesh(
      this.performanceProfile.shadows,
      this.resources,
      this.dieGeometry,
      this.dieEdgeGeometry,
      this.dieEdgeMaterial,
      this.pipGeometry,
      this.pipMaterial
    );
    die.mesh.position.copy(gridToWorld(row, column));
    this.scene.add(die.mesh);
    this.dice.set(boardKey(row, column), die);
    return die;
  }

  removeDie(die) {
    this.scene.remove(die.mesh);
    const bodyMaterial = die.mesh.userData.bodyMaterial;
    if (bodyMaterial) {
      this.resources.delete(bodyMaterial);
      bodyMaterial.dispose();
    }
  }

  placePlayer() {
    const activeDie = this.activeKey ? this.dice.get(this.activeKey) : null;
    const y = activeDie
      ? activeDie.mesh.position.y + (PLAYER_Y - DICE_Y)
      : GROUND_PLAYER_Y;
    this.player.position.copy(gridToWorld(this.playerRow, this.playerColumn, y));
  }

  syncSessionPhase() {
    const activeDie = this.activeKey ? this.dice.get(this.activeKey) : null;
    const phase = activeDie?.state === 'rising'
      ? P1_PHASES.RISING
      : activeDie?.state === 'normal'
        ? P1_PHASES.READY
        : P1_PHASES.WAITING_FOR_CLIMB;
    this.session.setPhase(phase);
  }

  restoreStableAnimationState() {
    const previousPhase = this.session.phase;
    for (const die of this.dice.values()) {
      if (die.motionStartPosition) {
        die.mesh.position.copy(die.motionStartPosition);
        delete die.motionStartPosition;
      }
      if (die.motionStartQuaternion) {
        die.mesh.quaternion.copy(die.motionStartQuaternion);
        delete die.motionStartQuaternion;
      }
    }
    this.player.rotation.z = 0;
    this.placePlayer();
    if (
      previousPhase === P1_PHASES.RUNNING
      || previousPhase === P1_PHASES.FINISHED
    ) {
      this.session.setPhase(previousPhase);
    } else {
      this.syncSessionPhase();
    }
  }

  interruptAnimations() {
    this.epoch = this.session.invalidateAnimation();
    this.cancelAnimationWaiters();
    this.restoreStableAnimationState();
  }

  move(directionName) {
    if (!DIRECTIONS[directionName] || !this.renderActive || !this.isVisible) return;
    if (this.contextLost) {
      this.callbacks.onMessage?.('3D表示を復帰するまで操作できません');
      return;
    }
    if (this.session.phase === P1_PHASES.FINISHED) return;
    if (this.session.phase === P1_PHASES.RISING) {
      this.callbacks.onMessage?.('サイコロが上がりきるまで待ちます');
      return;
    }

    if (this.session.busy) {
      this.session.queueDirection(directionName);
      return;
    }

    const direction = DIRECTIONS[directionName];
    const nextRow = this.playerRow + direction.row;
    const nextColumn = this.playerColumn + direction.column;
    if (!isInsideBoard(nextRow, nextColumn, BOARD_SIZE)) {
      this.callbacks.onMessage?.('盤面の端です');
      return;
    }

    const nextKey = boardKey(nextRow, nextColumn);
    const targetDie = this.dice.get(nextKey);
    const currentDie = this.activeKey ? this.dice.get(this.activeKey) : null;

    if (targetDie?.state === 'rising') {
      this.callbacks.onMessage?.('サイコロが上がりきるまで待ちます');
      return;
    }

    if (currentDie?.state === 'normal') {
      this.callbacks.onMove?.();
      if (targetDie) void this.hopTo(targetDie, nextKey, directionName);
      else void this.rollDie(currentDie, nextRow, nextColumn, nextKey, directionName);
      return;
    }

    if (currentDie?.state === 'rising') {
      this.callbacks.onMessage?.('サイコロが上がりきるまで待ちます');
      return;
    }

    if (targetDie?.state === 'buried' || targetDie?.state === 'normal') {
      this.callbacks.onMove?.();
      void this.hopTo(targetDie, nextKey, directionName);
      return;
    }

    this.callbacks.onMove?.();
    void this.moveOnFloor(nextRow, nextColumn, directionName);
  }

  async hopTo(targetDie, nextKey, directionName) {
    const wasBuried = targetDie.state === 'buried';
    const epoch = this.epoch;
    this.session.setBusy(true);
    this.session.setPhase(wasBuried ? P1_PHASES.CLIMBING : P1_PHASES.READY);
    this.callbacks.onClimbStart?.({
      row: targetDie.row,
      column: targetDie.column,
      buried: wasBuried
    });

    const start = this.player.position.clone();
    const end = gridToWorld(
      targetDie.row,
      targetDie.column,
      targetDie.mesh.position.y + (PLAYER_Y - DICE_Y)
    );
    const completed = await this.animatePlayerMove(
      start,
      end,
      this.actionTimings.hopMs,
      0.34,
      epoch
    );
    if (!completed || epoch !== this.epoch) return;

    const currentTarget = this.dice.get(nextKey);
    this.playerRow = targetDie.row;
    this.playerColumn = targetDie.column;
    this.activeKey = currentTarget === targetDie ? nextKey : null;
    if (!this.activeKey) this.player.position.y = GROUND_PLAYER_Y;
    this.faceDirection(directionName);
    this.session.setBusy(false);

    let preparedRun = null;
    if (wasBuried && this.activeKey) {
      try {
        preparedRun = this.prepareTargets();
      } catch (error) {
        console.error(error);
        this.reset();
        this.callbacks.onMessage?.('目標を準備できませんでした。もう一度試してください');
        return;
      }
      targetDie.state = 'rising';
      targetDie.riseStartedAt = this.getGameTime();
      targetDie.riseStartY = targetDie.mesh.position.y;
      this.session.setPhase(P1_PHASES.RISING);
      this.callbacks.onClimbComplete?.();
      this.callbacks.onMessage?.('サイコロに登りました。サイコロが上がります');
      this.callbacks.onTargetsReady?.({
        layoutVersion: preparedRun.layoutVersion,
        generationVersion: preparedRun.generationVersion,
        targets: preparedRun.targets,
        snapshot: this.getSnapshot()
      });
    } else if (this.activeKey) {
      this.session.setPhase(P1_PHASES.READY);
    } else {
      this.session.setPhase(P1_PHASES.WAITING_FOR_CLIMB);
    }

    this.callbacks.onMoveComplete?.(this.getSnapshot());
    this.consumeQueue();
  }

  async moveOnFloor(nextRow, nextColumn, directionName) {
    const epoch = this.epoch;
    this.session.setBusy(true);
    const start = this.player.position.clone();
    const end = gridToWorld(nextRow, nextColumn, GROUND_PLAYER_Y);
    const completed = await this.animatePlayerMove(
      start,
      end,
      this.actionTimings.walkMs,
      0.04,
      epoch
    );
    if (!completed || epoch !== this.epoch) return;

    this.playerRow = nextRow;
    this.playerColumn = nextColumn;
    this.activeKey = null;
    this.faceDirection(directionName);
    this.session.setBusy(false);
    this.session.setPhase(P1_PHASES.WAITING_FOR_CLIMB);
    this.callbacks.onMoveComplete?.(this.getSnapshot());
    this.callbacks.onMessage?.('床を移動中。近くのサイコロへ向かいます');
    this.consumeQueue();
  }

  handleTargetLanding(die, landedAt) {
    if (!this.targetRun || this.session.phase !== P1_PHASES.RUNNING) return null;
    const target = judgeTargetLanding({
      session: this.session,
      targets: this.targetRun.targets,
      row: die.row,
      column: die.column,
      upperFace: die.top,
      completedAt: landedAt
    });
    if (!target) return null;

    const marker = this.targetMarkers.get(target.id);
    if (marker) marker.visible = false;

    let finished = false;
    if (this.session.isRunComplete()) {
      const elapsed = this.clock.finish(landedAt);
      finished = elapsed !== null && this.session.finish(landedAt);
    }

    if (!finished) this.startLightPillar(target, landedAt);

    const snapshot = this.getSnapshot();
    this.callbacks.onTargetHit?.({ target, finished, snapshot });
    if (finished) this.callbacks.onFinished?.({ target, snapshot });
    return { target, finished, snapshot };
  }

  animatePlayerMove(start, end, duration, jumpHeight, epoch) {
    const startTime = this.getGameTime();
    return new Promise((resolve) => {
      let step = null;
      let cancel = null;
      let settled = false;
      const finish = (completed) => {
        if (settled) return;
        settled = true;
        if (cancel) this.animationCancellers.delete(cancel);
        resolve(completed);
      };
      cancel = () => {
        if (step) this.animationFrameTasks.delete(step);
        finish(false);
      };
      step = () => {
        if (epoch !== this.epoch || this.disposed) {
          finish(false);
          return;
        }

        const raw = Math.min(1, (this.getGameTime() - startTime) / duration);
        const t = easeInOutCubic(raw);
        this.player.position.lerpVectors(start, end, t);
        this.player.position.y += Math.sin(Math.PI * raw) * jumpHeight;

        if (raw < 1) this.enqueueAnimationFrame(step);
        else finish(true);
      };
      this.animationCancellers.add(cancel);
      this.enqueueAnimationFrame(step);
    });
  }

  async rollDie(die, nextRow, nextColumn, nextKey, directionName) {
    const epoch = this.epoch;
    this.session.setBusy(true);
    this.callbacks.onRollStart?.();

    const direction = DIRECTIONS[directionName];
    const oldKey = boardKey(die.row, die.column);
    const startPosition = die.mesh.position.clone();
    const endPosition = gridToWorld(nextRow, nextColumn);
    const startQuaternion = die.mesh.quaternion.clone();
    die.motionStartPosition = startPosition.clone();
    die.motionStartQuaternion = startQuaternion.clone();
    const turn = new THREE.Quaternion().setFromAxisAngle(direction.axis, direction.angle);
    const endQuaternion = turn.clone().multiply(startQuaternion);
    const startTime = this.getGameTime();
    const duration = this.actionTimings.rollMs;

    const completed = await new Promise((resolve) => {
      let step = null;
      let cancel = null;
      let settled = false;
      const finish = (didComplete) => {
        if (settled) return;
        settled = true;
        if (cancel) this.animationCancellers.delete(cancel);
        resolve(didComplete);
      };
      cancel = () => {
        if (step) this.animationFrameTasks.delete(step);
        finish(false);
      };
      step = () => {
        if (epoch !== this.epoch || this.disposed) {
          finish(false);
          return;
        }

        const raw = Math.min(1, (this.getGameTime() - startTime) / duration);
        const t = easeInOutCubic(raw);
        die.mesh.position.lerpVectors(startPosition, endPosition, t);
        die.mesh.position.y = DICE_Y + Math.sin(Math.PI * raw) * 0.26;
        die.mesh.quaternion.slerpQuaternions(startQuaternion, endQuaternion, t);
        this.player.position.set(
          die.mesh.position.x,
          PLAYER_Y + Math.sin(Math.PI * raw) * 0.18,
          die.mesh.position.z
        );
        this.player.rotation.z = Math.sin(Math.PI * raw)
          * (directionName === 'left' ? 0.12 : directionName === 'right' ? -0.12 : 0);

        if (raw < 1) this.enqueueAnimationFrame(step);
        else finish(true);
      };
      this.animationCancellers.add(cancel);
      this.enqueueAnimationFrame(step);
    });

    if (!completed || epoch !== this.epoch) return;

    die.mesh.position.copy(endPosition);
    die.mesh.quaternion.copy(endQuaternion).normalize();
    delete die.motionStartPosition;
    delete die.motionStartQuaternion;
    die.roll(directionName, nextRow, nextColumn);
    this.dice.delete(oldKey);
    this.dice.set(nextKey, die);
    this.activeKey = nextKey;
    this.playerRow = nextRow;
    this.playerColumn = nextColumn;
    this.player.position.set(endPosition.x, PLAYER_Y, endPosition.z);
    this.player.rotation.z = 0;
    this.faceDirection(directionName);
    this.session.setBusy(false);
    const wasRunning = this.session.phase === P1_PHASES.RUNNING;
    this.callbacks.onRoll?.({
      top: die.top,
      row: die.row,
      column: die.column
    });
    this.handleTargetLanding(die, this.getGameTime());
    if (this.session.phase !== P1_PHASES.FINISHED) {
      this.session.setPhase(wasRunning ? P1_PHASES.RUNNING : P1_PHASES.READY);
    }
    this.callbacks.onMoveComplete?.(this.getSnapshot());
    this.consumeQueue();
  }

  updateRising(now) {
    for (const [key, die] of this.dice) {
      if (die.state !== 'rising') continue;

      const raw = Math.min(
        1,
        Math.max(0, (now - die.riseStartedAt) / RISE_DURATION)
      );
      const progress = easeInOutCubic(raw);
      const startY = Number.isFinite(die.riseStartY)
        ? die.riseStartY
        : DICE_Y - RISE_DEPTH;
      die.mesh.position.y = startY + progress * (DICE_Y - startY);

      if (!this.session.busy && this.activeKey === key) {
        this.player.position.y = die.mesh.position.y + (PLAYER_Y - DICE_Y);
      }

      if (raw >= 1) {
        die.mesh.position.y = DICE_Y;
        die.state = 'normal';
        die.riseStartedAt = 0;
        die.riseStartY = DICE_Y - RISE_DEPTH;
        die.mesh.userData.bodyMaterial.emissive.setHex(0x000000);
        die.mesh.userData.bodyMaterial.emissiveIntensity = 0;
        if (this.activeKey === key) this.player.position.y = PLAYER_Y;
        const exposedAt = now;
        if (this.activeKey === key && this.session.startRunning(exposedAt)) {
          this.clock.start(exposedAt);
          this.startTimerFlash(die, exposedAt);
        } else {
          this.session.setPhase(P1_PHASES.READY);
        }
        this.callbacks.onExposed?.({
          row: die.row,
          column: die.column,
          upperFace: die.top,
          startedAt: this.clock.startedAt,
          snapshot: this.getSnapshot()
        });
        this.callbacks.onMessage?.('サイコロが完全に露出しました。計測を開始します');
      }
    }
  }

  startTimerFlash(die, startedAt) {
    if (die.timerFlash || die.timerFlashCompleted || !Number.isFinite(startedAt)) return false;
    die.timerFlash = Object.freeze({
      startedAt,
      duration: TIMER_FLASH_DURATION
    });
    setDieFlashIntensity(die, getOneShotFlashIntensity(0, TIMER_FLASH_DURATION));
    return true;
  }

  updateTimerFlash(now) {
    for (const die of this.dice.values()) {
      if (!die.timerFlash) continue;
      const elapsed = now - die.timerFlash.startedAt;
      const intensity = getOneShotFlashIntensity(elapsed, die.timerFlash.duration);
      setDieFlashIntensity(die, intensity);
      if (elapsed >= die.timerFlash.duration) {
        die.timerFlashCompleted = true;
        delete die.timerFlash;
      }
    }
  }

  faceDirection(directionName) {
    const rotations = {
      up: Math.PI,
      down: 0,
      left: -Math.PI / 2,
      right: Math.PI / 2
    };
    this.player.rotation.y = rotations[directionName] ?? 0;
  }

  consumeQueue() {
    const queued = this.session.takeQueuedDirection();
    if (!queued) return;
    this.move(queued);
  }

  getGameTime() {
    const now = Number(this.getNow());
    return Number.isFinite(now) ? now : performance.now();
  }

  enqueueAnimationFrame(task) {
    this.animationFrameTasks.add(task);
    this.requestFrame();
  }

  runAnimationFrameTasks() {
    const tasks = [...this.animationFrameTasks];
    this.animationFrameTasks.clear();
    for (const task of tasks) task();
  }

  cancelAnimationWaiters() {
    for (const cancel of [...this.animationCancellers]) cancel();
    this.animationCancellers.clear();
    this.animationFrameTasks.clear();
  }

  requestFrame() {
    if (
      this.frameId !== null
      || !this.renderActive
      || !this.isVisible
      || this.contextLost
      || this.disposed
    ) return;

    this.frameId = window.requestAnimationFrame(() => {
      this.frameId = null;
      this.animate();
    });
  }

  cancelFrame() {
    if (this.frameId === null) return;
    window.cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  animate() {
    if (
      !this.renderActive
      || !this.isVisible
      || this.contextLost
      || this.disposed
    ) return;

    const now = this.getGameTime();
    this.updateRising(now);
    this.updateTimerFlash(now);
    this.updateLightPillars(now);
    this.runAnimationFrameTasks();
    if (this.session.phase === P1_PHASES.RUNNING) {
      this.callbacks.onTick?.(this.getSnapshot());
    }

    const elapsed = this.renderClock.getElapsedTime();
    const reducedMotion = this.shouldReduceMotion();
    this.updateTargetMarkers(elapsed);
    if (reducedMotion) this.player.rotation.x = 0;
    if (!this.session.busy) {
      const activeDie = this.activeKey ? this.dice.get(this.activeKey) : null;
      const baseY = activeDie
        ? activeDie.mesh.position.y + (PLAYER_Y - DICE_Y)
        : GROUND_PLAYER_Y;
      this.player.position.y = reducedMotion
        ? baseY
        : baseY + Math.sin(elapsed * 4.2) * 0.025;
      if (!reducedMotion) {
        this.player.rotation.x = Math.sin(elapsed * 3.2) * 0.018;
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.requestFrame();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth ?? 1);
    const height = Math.max(1, parent?.clientHeight ?? 1);
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      this.performanceProfile.pixelRatioCap
    );
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    const frustum = calculateCameraFrustum(width, height);
    this.camera.left = frustum.left;
    this.camera.right = frustum.right;
    this.camera.top = frustum.top;
    this.camera.bottom = frustum.bottom;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderActive = false;
    this.cancelFrame();
    this.epoch = this.session.invalidate();
    this.cancelAnimationWaiters();
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.removeTargetMarkers();
    this.removeLightPillars();
    for (const die of this.dice.values()) this.removeDie(die);
    this.dice.clear();
    disposeResources(this.resources);
    this.renderer.dispose();
  }
}
