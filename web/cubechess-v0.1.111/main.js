import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/FBXLoader.js";

import { initializeMatchState } from "./runtime/Core/GameState/initializeMatchState.js";
import { TURN_ORDER, PIECE_TYPES } from "./runtime/Core/GameState/constants.js";
import { TurnPhase, TurnStateMachine } from "./runtime/Core/Turn/index.js";
import { presetAllAI } from "./runtime/Core/Seats/index.js";
import { applyDangerAwareIterativeRescoring, classifyBoardPhase, createTurnThreatContext, evaluateHeuristicMove } from "./runtime/Core/AI/index.js";

const VERSION = "0.1.111";
const BOARD_SIZE = 8;
const AI_BUDGET_MS = 400;
const AI_BUDGET_MAX_MS = 10000;

const statusEl = document.getElementById("status");
const turnEl = document.getElementById("turn");
const currentTurnEl = document.getElementById("currentTurn");
const pausedEl = document.getElementById("paused");
const pauseBtn = document.getElementById("pauseBtn");
const stepBtn = document.getElementById("stepBtn");
const speedSelect = document.getElementById("speedSelect");
const followToggle = document.getElementById("followToggle");
const resetBtn = document.getElementById("resetBtn");
const exportTraceBtn = document.getElementById("exportTraceBtn");
const metricsEl = document.getElementById("metrics");
const varietySelect = document.getElementById("varietySelect");
const hudEl = document.getElementById("hud");
const hudToggleBtn = document.getElementById("hudToggleBtn");
const autoReplayToggle = document.getElementById("autoReplayToggle");
const experimentalLightToggle = document.getElementById("experimentalLightToggle");
const experimentalBranchDepthToggle = document.getElementById("experimentalBranchDepthToggle");
const winnerOverlayEl = document.getElementById("winnerOverlay");
const winnerTextEl = document.getElementById("winnerText");
const winnerTimerFillEl = document.getElementById("winnerTimerFill");
const winnerTimerLabelEl = document.getElementById("winnerTimerLabel");
const eventFlashEl = document.getElementById("eventFlash");
const eventFlashTextEl = document.getElementById("eventFlashText");

let experimentalPieceLightEnabled = experimentalLightToggle?.checked === true;
let experimentalBranchDepthEnabled = experimentalBranchDepthToggle?.checked === true;

function setStatus(message) {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function setTurnLabel(message) {
  if (turnEl) {
    turnEl.textContent = message;
  }
}

function setCurrentTurnLabel(message) {
  if (currentTurnEl) {
    currentTurnEl.textContent = message;
  }
}

function getPlayerDisplayName(player) {
  return player ?? "Unknown";
}

function setPausedLabel(paused) {
  if (pausedEl) {
    pausedEl.textContent = paused ? "Paused" : "Running";
  }
  if (pauseBtn) {
    pauseBtn.textContent = paused ? "Resume" : "Pause";
  }
}

const canvas = document.getElementById("app");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (error) {
  setStatus("WebGL init failed. Check browser WebGL support.");
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0d0d0d, 18, 42);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(11, 12, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 9;
controls.maxDistance = 28;
controls.maxPolarAngle = Math.PI * 0.9;
controls.minPolarAngle = Math.PI * 0.1;
controls.enablePan = false;
const CAMERA_IDLE_ROTATE_DELAY_MS = 10000;
const CAMERA_IDLE_ROTATE_RAD_PER_SEC = 0.22;
const CAMERA_IDLE_ISO_LERP = 0.06;
let lastCameraInteractionMs = performance.now();
let lastIdleRotateTickMs = performance.now();
let autoCameraSpinActive = false;
const initialCameraOffset = camera.position.clone().sub(controls.target);
const initialCameraSpherical = new THREE.Spherical().setFromVector3(initialCameraOffset);
const preferredIdlePolar = THREE.MathUtils.clamp(
  initialCameraSpherical.phi,
  controls.minPolarAngle + 0.05,
  controls.maxPolarAngle - 0.05
);
const idleRotateOffset = new THREE.Vector3();
const idleRotateSpherical = new THREE.Spherical();

function markCameraInteraction(nowMs = performance.now()) {
  lastCameraInteractionMs = nowMs;
  lastIdleRotateTickMs = nowMs;
  autoCameraSpinActive = false;
}

function canAutoRotateCamera() {
  return !(followToggle?.checked);
}

function updateIdleAutoRotate(nowMs = performance.now()) {
  if (!canAutoRotateCamera()) {
    autoCameraSpinActive = false;
    lastIdleRotateTickMs = nowMs;
    return;
  }

  if (nowMs - lastCameraInteractionMs < CAMERA_IDLE_ROTATE_DELAY_MS) {
    autoCameraSpinActive = false;
    lastIdleRotateTickMs = nowMs;
    return;
  }

  const dtSec = Math.max(0.001, Math.min(0.05, (nowMs - lastIdleRotateTickMs) / 1000));
  lastIdleRotateTickMs = nowMs;
  autoCameraSpinActive = true;

  idleRotateOffset.copy(camera.position).sub(controls.target);
  idleRotateOffset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, CAMERA_IDLE_ROTATE_RAD_PER_SEC * dtSec);

  idleRotateSpherical.setFromVector3(idleRotateOffset);
  const clampedPreferred = THREE.MathUtils.clamp(
    preferredIdlePolar,
    controls.minPolarAngle + 0.01,
    controls.maxPolarAngle - 0.01
  );
  idleRotateSpherical.phi += (clampedPreferred - idleRotateSpherical.phi) * CAMERA_IDLE_ISO_LERP;
  idleRotateSpherical.makeSafe();

  idleRotateOffset.setFromSpherical(idleRotateSpherical);
  camera.position.copy(controls.target).add(idleRotateOffset);
  camera.lookAt(controls.target);
}

controls.addEventListener("start", () => {
  markCameraInteraction();
});

renderer.domElement.addEventListener("pointerdown", () => {
  markCameraInteraction();
}, { passive: true });

renderer.domElement.addEventListener("wheel", () => {
  markCameraInteraction();
}, { passive: true });

renderer.domElement.addEventListener("touchstart", () => {
  markCameraInteraction();
}, { passive: true });

const ambient = new THREE.AmbientLight(0xc8c8c8, 0.55);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xf4f4f4, 0.8);
keyLight.position.set(14, 18, 10);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x8a8a8a, 0.7, 80);
fillLight.position.set(-10, 6, -8);
scene.add(fillLight);

const experimentalPieceLight = new THREE.PointLight(0xffffff, 0, 3.0, 2.0);
experimentalPieceLight.position.set(0, 0, 0);
scene.add(experimentalPieceLight);

const boardGroup = new THREE.Group();
scene.add(boardGroup);

const boardExtent = BOARD_SIZE;
const boardMin = -boardExtent / 2;

function boardToWorld(x, y, z) {
  return new THREE.Vector3(
    boardMin + 0.5 + x,
    boardMin + 0.5 + y,
    boardMin + 0.5 + z
  );
}

function createCubeShell() {
  const shellGeo = new THREE.BoxGeometry(boardExtent, boardExtent, boardExtent);
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0x8d8d8d,
    transparent: true,
    opacity: 0.04,
    transmission: 0.46,
    roughness: 0.2,
    metalness: 0.05,
  });
  const shell = new THREE.Mesh(shellGeo, shellMat);

  const edges = new THREE.EdgesGeometry(shellGeo);
  const edgePrimary = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0xc8c8c8, transparent: true, opacity: 0.64 })
  );
  const edgeSecondary = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })
  );
  edgeSecondary.scale.setScalar(1.002);
  shell.add(edgePrimary);
  shell.add(edgeSecondary);

  return shell;
}

function createGridLines() {
  const points = [];
  const min = -boardExtent / 2;
  const max = boardExtent / 2;

  for (let i = 1; i < BOARD_SIZE; i += 1) {
    const v = min + i;

    points.push(new THREE.Vector3(min, v, min), new THREE.Vector3(max, v, min));
    points.push(new THREE.Vector3(min, v, max), new THREE.Vector3(max, v, max));
    points.push(new THREE.Vector3(min, min, v), new THREE.Vector3(max, min, v));
    points.push(new THREE.Vector3(min, max, v), new THREE.Vector3(max, max, v));

    points.push(new THREE.Vector3(v, min, min), new THREE.Vector3(v, max, min));
    points.push(new THREE.Vector3(v, min, max), new THREE.Vector3(v, max, max));
    points.push(new THREE.Vector3(min, min, v), new THREE.Vector3(min, max, v));
    points.push(new THREE.Vector3(max, min, v), new THREE.Vector3(max, max, v));

    points.push(new THREE.Vector3(v, min, min), new THREE.Vector3(v, min, max));
    points.push(new THREE.Vector3(v, max, min), new THREE.Vector3(v, max, max));
    points.push(new THREE.Vector3(min, v, min), new THREE.Vector3(min, v, max));
    points.push(new THREE.Vector3(max, v, min), new THREE.Vector3(max, v, max));
  }

  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const group = new THREE.Group();

  const primary = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: 0xa5a5a5, transparent: true, opacity: 0.2 })
  );
  const secondary = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: 0xe0e0e0, transparent: true, opacity: 0.08 })
  );
  secondary.scale.setScalar(1.0012);

  group.add(primary);
  group.add(secondary);
  return group;
}
function createCellCenters() {
  const plusMaterial = new THREE.LineBasicMaterial({
    color: 0x909090,
    transparent: true,
    opacity: 0.06,
    depthTest: false,
    depthWrite: false,
  });

  const halfSize = 0.09;
  const points = [];

  for (let x = 0; x < BOARD_SIZE; x += 1) {
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let z = 0; z < BOARD_SIZE; z += 1) {
        const center = boardToWorld(x, y, z);
        points.push(
          new THREE.Vector3(center.x - halfSize, center.y, center.z),
          new THREE.Vector3(center.x + halfSize, center.y, center.z)
        );
        points.push(
          new THREE.Vector3(center.x, center.y - halfSize, center.z),
          new THREE.Vector3(center.x, center.y + halfSize, center.z)
        );
        points.push(
          new THREE.Vector3(center.x, center.y, center.z - halfSize),
          new THREE.Vector3(center.x, center.y, center.z + halfSize)
        );
      }
    }
  }

  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const crosses = new THREE.LineSegments(geo, plusMaterial);
  crosses.renderOrder = 30;
  return crosses;
}


function createOuterCheckerPattern() {
  const group = new THREE.Group();
  const tileGeo = new THREE.PlaneGeometry(1, 1);
  const shadedMat = new THREE.MeshBasicMaterial({
    color: 0xc4c4c4,
    transparent: true,
    opacity: 0.05,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const half = boardExtent / 2;
  const faceOffset = 0.012;

  const coord = (i) => boardMin + 0.5 + i;

  for (let u = 0; u < BOARD_SIZE; u += 1) {
    for (let v = 0; v < BOARD_SIZE; v += 1) {
      if ((u + v) % 2 !== 0) {
        continue;
      }

      const front = new THREE.Mesh(tileGeo, shadedMat);
      front.position.set(coord(u), coord(v), half + faceOffset);
      group.add(front);

      const back = new THREE.Mesh(tileGeo, shadedMat);
      back.position.set(coord(u), coord(v), -half - faceOffset);
      back.rotation.y = Math.PI;
      group.add(back);

      const right = new THREE.Mesh(tileGeo, shadedMat);
      right.position.set(half + faceOffset, coord(v), coord(u));
      right.rotation.y = -Math.PI / 2;
      group.add(right);

      const left = new THREE.Mesh(tileGeo, shadedMat);
      left.position.set(-half - faceOffset, coord(v), coord(u));
      left.rotation.y = Math.PI / 2;
      group.add(left);

      const top = new THREE.Mesh(tileGeo, shadedMat);
      top.position.set(coord(u), half + faceOffset, coord(v));
      top.rotation.x = -Math.PI / 2;
      group.add(top);

      const bottom = new THREE.Mesh(tileGeo, shadedMat);
      bottom.position.set(coord(u), -half - faceOffset, coord(v));
      bottom.rotation.x = Math.PI / 2;
      group.add(bottom);
    }
  }

  return group;
}
boardGroup.add(createCubeShell());
boardGroup.add(createOuterCheckerPattern());
boardGroup.add(createGridLines());
boardGroup.add(createCellCenters());
const PLAYER_COLOR = Object.freeze({
  Red: 0xe9162d,
  Orange: 0xf28200,
  Yellow: 0xffdb28,
  Green: 0x1fb819,
  Cyan: 0x00e1da,
  Blue: 0x007bd8,
  Purple: 0xa600ff,
  Pink: 0xfb4fd9,
});

function createPositionOneMarker(colorHex = PLAYER_COLOR.Yellow) {
  const half = boardExtent / 2;
  const corner = new THREE.Vector3(boardMin, half, boardMin);
  const markerLength = 0.9;
  const points = [
    corner, new THREE.Vector3(corner.x + markerLength, corner.y, corner.z),
    corner, new THREE.Vector3(corner.x, corner.y - markerLength, corner.z),
    corner, new THREE.Vector3(corner.x, corner.y, corner.z + markerLength),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const marker = new THREE.LineSegments(geometry, material);
  marker.renderOrder = 18;
  return marker;
}

boardGroup.add(createPositionOneMarker());

const AI_PERSONA_REGISTRY = Object.freeze({
  Red: Object.freeze({ id: "red_aggressor" }),
  Orange: Object.freeze({ id: "orange_raider" }),
  Yellow: Object.freeze({ id: "yellow_opportunist" }),
  Green: Object.freeze({ id: "green_swarm" }),
  Cyan: Object.freeze({ id: "cyan_tempo" }),
  Blue: Object.freeze({ id: "blue_fortress" }),
  Purple: Object.freeze({ id: "purple_controller" }),
  Pink: Object.freeze({ id: "pink_trickster" }),
});

const DEFAULT_AI_PERSONA = Object.freeze({ id: "default" });

function getPersonaProfileForPlayer(player) {
  const profile = AI_PERSONA_REGISTRY[player] ?? DEFAULT_AI_PERSONA;
  return {
    id: typeof profile.id === "string" && profile.id.trim().length > 0 ? profile.id.trim() : "default",
  };
}

const AI_PERSONA_TUNING = Object.freeze({
  default: Object.freeze({
    dangerConfig: Object.freeze({}),
    candidateConfig: Object.freeze({}),
    searchConfig: Object.freeze({
      budgetFraction: 0.38,
      rootCandidateLimit: 14,
      depth3CandidateLimit: 6,
      opponentMoveLimit: 12,
      selfMoveLimit: 12,
    }),
    riskGate: Object.freeze({ maxCombinedRisk: Number.POSITIVE_INFINITY, maxCounterRisk: Number.POSITIVE_INFINITY }),
  }),
  red_aggressor: Object.freeze({
    dangerConfig: Object.freeze({
      dangerWeight: 0.7,
      stageCandidateLimits: Object.freeze([10, 20, 30]),
      stageOpponentMoveLimits: Object.freeze([14, 24, 34]),
    }),
    candidateConfig: Object.freeze({ poolLimit: 110, minPerPiece: 2 }),
    searchConfig: Object.freeze({
      budgetFraction: 0.38,
      rootCandidateLimit: 18,
      depth3CandidateLimit: 8,
      opponentMoveLimit: 12,
      selfMoveLimit: 14,
      replyWeight: 0.8,
      recoveryWeight: 0.74,
      blendFactor: 0.8,
    }),
    riskGate: Object.freeze({ maxCombinedRisk: 9.5, maxCounterRisk: 5.5 }),
  }),
  orange_raider: Object.freeze({
    dangerConfig: Object.freeze({
      dangerWeight: 0.78,
      stageCandidateLimits: Object.freeze([9, 18, 28]),
      stageOpponentMoveLimits: Object.freeze([15, 26, 36]),
    }),
    candidateConfig: Object.freeze({ poolLimit: 102, minPerPiece: 2 }),
    searchConfig: Object.freeze({
      budgetFraction: 0.37,
      rootCandidateLimit: 16,
      depth3CandidateLimit: 8,
      opponentMoveLimit: 12,
      selfMoveLimit: 13,
      replyWeight: 0.86,
      recoveryWeight: 0.7,
      blendFactor: 0.79,
    }),
    riskGate: Object.freeze({ maxCombinedRisk: 7.8, maxCounterRisk: 4.6 }),
  }),
  yellow_opportunist: Object.freeze({
    dangerConfig: Object.freeze({
      dangerWeight: 0.9,
      stageCandidateLimits: Object.freeze([8, 16, 24]),
      stageOpponentMoveLimits: Object.freeze([18, 30, 42]),
    }),
    candidateConfig: Object.freeze({ poolLimit: 96, minPerPiece: 2 }),
    searchConfig: Object.freeze({
      budgetFraction: 0.36,
      rootCandidateLimit: 15,
      depth3CandidateLimit: 7,
      opponentMoveLimit: 14,
      selfMoveLimit: 12,
      replyWeight: 0.94,
      recoveryWeight: 0.66,
      blendFactor: 0.78,
    }),
    riskGate: Object.freeze({ maxCombinedRisk: 6.4, maxCounterRisk: 3.8 }),
  }),
  green_swarm: Object.freeze({
    dangerConfig: Object.freeze({
      dangerWeight: 0.88,
      stageCandidateLimits: Object.freeze([9, 18, 27]),
      stageOpponentMoveLimits: Object.freeze([17, 28, 38]),
    }),
    candidateConfig: Object.freeze({ poolLimit: 108, minPerPiece: 3 }),
    searchConfig: Object.freeze({
      budgetFraction: 0.36,
      rootCandidateLimit: 15,
      depth3CandidateLimit: 7,
      opponentMoveLimit: 13,
      selfMoveLimit: 13,
      replyWeight: 0.9,
      recoveryWeight: 0.68,
      blendFactor: 0.78,
    }),
    riskGate: Object.freeze({ maxCombinedRisk: 7.1, maxCounterRisk: 4.2 }),
  }),
  cyan_tempo: Object.freeze({
    dangerConfig: Object.freeze({
      dangerWeight: 0.82,
      stageCandidateLimits: Object.freeze([8, 16, 26]),
      stageOpponentMoveLimits: Object.freeze([16, 28, 40]),
    }),
    candidateConfig: Object.freeze({ poolLimit: 100, minPerPiece: 2 }),
    searchConfig: Object.freeze({
      budgetFraction: 0.37,
      rootCandidateLimit: 16,
      depth3CandidateLimit: 8,
      opponentMoveLimit: 13,
      selfMoveLimit: 13,
      replyWeight: 0.88,
      recoveryWeight: 0.7,
      blendFactor: 0.79,
    }),
    riskGate: Object.freeze({ maxCombinedRisk: 7.1, maxCounterRisk: 4.2 }),
  }),
  blue_fortress: Object.freeze({
    dangerConfig: Object.freeze({
      dangerWeight: 1.08,
      stageCandidateLimits: Object.freeze([8, 14, 20]),
      stageOpponentMoveLimits: Object.freeze([20, 32, 44]),
    }),
    candidateConfig: Object.freeze({ poolLimit: 96, minPerPiece: 2 }),
    searchConfig: Object.freeze({
      budgetFraction: 0.36,
      rootCandidateLimit: 12,
      depth3CandidateLimit: 6,
      opponentMoveLimit: 14,
      selfMoveLimit: 12,
      replyWeight: 1.05,
      recoveryWeight: 0.62,
      blendFactor: 0.78,
    }),
    riskGate: Object.freeze({ maxCombinedRisk: 4.8, maxCounterRisk: 2.6 }),
  }),
  purple_controller: Object.freeze({
    dangerConfig: Object.freeze({
      dangerWeight: 0.95,
      stageCandidateLimits: Object.freeze([8, 15, 24]),
      stageOpponentMoveLimits: Object.freeze([18, 30, 42]),
    }),
    candidateConfig: Object.freeze({ poolLimit: 96, minPerPiece: 2 }),
    searchConfig: Object.freeze({
      budgetFraction: 0.35,
      rootCandidateLimit: 14,
      depth3CandidateLimit: 6,
      opponentMoveLimit: 14,
      selfMoveLimit: 12,
      replyWeight: 0.96,
      recoveryWeight: 0.66,
      blendFactor: 0.77,
    }),
    riskGate: Object.freeze({ maxCombinedRisk: 6.2, maxCounterRisk: 3.8 }),
  }),
  pink_trickster: Object.freeze({
    dangerConfig: Object.freeze({
      dangerWeight: 0.84,
      stageCandidateLimits: Object.freeze([9, 18, 28]),
      stageOpponentMoveLimits: Object.freeze([16, 28, 40]),
    }),
    candidateConfig: Object.freeze({ poolLimit: 104, minPerPiece: 2 }),
    searchConfig: Object.freeze({
      budgetFraction: 0.37,
      rootCandidateLimit: 16,
      depth3CandidateLimit: 8,
      opponentMoveLimit: 13,
      selfMoveLimit: 13,
      replyWeight: 0.9,
      recoveryWeight: 0.7,
      blendFactor: 0.79,
    }),
    riskGate: Object.freeze({ maxCombinedRisk: 7.6, maxCounterRisk: 4.6 }),
  }),
});

function getPersonaTuning(personaId) {
  return AI_PERSONA_TUNING[personaId] ?? AI_PERSONA_TUNING.default;
}

function mergeConfig(baseConfig, overrideConfig) {
  return {
    ...(baseConfig ?? {}),
    ...(overrideConfig ?? {}),
  };
}
const VarietyMode = Object.freeze({
  Deterministic: "deterministic",
  Chaotic: "chaotic",
});

let varietyMode = varietySelect?.value ?? VarietyMode.Chaotic;
let followPieceId = null;
let varietySeed = 1;
let aiWorker = null;
let aiWorkerRequestId = 0;
const aiWorkerPending = new Map();

function ensureAIWorker() {
  if (aiWorker) {
    return aiWorker;
  }

  aiWorker = new Worker(new URL("./aiWorker.js", import.meta.url), { type: "module" });

  aiWorker.addEventListener("message", (event) => {
    const data = event.data ?? {};
    const pending = aiWorkerPending.get(data.id);
    if (!pending) {
      return;
    }
    aiWorkerPending.delete(data.id);
    if (pending.onAbort && pending.signal) {
      pending.signal.removeEventListener("abort", pending.onAbort);
    }

    if (data.error) {
      pending.reject(new Error(data.error));
      return;
    }
    pending.resolve(data.result ?? null);
  });

  aiWorker.addEventListener("error", (error) => {
    for (const pending of aiWorkerPending.values()) {
      if (pending.onAbort && pending.signal) {
        pending.signal.removeEventListener("abort", pending.onAbort);
      }
      pending.reject(error instanceof Error ? error : new Error("AI worker error"));
    }
    aiWorkerPending.clear();
    aiWorker = null;
  });

  return aiWorker;
}

function restartAIWorker() {
  if (aiWorker) {
    aiWorker.terminate();
    aiWorker = null;
  }
}

function requestAIDecisionFromWorker(payload, options = {}) {
  const worker = ensureAIWorker();
  const id = ++aiWorkerRequestId;
  const signal = options.signal ?? null;

  return new Promise((resolve, reject) => {
    const pending = {
      resolve,
      reject,
      signal,
      onAbort: null,
    };

    if (signal) {
      if (signal.aborted) {
        reject(new Error("AI worker request aborted"));
        return;
      }

      pending.onAbort = () => {
        aiWorkerPending.delete(id);
        reject(new Error("AI worker request aborted"));
        restartAIWorker();
      };
      signal.addEventListener("abort", pending.onAbort, { once: true });
    }

    aiWorkerPending.set(id, pending);
    worker.postMessage({ id, payload });
  });
}

function buildMatchSnapshotForAIWorker(state) {
  return {
    activePlayer: state.activePlayer,
    turnCount: state.turnCount,
    lastMove: state.lastMove,
    eliminatedPlayers: [...state.eliminatedPlayers],
    pieces: state.pieces.map((piece) => ({
      id: piece.id,
      owner: piece.owner,
      type: piece.type,
      alive: piece.alive,
      coord: {
        x: piece.coord.x,
        y: piece.coord.y,
        z: piece.coord.z,
      },
    })),
  };
}

function reseedVariety() {
  // New seed each reset in chaotic mode so full matches diverge.
  varietySeed = (Math.floor(Math.random() * 0x7fffffff) ^ Date.now()) >>> 0;
  if (varietySeed === 0) {
    varietySeed = 1;
  }
}

function nextVarietyRandom() {
  varietySeed = (1664525 * varietySeed + 1013904223) >>> 0;
  return varietySeed / 4294967296;
}
const CELL_HIGHLIGHT_OPACITY = 0.14;
const PIECE_FADE_NEAR_DISTANCE = 6;
const PIECE_FADE_FAR_DISTANCE = 28;
const PIECE_FADE_NEAR_FACTOR = 0.88;
const PIECE_FADE_FAR_FACTOR = 0.32;
const MODEL_CORE_BASE_OPACITY = 0.92;
const MODEL_CORE_KING_BASE_OPACITY = 0.96;
const MODEL_GLOW_BASE_OPACITY = 0.24;
const MODEL_GLOW_KING_BASE_OPACITY = 0.3;
const MODEL_GLOW_SCALE = 1.1;
const MODEL_GLOW_Y_BIAS = -0.005;

const PIECE_MODEL_PATHS = Object.freeze({
  [PIECE_TYPES.Pawn]: "../../Assets/Pieces/Pawn.fbx",
  [PIECE_TYPES.Rook]: "../../Assets/Pieces/Rook.fbx",
  [PIECE_TYPES.Knight]: "../../Assets/Pieces/Knight.fbx",
  [PIECE_TYPES.Bishop]: "../../Assets/Pieces/Bishop.fbx",
  [PIECE_TYPES.Queen]: "../../Assets/Pieces/Queen.fbx",
  [PIECE_TYPES.King]: "../../Assets/Pieces/King.fbx",
});

const PIECE_MODEL_TARGET_SIZE = Object.freeze({
  [PIECE_TYPES.Pawn]: 0.62,
  [PIECE_TYPES.Rook]: 0.64,
  [PIECE_TYPES.Knight]: 0.68,
  [PIECE_TYPES.Bishop]: 0.68,
  [PIECE_TYPES.Queen]: 0.74,
  [PIECE_TYPES.King]: 0.78,
});

const MODEL_ALIGN_BOX_A = new THREE.Box3();
const MODEL_ALIGN_BOX_B = new THREE.Box3();
const MODEL_ALIGN_CENTER_A = new THREE.Vector3();
const MODEL_ALIGN_CENTER_B = new THREE.Vector3();

function alignModelCenterToReference(targetModel, referenceModel) {
  targetModel.updateMatrixWorld(true);
  referenceModel.updateMatrixWorld(true);
  MODEL_ALIGN_BOX_A.setFromObject(targetModel);
  MODEL_ALIGN_BOX_B.setFromObject(referenceModel);
  MODEL_ALIGN_BOX_A.getCenter(MODEL_ALIGN_CENTER_A);
  MODEL_ALIGN_BOX_B.getCenter(MODEL_ALIGN_CENTER_B);
  targetModel.position.add(MODEL_ALIGN_CENTER_B.sub(MODEL_ALIGN_CENTER_A));
}
const fbxLoader = new FBXLoader();
const pieceModelTemplates = new Map();
const pieceModelPromises = new Map();

function normalizePieceModelTemplate(root, pieceType) {
  const template = root.clone(true);
  const box = new THREE.Box3().setFromObject(template);
  const size = box.getSize(new THREE.Vector3());

  // Some FBX exports come in Z-up; rotate to keep pieces upright in Y-up scene coordinates.
  if (size.z > size.y * 1.2 && size.z >= size.x) {
    template.rotation.x = -Math.PI / 2;
  } else if (size.x > size.y * 1.2 && size.x > size.z) {
    template.rotation.z = Math.PI / 2;
  }

  const normalizedBox = new THREE.Box3().setFromObject(template);
  const normalizedSize = normalizedBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(normalizedSize.x, normalizedSize.y, normalizedSize.z);
  const targetSize = PIECE_MODEL_TARGET_SIZE[pieceType] ?? 0.6;
  const safeScale = maxDim > 0 ? targetSize / maxDim : 1;
  template.scale.setScalar(safeScale);

  const centeredBox = new THREE.Box3().setFromObject(template);
  const center = centeredBox.getCenter(new THREE.Vector3());
  template.position.sub(center);
  template.updateMatrixWorld(true);
  return template;
}

function tintModelInstance(modelRoot, color, baseOpacity, options = {}) {
  const modelMaterials = [];
  const tintColor = new THREE.Color(color);
  const blending = options.blending ?? THREE.NormalBlending;
  const emissiveScale = options.emissiveScale ?? 0.26;
  const emissiveIntensity = options.emissiveIntensity ?? 0.7;
  const renderOrder = options.renderOrder ?? 12;
  const depthTest = options.depthTest ?? false;
  const depthWrite = options.depthWrite ?? false;
  const side = options.side;

  modelRoot.traverse((node) => {
    if (!node.isMesh) {
      return;
    }
    node.castShadow = false;
    node.receiveShadow = false;
    node.renderOrder = renderOrder;

    const source = Array.isArray(node.material) ? node.material : [node.material];
    const tinted = source.map((material) => {
      const next = material.clone();
      next.transparent = true;
      next.opacity = baseOpacity;
      next.depthTest = depthTest;
      next.depthWrite = depthWrite;
      next.blending = blending;
      if (side !== undefined) {
        next.side = side;
      }
      if (next.color) {
        next.color.copy(tintColor);
      }
      if ("emissive" in next && next.emissive) {
        next.emissive.copy(tintColor).multiplyScalar(emissiveScale);
        next.emissiveIntensity = emissiveIntensity;
      }
      modelMaterials.push(next);
      return next;
    });

    node.material = Array.isArray(node.material) ? tinted : tinted[0];
  });

  return modelMaterials;
}

function ensurePieceModelTemplate(pieceType) {
  const modelPath = PIECE_MODEL_PATHS[pieceType];
  if (!modelPath || pieceModelPromises.has(pieceType)) {
    return;
  }

  const promise = fbxLoader
    .loadAsync(modelPath)
    .then((loaded) => {
      const template = normalizePieceModelTemplate(loaded, pieceType);
      pieceModelTemplates.set(pieceType, template);
      return template;
    })
    .catch((error) => {
      console.warn("CubeChess: model load failed for " + pieceType + " (" + modelPath + ")", error);
      pieceModelTemplates.set(pieceType, null);
      return null;
    })
    .finally(() => {
      if (matchState) {
        rebuildPieceVisuals();
      }
    });

  pieceModelPromises.set(pieceType, promise);
}

function primePieceModels() {
  Object.values(PIECE_TYPES).forEach((pieceType) => {
    ensurePieceModelTemplate(pieceType);
  });
}
function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

const telemetry = {
  turnDurationsMs: [],
  roundDurationsMs: [],
  timeoutCount: 0,
  roundTurnCount: 0,
  roundStartMs: performance.now(),
};

const AI_TRACE_LIMIT = 320;
const AI_TRACE_TOP_CANDIDATES = 8;
let aiDecisionTraceSequence = 0;
let aiDecisionTraces = [];
let sessionTraceArchive = [];
const SESSION_TRACE_ARCHIVE_LIMIT = 500;
const archivedGameNumbers = new Set();

function cloneTraceRows(rows) {
  return JSON.parse(JSON.stringify(Array.isArray(rows) ? rows : []));
}


function cloneCoord(coord) {
  if (!coord) {
    return null;
  }
  return {
    x: coord.x,
    y: coord.y,
    z: coord.z,
  };
}

function buildPvRootStep(move, player) {
  if (!move) {
    return null;
  }
  return {
    player: player ?? null,
    pieceId: move.pieceId,
    from: cloneCoord(move.from),
    to: cloneCoord(move.to),
    capturedPieceId: move.capturedPieceId ?? null,
  };
}

function compactBreakdown(breakdown) {
  if (!breakdown || typeof breakdown !== "object") {
    return {};
  }

  const compact = {};
  for (const [key, value] of Object.entries(breakdown)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      compact[key] = Number(value.toFixed(3));
    }
  }
  return compact;
}

function compactScoredEntry(entry) {
  if (!entry?.move) {
    return null;
  }

  return {
    pieceId: entry.move.pieceId,
    from: cloneCoord(entry.move.from),
    to: cloneCoord(entry.move.to),
    score: Number((entry.score ?? 0).toFixed(3)),
    dangerPenalty: Number((entry.dangerPenalty ?? 0).toFixed(3)),
    breakdown: compactBreakdown(entry.breakdown),
  };
}

function getDangerStageCandidateBudget(completedStages) {
  if (completedStages <= 0) {
    return Math.max(1, AI_DANGER_STAGE_CANDIDATE_LIMITS[0] ?? 1);
  }
  const stageIndex = Math.min(AI_DANGER_STAGE_CANDIDATE_LIMITS.length - 1, completedStages - 1);
  return Math.max(1, AI_DANGER_STAGE_CANDIDATE_LIMITS[stageIndex] ?? AI_DANGER_STAGE_CANDIDATE_LIMITS[0] ?? 1);
}

function recordAIDecisionTrace(entry) {
  aiDecisionTraceSequence += 1;
  aiDecisionTraces.push({
    id: aiDecisionTraceSequence,
    ...entry,
  });

  if (aiDecisionTraces.length > AI_TRACE_LIMIT) {
    aiDecisionTraces.splice(0, aiDecisionTraces.length - AI_TRACE_LIMIT);
  }
}

function clearAIDecisionTraces() {
  aiDecisionTraceSequence = 0;
  aiDecisionTraces = [];
}

function cloneStartingCorners(assignments) {
  if (!assignments || typeof assignments !== "object") {
    return null;
  }

  return Object.fromEntries(
    Object.entries(assignments).map(([player, entry]) => [
      player,
      {
        slotOwner: entry?.slotOwner ?? null,
        coord: entry?.coord ? cloneCoord(entry.coord) : null,
      },
    ])
  );
}

function buildGameTracePackage({ gameNumber, seatOffset = 0, startingCorners = null, winner = null, traces }) {
  const safeTraces = cloneTraceRows(traces);
  return {
    gameNumber,
    seatOffset,
    startingCorners: cloneStartingCorners(startingCorners),
    winner,
    traceCount: safeTraces.length,
    kpiSummary: buildTraceKpiSummary(safeTraces),
    traces: safeTraces,
  };
}

function archiveCurrentGameTraces(winner = null) {
  if (!Number.isFinite(gameCounter) || gameCounter <= 0 || aiDecisionTraces.length === 0 || archivedGameNumbers.has(gameCounter)) {
    return false;
  }

  sessionTraceArchive.push(buildGameTracePackage({
    gameNumber: gameCounter,
    seatOffset: currentSeatOffset,
    startingCorners: currentStartingCorners,
    winner,
    traces: aiDecisionTraces,
  }));
  archivedGameNumbers.add(gameCounter);

  if (sessionTraceArchive.length > SESSION_TRACE_ARCHIVE_LIMIT) {
    const overflow = sessionTraceArchive.length - SESSION_TRACE_ARCHIVE_LIMIT;
    const removed = sessionTraceArchive.splice(0, overflow);
    for (const item of removed) {
      archivedGameNumbers.delete(item.gameNumber);
    }
  }

  return true;
}

function buildSessionTraceExportPayload() {
  const games = [...sessionTraceArchive];

  if (aiDecisionTraces.length > 0 && !archivedGameNumbers.has(gameCounter)) {
    const currentWinner = turnMachine?.phase === TurnPhase.MatchEnded ? (turnMachine.winner ?? null) : null;
    games.push(buildGameTracePackage({
      gameNumber: gameCounter,
      seatOffset: currentSeatOffset,
      startingCorners: currentStartingCorners,
      winner: currentWinner,
      traces: aiDecisionTraces,
    }));
  }

  const traceCount = games.reduce((sum, game) => sum + (game.traceCount ?? 0), 0);

  return {
    version: VERSION,
    exportedAt: new Date().toISOString(),
    gameCount: games.length,
    traceCount,
    games,
  };
}


function buildCountMap(values) {
  const counts = new Map();
  for (const value of values) {
    const key = String(value ?? "Unknown");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function entropyBits(counts, total) {
  if (!counts || counts.size === 0 || total <= 0) {
    return 0;
  }
  let entropy = 0;
  for (const count of counts.values()) {
    if (count <= 0) {
      continue;
    }
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function buildTraceKpiSummary(traces) {
  const turnCount = Array.isArray(traces) ? traces.length : 0;
  if (turnCount === 0) {
    return { turnCount: 0 };
  }

  const moveKeys = [];
  const playerTurns = new Map();
  const playerLastTurn = new Map();
  const pieceTypeValues = [];
  const pieceIdValues = [];
  const selectedByCounts = new Map();
  const personaCounts = new Map();
  const topKCounts = new Map();

  let elapsedMsTotal = 0;
  let elapsedMsCount = 0;
  let withinBudgetCount = 0;
  let tacticalActiveCount = 0;
  let tacticalRejectedTotal = 0;
  let personaRiskRejectedTotal = 0;
  let personaCandidatePoolTotal = 0;
  let cacheObservedCount = 0;
  let cacheHitCount = 0;
  let searchDepthTotal = 0;
  let searchDepthCount = 0;
  let searchNodesTotal = 0;

  const perPlayerRecent = new Map();
  let sameDestinationCount = 0;
  let backtrackCount = 0;

  for (const trace of traces) {
    const move = trace?.chosenMove ?? null;
    const player = String(trace?.player ?? "Unknown");
    const turnIndex = Number(trace?.turnIndex ?? 0);

    playerTurns.set(player, (playerTurns.get(player) ?? 0) + 1);
    if (turnIndex > (playerLastTurn.get(player) ?? 0)) {
      playerLastTurn.set(player, turnIndex);
    }

    if (trace?.selectedPieceType) {
      pieceTypeValues.push(trace.selectedPieceType);
    }
    if (move?.pieceId) {
      pieceIdValues.push(move.pieceId);
    }

    const moveKeyValue = move ? moveKey(move) : "none";
    moveKeys.push(moveKeyValue);

    const selectedBy = String(trace?.selectedBy ?? "unknown");
    selectedByCounts.set(selectedBy, (selectedByCounts.get(selectedBy) ?? 0) + 1);
    const personaId = String(trace?.personaId ?? "default");
    personaCounts.set(personaId, (personaCounts.get(personaId) ?? 0) + 1);

    if (typeof trace?.samplingTopK === "number") {
      const k = String(trace.samplingTopK);
      topKCounts.set(k, (topKCounts.get(k) ?? 0) + 1);
    }

    if (typeof trace?.elapsedMs === "number" && Number.isFinite(trace.elapsedMs)) {
      elapsedMsTotal += trace.elapsedMs;
      elapsedMsCount += 1;
      if (trace.elapsedMs <= 10000) {
        withinBudgetCount += 1;
      }
    }

    if (trace?.tacticalFilterActive === true) {
      tacticalActiveCount += 1;
    }

    if (typeof trace?.cacheHit === "boolean") {
      cacheObservedCount += 1;
      if (trace.cacheHit) {
        cacheHitCount += 1;
      }
    }

    if (typeof trace?.searchDepthReached === "number" && Number.isFinite(trace.searchDepthReached)) {
      searchDepthTotal += trace.searchDepthReached;
      searchDepthCount += 1;
    }

    if (typeof trace?.searchNodesExpanded === "number" && Number.isFinite(trace.searchNodesExpanded)) {
      searchNodesTotal += trace.searchNodesExpanded;
    }
    if (typeof trace?.tacticalRejectedCount === "number" && Number.isFinite(trace.tacticalRejectedCount)) {
      tacticalRejectedTotal += trace.tacticalRejectedCount;
    }
    if (typeof trace?.personaRiskRejectedCount === "number" && Number.isFinite(trace.personaRiskRejectedCount)) {
      personaRiskRejectedTotal += trace.personaRiskRejectedCount;
    }
    if (typeof trace?.personaCandidatePoolCount === "number" && Number.isFinite(trace.personaCandidatePoolCount)) {
      personaCandidatePoolTotal += trace.personaCandidatePoolCount;
    }

    if (move) {
      const last = perPlayerRecent.get(player) ?? null;
      const destinationKey = String(move.to?.x) + "," + String(move.to?.y) + "," + String(move.to?.z);
      if (last?.destinationKey === destinationKey) {
        sameDestinationCount += 1;
      }
      const fromKey = String(move.from?.x) + "," + String(move.from?.y) + "," + String(move.from?.z);
      const isBacktrack = last
        && last.pieceId === move.pieceId
        && last.fromKey === destinationKey
        && last.destinationKey === fromKey;
      if (isBacktrack) {
        backtrackCount += 1;
      }

      perPlayerRecent.set(player, {
        pieceId: move.pieceId,
        fromKey,
        destinationKey,
      });
    }
  }

  let repeatedConsecutiveMoveCount = 0;
  for (let i = 1; i < moveKeys.length; i += 1) {
    if (moveKeys[i] === moveKeys[i - 1]) {
      repeatedConsecutiveMoveCount += 1;
    }
  }

  const uniqueMoves = new Set(moveKeys);
  const pieceTypeCounts = buildCountMap(pieceTypeValues);
  const pieceIdCounts = buildCountMap(pieceIdValues);

  const playerSummary = {};
  for (const [player, turns] of [...playerTurns.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    playerSummary[player] = {
      turns,
      share: Number((turns / turnCount).toFixed(3)),
      lastTurn: playerLastTurn.get(player) ?? 0,
    };
  }

  const estimatedEliminationOrder = [...playerLastTurn.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([player, lastTurn]) => ({ player, lastTurn }));

  const selectedBySummary = Object.fromEntries([...selectedByCounts.entries()].sort((a, b) => b[1] - a[1]));
  const personaSummary = Object.fromEntries([...personaCounts.entries()].sort((a, b) => b[1] - a[1]));
  const topKSummary = Object.fromEntries([...topKCounts.entries()].sort((a, b) => Number(a[0]) - Number(b[0])));

  const avgElapsedMs = elapsedMsCount > 0 ? elapsedMsTotal / elapsedMsCount : 0;

  return {
    turnCount,
    uniqueMoveCount: uniqueMoves.size,
    uniqueMoveRatio: Number((uniqueMoves.size / turnCount).toFixed(3)),
    repeatedConsecutiveMoveCount,
    repeatedConsecutiveMoveRate: Number((repeatedConsecutiveMoveCount / turnCount).toFixed(3)),
    sameDestinationRepeatRate: Number((sameDestinationCount / turnCount).toFixed(3)),
    backtrackRate: Number((backtrackCount / turnCount).toFixed(3)),
    pieceTypeEntropyBits: Number(entropyBits(pieceTypeCounts, pieceTypeValues.length).toFixed(3)),
    pieceIdEntropyBits: Number(entropyBits(pieceIdCounts, pieceIdValues.length).toFixed(3)),
    avgElapsedMs: Number(avgElapsedMs.toFixed(2)),
    turnBudgetComplianceRate: elapsedMsCount > 0
      ? Number((withinBudgetCount / elapsedMsCount).toFixed(3))
      : null,
    selectedBy: selectedBySummary,
    personas: personaSummary,
    samplingTopK: topKSummary,
    tacticalFilterActiveRate: Number((tacticalActiveCount / turnCount).toFixed(3)),
    avgTacticalRejected: Number((tacticalRejectedTotal / turnCount).toFixed(2)),
    avgPersonaRiskRejected: Number((personaRiskRejectedTotal / turnCount).toFixed(2)),
    avgPersonaCandidatePool: Number((personaCandidatePoolTotal / turnCount).toFixed(2)),
    cacheHitRate: cacheObservedCount > 0 ? Number((cacheHitCount / cacheObservedCount).toFixed(3)) : null,
    avgSearchDepth: searchDepthCount > 0 ? Number((searchDepthTotal / searchDepthCount).toFixed(2)) : null,
    avgSearchNodesExpanded: Number((searchNodesTotal / turnCount).toFixed(2)),
    playerSummary,
    estimatedEliminationOrder,
  };
}
function exportAIDecisionTraces() {
  const payload = buildSessionTraceExportPayload();
  if (payload.gameCount <= 0 || payload.traceCount <= 0) {
    setStatus("No AI decision trace rows available yet.");
    return;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cubechess-ai-session-v${VERSION}-games${payload.gameCount}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  setStatus(`Exported ${payload.gameCount} game traces (${payload.traceCount} AI decision rows).`);
}

function updateMetricsHud() {
  if (!metricsEl) {
    return;
  }

  const avgTurn = telemetry.turnDurationsMs.length
    ? telemetry.turnDurationsMs.reduce((sum, value) => sum + value, 0) / telemetry.turnDurationsMs.length
    : 0;
  const p95Turn = percentile(telemetry.turnDurationsMs, 95);
  const medianRound = percentile(telemetry.roundDurationsMs, 50);

  metricsEl.textContent = `mode ${varietyMode} | avgTurn ${avgTurn.toFixed(1)}ms | p95 ${p95Turn.toFixed(1)}ms | medRound ${medianRound.toFixed(0)}ms | timeouts ${telemetry.timeoutCount}`;
}

function recordTurnTelemetry(turnMs, timedOut) {
  telemetry.turnDurationsMs.push(turnMs);
  if (telemetry.turnDurationsMs.length > 200) {
    telemetry.turnDurationsMs.shift();
  }

  if (timedOut) {
    telemetry.timeoutCount += 1;
  }

  telemetry.roundTurnCount += 1;
  if (telemetry.roundTurnCount >= TURN_ORDER.length) {
    const now = performance.now();
    telemetry.roundDurationsMs.push(now - telemetry.roundStartMs);
    if (telemetry.roundDurationsMs.length > 200) {
      telemetry.roundDurationsMs.shift();
    }
    telemetry.roundStartMs = now;
    telemetry.roundTurnCount = 0;
  }

  updateMetricsHud();
}

function hashString01(value) {
  const input = String(value ?? "");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}
function makePieceVisual(piece) {
  const color = PLAYER_COLOR[piece.owner] ?? 0xffffff;
  const isKing = piece.type === PIECE_TYPES.King;
  const modelTemplate = pieceModelTemplates.get(piece.type) ?? null;
  const root = new THREE.Group();

  const cell = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: CELL_HIGHLIGHT_OPACITY,
      depthTest: false,
      depthWrite: false,
    })
  );

  let core = null;
  let coreMaterial = null;
  let modelMaterials = [];
  let glowMaterials = [];
  const coreBaseOpacity = isKing ? MODEL_CORE_KING_BASE_OPACITY : MODEL_CORE_BASE_OPACITY;
  const glowBaseOpacity = isKing ? MODEL_GLOW_KING_BASE_OPACITY : MODEL_GLOW_BASE_OPACITY;

  if (modelTemplate) {
    const modelInstance = modelTemplate.clone(true);
    modelMaterials = tintModelInstance(modelInstance, color, coreBaseOpacity, {
      emissiveScale: experimentalPieceLightEnabled ? 0.62 : 0.26,
      emissiveIntensity: experimentalPieceLightEnabled ? 1.15 : 0.7,
      depthTest: false,
      depthWrite: false,
    });

    const glowInstance = modelTemplate.clone(true);
    glowMaterials = tintModelInstance(glowInstance, color, glowBaseOpacity, {
      blending: THREE.AdditiveBlending,
      emissiveScale: 0.6,
      emissiveIntensity: 1.15,
      renderOrder: 11,
      depthTest: false,
      depthWrite: false,
    });

    // Keep glow registered to model center, then bias slightly downward for visual centering.
    glowInstance.position.copy(modelInstance.position);
    glowInstance.quaternion.copy(modelInstance.quaternion);
    glowInstance.scale.copy(modelInstance.scale).multiplyScalar(MODEL_GLOW_SCALE);
    alignModelCenterToReference(glowInstance, modelInstance);
    glowInstance.position.y += MODEL_GLOW_Y_BIAS;

    root.add(glowInstance);
    root.add(modelInstance);
  } else {
    core = new THREE.Mesh(
      new THREE.SphereGeometry(isKing ? 0.28 : 0.24, 24, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthTest: false,
      })
    );
    coreMaterial = core.material;
    root.add(core);
    core.renderOrder = 12;
  }

  root.add(cell);
  cell.renderOrder = 8;

  const bobSeed = hashString01(piece.id);

  return {
    root,
    color,
    isKing,
    modelTemplate,
    coreBaseOpacity,
    glowBaseOpacity,
    modelMaterials,
    glowMaterials,
    cellMaterial: cell.material,
    coreMaterial,
    bobPhase: bobSeed * Math.PI * 2,
    bobRate: 0.28 + bobSeed * 0.2,
    bobAmplitude: isKing ? 0.06 : 0.048,
  };
}

function setPieceWorldPosition(pieceVisual, coord) {
  pieceVisual.root.position.copy(boardToWorld(coord.x, coord.y, coord.z));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function computePieceDistanceFade(worldPosition) {
  const distance = camera.position.distanceTo(worldPosition);
  const t = clamp01(
    (distance - PIECE_FADE_NEAR_DISTANCE) / (PIECE_FADE_FAR_DISTANCE - PIECE_FADE_NEAR_DISTANCE)
  );
  return PIECE_FADE_NEAR_FACTOR + (PIECE_FADE_FAR_FACTOR - PIECE_FADE_NEAR_FACTOR) * t;
}

function applyPieceDistanceFade() {
  const captureVisuals = new Set();
  for (const anim of animations) {
    if (anim.type === "capture" && anim.visual) {
      captureVisuals.add(anim.visual);
    }
  }

  for (const visual of pieceVisuals.values()) {
    if (captureVisuals.has(visual)) {
      continue;
    }

    const fade = computePieceDistanceFade(visual.root.position);
    visual.cellMaterial.opacity = CELL_HIGHLIGHT_OPACITY * fade;
    const coreOpacity = (visual.coreBaseOpacity ?? 1) * fade;
    if (visual.modelMaterials?.length) {
      for (const material of visual.modelMaterials) {
        material.opacity = coreOpacity;
      }
    } else if (visual.coreMaterial) {
      visual.coreMaterial.opacity = coreOpacity;
    }

    if (visual.glowMaterials?.length) {
      const glowOpacity = (visual.glowBaseOpacity ?? 0) * fade;
      for (const material of visual.glowMaterials) {
        material.opacity = glowOpacity;
      }
    }
  }
}

function applyIdleBobbing(nowMs) {
  const t = nowMs * 0.001;
  const movingVisuals = new Set();
  const captureVisuals = new Set();

  for (const anim of animations) {
    if (anim?.visual) {
      if (anim.type === "move") {
        movingVisuals.add(anim.visual);
      } else if (anim.type === "capture") {
        captureVisuals.add(anim.visual);
      }
    }
  }

  for (const piece of matchState.pieces) {
    if (!piece.alive) {
      continue;
    }
    const visual = pieceVisuals.get(piece.id);
    if (!visual || movingVisuals.has(visual) || captureVisuals.has(visual)) {
      continue;
    }
    const anchor = boardToWorld(piece.coord.x, piece.coord.y, piece.coord.z);
    const bob = Math.sin((t * visual.bobRate * Math.PI * 2) + visual.bobPhase) * visual.bobAmplitude;
    visual.root.position.set(anchor.x, anchor.y + bob, anchor.z);
  }
}
const DECISION_MAX_CANDIDATES = 512;
const AI_CANDIDATE_POOL_LIMIT = 96;
const AI_CANDIDATE_MIN_PER_PIECE = 2;
const AI_DANGER_STAGE_CANDIDATE_LIMITS = Object.freeze([8, 16, 24]);
const AI_DANGER_STAGE_OPPONENT_LIMITS = Object.freeze([16, 28, 40]);
const AI_DANGER_WEIGHT = 0.8;
const AI_DANGER_BUDGET_FRACTION = 0.32;
const AI_DANGER_BUDGET_MIN_MS = 120;
const AI_DANGER_BUDGET_MAX_MS = 1800;
const AI_SEARCH_BUDGET_FRACTION = 0.42;
const AI_SEARCH_BUDGET_MIN_MS = 60;
const AI_SEARCH_BUDGET_MAX_MS = 1200;
const AI_SEARCH_ROOT_CANDIDATE_LIMIT = 16;
const AI_SEARCH_DEPTH3_CANDIDATE_LIMIT = 8;
const AI_SEARCH_OPPONENT_MOVE_LIMIT = 14;
const AI_SEARCH_SELF_MOVE_LIMIT = 14;
const AI_SEARCH_MIN_DEPTH3_BUDGET_MS = 45;
const AI_SEARCH_REPLY_WEIGHT = 0.9;
const AI_SEARCH_RECOVERY_WEIGHT = 0.65;
const AI_SEARCH_BLEND_FACTOR = 0.75;
const DECISION_BOX_GEO = new THREE.BoxGeometry(0.82, 0.82, 0.82);
const DECISION_PIECE_GEO = new THREE.BoxGeometry(1.06, 1.06, 1.06);
const decisionVisuals = [];
const FOLLOW_TARGET_LERP = 0.14;

function clearDecisionOverlay() {
  for (const visual of decisionVisuals) {
    decisionLayer.remove(visual.object);
    if (visual.geometry) {
      visual.geometry.dispose();
    }
    visual.material.dispose();
  }
  decisionVisuals.length = 0;
}

function setFollowPiece(pieceId) {
  followPieceId = pieceId ?? null;
}

function updateFollowActivePiece() {
  if (!followToggle?.checked || !followPieceId) {
    return;
  }
  const visual = pieceVisuals.get(followPieceId);
  if (!visual) {
    return;
  }
  controls.target.lerp(visual.root.position, FOLLOW_TARGET_LERP);
}

function getExperimentalLightTargetVisual() {
  if (followPieceId) {
    const followed = pieceVisuals.get(followPieceId);
    if (followed) {
      return followed;
    }
  }

  if (!matchState) {
    return null;
  }

  const activeKing = matchState.pieces.find(
    (piece) => piece.alive && piece.owner === matchState.activePlayer && piece.type === PIECE_TYPES.King
  );
  if (activeKing) {
    const kingVisual = pieceVisuals.get(activeKing.id);
    if (kingVisual) {
      return kingVisual;
    }
  }

  const fallbackPiece = matchState.pieces.find(
    (piece) => piece.alive && piece.owner === matchState.activePlayer
  );
  if (!fallbackPiece) {
    return null;
  }
  return pieceVisuals.get(fallbackPiece.id) ?? null;
}

function updateExperimentalPieceLight() {
  if (!experimentalPieceLightEnabled) {
    experimentalPieceLight.intensity = 0;
    return;
  }

  const targetVisual = getExperimentalLightTargetVisual();
  if (!targetVisual) {
    experimentalPieceLight.intensity = 0;
    return;
  }

  const fade = computePieceDistanceFade(targetVisual.root.position);
  const base = targetVisual.isKing ? 0.48 : 0.34;
  experimentalPieceLight.color.setHex(targetVisual.color);
  experimentalPieceLight.distance = targetVisual.isKing ? 3.2 : 2.8;
  experimentalPieceLight.position.lerp(targetVisual.root.position, 0.42);
  experimentalPieceLight.intensity = base * fade;
}
function showDecisionOverlay(scoredMoves, options = {}) {
  const {
    focusIndex = -1,
    solo = false,
    showPath = true,
    bestOpacity = 0.48,
    otherOpacity = 0.26,
    maxVisible = Number.POSITIVE_INFINITY,
  } = options;

  clearDecisionOverlay();
  if (!Array.isArray(scoredMoves) || scoredMoves.length === 0) {
    return;
  }

  const topCandidates = scoredMoves.slice(0, DECISION_MAX_CANDIDATES);
  const candidates = solo && focusIndex >= 0 && focusIndex < topCandidates.length
    ? [topCandidates[focusIndex]]
    : topCandidates;

  const focusedMove = focusIndex >= 0 && focusIndex < topCandidates.length
    ? topCandidates[focusIndex].move
    : topCandidates[0]?.move;
  setFollowPiece(focusedMove?.pieceId ?? null);

  for (let index = 0; index < candidates.length; index += 1) {
    const entry = candidates[index];
    const move = entry.move;
    const sourceIndex = solo ? focusIndex : index;
    const pieceColor = pieceVisuals.get(move.pieceId)?.color ?? 0x7fd2ff;
    const hasFocus = focusIndex >= 0;
    const isFocused = sourceIndex === focusIndex;
    const isBest = sourceIndex === 0;
    const emphasize = hasFocus ? isFocused : isBest;
    const visibleLimit = Number.isFinite(maxVisible) ? Math.max(1, Math.floor(maxVisible)) : Number.POSITIVE_INFINITY;
    if (!emphasize && sourceIndex >= visibleLimit) {
      continue;
    }

    const cubeColor = emphasize ? getHighlightColor(pieceColor, 0.78) : pieceColor;
    const baseOther = Math.max(0.14, otherOpacity - sourceIndex * 0.008);
    const cubeOpacity = emphasize ? bestOpacity : baseOther;

    const cubeMaterial = new THREE.MeshBasicMaterial({
      color: cubeColor,
      transparent: true,
      opacity: cubeOpacity,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const cube = new THREE.Mesh(DECISION_BOX_GEO, cubeMaterial);
    cube.position.copy(boardToWorld(move.to.x, move.to.y, move.to.z));
    cube.renderOrder = emphasize ? 16 : 9;
    decisionLayer.add(cube);
    decisionVisuals.push({ object: cube, material: cubeMaterial });

    if (showPath && emphasize) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        boardToWorld(move.from.x, move.from.y, move.from.z),
        boardToWorld(move.to.x, move.to.y, move.to.z),
      ]);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: getHighlightColor(pieceColor, 0.82),
        transparent: true,
        opacity: isFocused ? 0.85 : 0.72,
        depthTest: false,
        depthWrite: false,
      });
      const line = new THREE.Line(lineGeo, lineMaterial);
      line.renderOrder = 17;
      decisionLayer.add(line);
      decisionVisuals.push({ object: line, material: lineMaterial, geometry: lineGeo });
    }
  }
}

function parsePieceOrdinal(pieceId) {
  const parts = String(pieceId ?? "").split("-");
  const raw = parts[parts.length - 1] ?? "0";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPieceSortRank(pieceType) {
  switch (pieceType) {
    case PIECE_TYPES.King:
      return 0;
    case PIECE_TYPES.Queen:
      return 1;
    case PIECE_TYPES.Bishop:
      return 2;
    case PIECE_TYPES.Rook:
      return 3;
    case PIECE_TYPES.Knight:
      return 4;
    default:
      return 9;
  }
}

function comparePieceOrder(a, b) {
  const rankA = getPieceSortRank(a.pieceType);
  const rankB = getPieceSortRank(b.pieceType);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  const ordA = parsePieceOrdinal(a.pieceId);
  const ordB = parsePieceOrdinal(b.pieceId);
  if (ordA !== ordB) {
    return ordA - ordB;
  }
  return a.pieceId.localeCompare(b.pieceId);
}

function buildPieceCandidatesFromScored(scoredMoves, pieceById = new Map()) {
  const byPiece = new Map();

  for (const entry of scoredMoves) {
    const pieceId = entry.move.pieceId;
    let bucket = byPiece.get(pieceId);
    const piece = pieceById.get(pieceId);
    if (!bucket) {
      bucket = {
        pieceId,
        pieceType: piece?.type,
        from: entry.move.from,
        bestScore: entry.score,
        moves: [],
      };
      byPiece.set(pieceId, bucket);
    }
    bucket.moves.push(entry);
    if (entry.score > bucket.bestScore) {
      bucket.bestScore = entry.score;
    }
  }

  return [...byPiece.values()].sort(comparePieceOrder);
}

function moveKey(move) {
  const to = move?.to ?? { x: "?", y: "?", z: "?" };
  return String(move?.pieceId ?? "piece") + ":" + to.x + "," + to.y + "," + to.z;
}

function pruneScoredCandidates(scoredMoves, options = {}) {
  const limit = Math.max(1, options.limit ?? AI_CANDIDATE_POOL_LIMIT);
  const minPerPiece = Math.max(1, options.minPerPiece ?? AI_CANDIDATE_MIN_PER_PIECE);
  const scoreWindow = Math.max(0, options.scoreWindow ?? 4.5);
  const eliteCount = Math.max(
    minPerPiece,
    Math.min(limit, options.eliteCount ?? Math.max(12, Math.floor(limit * 0.25)))
  );
  const captureBoostCount = Math.max(0, Math.min(limit, options.captureBoostCount ?? Math.max(6, Math.floor(limit * 0.12))));
  if (!Array.isArray(scoredMoves) || scoredMoves.length <= limit) {
    return Array.isArray(scoredMoves) ? [...scoredMoves] : [];
  }

  const sorted = [...scoredMoves].sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    if (a.move.pieceId !== b.move.pieceId) {
      return a.move.pieceId.localeCompare(b.move.pieceId);
    }
    if (a.move.to.x !== b.move.to.x) return a.move.to.x - b.move.to.x;
    if (a.move.to.y !== b.move.to.y) return a.move.to.y - b.move.to.y;
    return a.move.to.z - b.move.to.z;
  });

  const kept = [];
  const keptByPiece = new Map();
  const keptMoveKeys = new Set();
  const bestByPiece = new Map();
  const topByPiece = new Map();

  const addEntry = (entry) => {
    if (!entry || kept.length >= limit) {
      return false;
    }
    const key = moveKey(entry.move);
    if (keptMoveKeys.has(key)) {
      return false;
    }
    kept.push(entry);
    keptMoveKeys.add(key);
    const pieceId = entry.move?.pieceId;
    if (pieceId) {
      keptByPiece.set(pieceId, (keptByPiece.get(pieceId) ?? 0) + 1);
    }
    return true;
  };

  for (const entry of sorted) {
    const pieceId = entry.move?.pieceId;
    if (!pieceId) {
      continue;
    }
    if (!bestByPiece.has(pieceId)) {
      bestByPiece.set(pieceId, Number(entry.score ?? 0));
      topByPiece.set(pieceId, entry);
    }
  }

  for (let index = 0; index < eliteCount && index < sorted.length; index += 1) {
    addEntry(sorted[index]);
  }

  if (captureBoostCount > 0) {
    const captures = sorted
      .filter((entry) => Boolean(entry?.move?.capturedPieceId) || Number(entry?.breakdown?.capture ?? 0) > 0)
      .slice(0, captureBoostCount);
    for (const entry of captures) {
      if (kept.length >= limit) {
        break;
      }
      addEntry(entry);
    }
  }

  for (const entry of topByPiece.values()) {
    if (kept.length >= limit) {
      break;
    }
    addEntry(entry);
  }

  for (const entry of sorted) {
    if (kept.length >= limit) {
      break;
    }
    const pieceId = entry.move?.pieceId;
    if (!pieceId) {
      continue;
    }
    const count = keptByPiece.get(pieceId) ?? 0;
    if (count >= minPerPiece) {
      continue;
    }
    const bestScore = bestByPiece.get(pieceId) ?? Number(entry.score ?? 0);
    const score = Number(entry.score ?? 0);
    if (score < bestScore - scoreWindow) {
      continue;
    }
    addEntry(entry);
  }

  for (const entry of sorted) {
    if (kept.length >= limit) {
      break;
    }
    addEntry(entry);
  }

  return kept;
}

function buildPieceCandidatesFromMoves(legalMoves, pieceById = new Map()) {
  const pseudo = legalMoves.map((move) => ({ move, score: 0 }));
  return buildPieceCandidatesFromScored(pseudo, pieceById);
}

function showPieceSelectionOverlay(pieceCandidates, options = {}) {
  const {
    focusIndex = -1,
    solo = false,
    bestOpacity = 0.52,
    otherOpacity = 0.24,
    maxVisible = Number.POSITIVE_INFINITY,
  } = options;

  clearDecisionOverlay();
  if (!Array.isArray(pieceCandidates) || pieceCandidates.length === 0) {
    return;
  }

  const entries = solo && focusIndex >= 0 && focusIndex < pieceCandidates.length
    ? [pieceCandidates[focusIndex]]
    : pieceCandidates;

  const focusedPiece = focusIndex >= 0 && focusIndex < pieceCandidates.length
    ? pieceCandidates[focusIndex]
    : pieceCandidates[0];
  setFollowPiece(focusedPiece?.pieceId ?? null);

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const sourceIndex = solo ? focusIndex : index;
    const hasFocus = focusIndex >= 0;
    const isFocused = sourceIndex === focusIndex;
    const isBest = sourceIndex === 0;
    const emphasize = hasFocus ? isFocused : isBest;
    const pieceColor = pieceVisuals.get(entry.pieceId)?.color ?? 0x7fd2ff;
    const visibleLimit = Number.isFinite(maxVisible) ? Math.max(1, Math.floor(maxVisible)) : Number.POSITIVE_INFINITY;
    if (!emphasize && sourceIndex >= visibleLimit) {
      continue;
    }

    const mat = new THREE.MeshBasicMaterial({
      color: emphasize ? getHighlightColor(pieceColor, 0.78) : pieceColor,
      transparent: true,
      opacity: emphasize ? bestOpacity : Math.max(0.12, otherOpacity - sourceIndex * 0.01),
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const box = new THREE.Mesh(DECISION_PIECE_GEO, mat);
    box.position.copy(boardToWorld(entry.from.x, entry.from.y, entry.from.z));
    box.renderOrder = emphasize ? 18 : 10;
    decisionLayer.add(box);
    decisionVisuals.push({ object: box, material: mat });
  }
}
function computeHeuristicDecisionLocal({ legalMoves, player, aiBudgetMs, signal, personaTuning = AI_PERSONA_TUNING.default }) {
  const threatContext = createTurnThreatContext({
    matchState,
    occupancyMap,
    player,
  });

  const behaviorContext = {
    pieceMoveCountsById: aiPieceMoveCounts,
    recentMoves: aiRecentMoves,
  };
  const boardPhase = classifyBoardPhase(matchState);

  const scored = [];

  for (const move of legalMoves) {
    if (signal?.aborted) {
      break;
    }

    const evaluated = evaluateHeuristicMove({
      move,
      matchState,
      legalMoves,
      threatContext,
      behaviorContext,
      boardPhase,
    });
    scored.push({ move, score: evaluated.score, breakdown: evaluated.breakdown });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    if (a.move.pieceId !== b.move.pieceId) {
      return a.move.pieceId.localeCompare(b.move.pieceId);
    }
    if (a.move.to.x !== b.move.to.x) return a.move.to.x - b.move.to.x;
    if (a.move.to.y !== b.move.to.y) return a.move.to.y - b.move.to.y;
    return a.move.to.z - b.move.to.z;
  });

  const dangerConfig = mergeConfig({
    stageCandidateLimits: AI_DANGER_STAGE_CANDIDATE_LIMITS,
    stageOpponentMoveLimits: AI_DANGER_STAGE_OPPONENT_LIMITS,
    dangerWeight: AI_DANGER_WEIGHT,
    budgetFraction: AI_DANGER_BUDGET_FRACTION,
    budgetMinMs: AI_DANGER_BUDGET_MIN_MS,
    budgetMaxMs: AI_DANGER_BUDGET_MAX_MS,
  }, personaTuning?.dangerConfig);
  const candidateConfig = mergeConfig({
    poolLimit: AI_CANDIDATE_POOL_LIMIT,
    minPerPiece: AI_CANDIDATE_MIN_PER_PIECE,
  }, personaTuning?.candidateConfig);

  const dangerBudgetMs = Math.max(
    dangerConfig.budgetMinMs ?? AI_DANGER_BUDGET_MIN_MS,
    Math.min(
      dangerConfig.budgetMaxMs ?? AI_DANGER_BUDGET_MAX_MS,
      Math.floor(aiBudgetMs * (dangerConfig.budgetFraction ?? AI_DANGER_BUDGET_FRACTION))
    )
  );

  const dangerResult = applyDangerAwareIterativeRescoring({
    scoredMoves: scored,
    matchState,
    player,
    stageCandidateLimits: dangerConfig.stageCandidateLimits ?? AI_DANGER_STAGE_CANDIDATE_LIMITS,
    stageOpponentMoveLimits: dangerConfig.stageOpponentMoveLimits ?? AI_DANGER_STAGE_OPPONENT_LIMITS,
    dangerWeight: dangerConfig.dangerWeight ?? AI_DANGER_WEIGHT,
    budgetMs: dangerBudgetMs,
    signal,
  });

  const dangerRescored = dangerResult.scoredMoves;

  const candidatePool = pruneScoredCandidates(dangerRescored, {
    limit: candidateConfig.poolLimit ?? AI_CANDIDATE_POOL_LIMIT,
    minPerPiece: AI_CANDIDATE_MIN_PER_PIECE,
  });

  return {
    boardPhase,
    scored,
    dangerBudgetMs,
    dangerResult,
    dangerRescored,
    candidatePool,
  };
}

const CHAOTIC_DIVERSITY_LOOKBACK = 14;
const CHAOTIC_SAME_PIECE_WEIGHT = 0.55;
const CHAOTIC_SAME_TYPE_WEIGHT = 0.34;
const CHAOTIC_REPEAT_DEST_WEIGHT = 0.26;
const CHAOTIC_BACKTRACK_WEIGHT = 0.22;
const CHAOTIC_TACTICAL_PROFILE = Object.freeze({
  opening: Object.freeze({ phase: "opening", scoreDrop: 3.1, dangerMargin: 2.8, minPool: 3, counterRiskCap: 8 }),
  midgame: Object.freeze({ phase: "midgame", scoreDrop: 2.4, dangerMargin: 2.0, minPool: 2, counterRiskCap: 6 }),
  endgame: Object.freeze({ phase: "endgame", scoreDrop: 1.8, dangerMargin: 1.4, minPool: 2, counterRiskCap: 4 }),
});

function computeScoreGapTop2(entries) {
  if (!Array.isArray(entries) || entries.length < 2) {
    return 0;
  }
  const top = Number(entries[0]?.score ?? 0);
  const second = Number(entries[1]?.score ?? 0);
  const gap = top - second;
  return Number.isFinite(gap) ? Math.max(0, gap) : 0;
}

function getChaoticTopKForGap(scoreGapTop2, candidateCount) {
  const maxK = Math.min(7, Math.max(1, candidateCount));
  if (maxK <= 2) {
    return maxK;
  }
  if (scoreGapTop2 >= 6) return Math.min(2, maxK);
  if (scoreGapTop2 >= 3) return Math.min(3, maxK);
  if (scoreGapTop2 >= 1.5) return Math.min(4, maxK);
  if (scoreGapTop2 >= 0.8) return Math.min(5, maxK);
  return maxK;
}

function computeChaoticPenalty(entry, recentMoves, player) {
  const move = entry?.move;
  if (!move) {
    return 0;
  }

  const recent = Array.isArray(recentMoves)
    ? recentMoves
      .filter((item) => item?.player === player)
      .slice(-CHAOTIC_DIVERSITY_LOOKBACK)
    : [];
  if (recent.length === 0) {
    return 0;
  }

  const movingType = inferPieceTypeFromId(move.pieceId);
  const samePieceCount = recent.reduce((count, item) => count + (item?.pieceId === move.pieceId ? 1 : 0), 0);
  const sameTypeCount = recent.reduce((count, item) => {
    const itemType = inferPieceTypeFromId(item?.pieceId);
    return count + (itemType === movingType ? 1 : 0);
  }, 0);
  const sameDestCount = recent.reduce((count, item) => {
    const to = item?.to;
    const sameDestination = to?.x === move.to?.x && to?.y === move.to?.y && to?.z === move.to?.z;
    return count + (sameDestination ? 1 : 0);
  }, 0);
  const last = recent[recent.length - 1] ?? null;
  const isBacktrack = last
    && last.pieceId === move.pieceId
    && last.to?.x === move.from?.x
    && last.to?.y === move.from?.y
    && last.to?.z === move.from?.z
    && last.from?.x === move.to?.x
    && last.from?.y === move.to?.y
    && last.from?.z === move.to?.z;

  const penalty = (samePieceCount * CHAOTIC_SAME_PIECE_WEIGHT)
    + (Math.max(0, sameTypeCount - 1) * CHAOTIC_SAME_TYPE_WEIGHT)
    + (sameDestCount * CHAOTIC_REPEAT_DEST_WEIGHT)
    + (isBacktrack ? CHAOTIC_BACKTRACK_WEIGHT : 0);

  return Number(penalty.toFixed(4));
}

function buildChaoticSelectionPool(candidatePool, recentMoves, player) {
  if (!Array.isArray(candidatePool) || candidatePool.length === 0) {
    return [];
  }

  const adjusted = candidatePool.map((entry, index) => {
    const chaosPenalty = computeChaoticPenalty(entry, recentMoves, player);
    const chaosScore = Number(entry.score ?? 0) - chaosPenalty;
    return {
      ...entry,
      chaosPenalty,
      chaosScore,
      _sourceIndex: index,
    };
  });

  adjusted.sort((a, b) => {
    if (a.chaosScore !== b.chaosScore) {
      return b.chaosScore - a.chaosScore;
    }
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a._sourceIndex - b._sourceIndex;
  });

  return adjusted.map(({ _sourceIndex, ...entry }) => entry);
}

function getTacticalProfileForPhase(boardPhase) {
  if (boardPhase === "opening") {
    return CHAOTIC_TACTICAL_PROFILE.opening;
  }
  if (boardPhase === "endgame") {
    return CHAOTIC_TACTICAL_PROFILE.endgame;
  }
  return CHAOTIC_TACTICAL_PROFILE.midgame;
}

function buildTacticalSelectionPool(selectionPool, boardPhase) {
  const profile = getTacticalProfileForPhase(boardPhase);
  if (!Array.isArray(selectionPool) || selectionPool.length === 0) {
    return { pool: [], profile, fallbackUsed: false };
  }

  const best = selectionPool[0];
  const bestScore = Number(best?.score ?? 0);
  const bestDanger = Number(best?.dangerPenalty ?? 0);

  const filtered = selectionPool.filter((entry, index) => {
    if (index === 0) {
      return true;
    }
    const score = Number(entry?.score ?? -Infinity);
    const danger = Number(entry?.dangerPenalty ?? 0);
    const counterRisk = Math.max(0, -(Number(entry?.breakdown?.counterRisk ?? 0)));
    return score >= bestScore - profile.scoreDrop
      && danger <= bestDanger + profile.dangerMargin
      && counterRisk <= profile.counterRiskCap;
  });

  const minRequired = Math.min(profile.minPool, selectionPool.length);
  if (filtered.length >= minRequired) {
    return { pool: filtered, profile, fallbackUsed: false };
  }

  return {
    pool: selectionPool.slice(0, minRequired),
    profile,
    fallbackUsed: true,
  };
}

function getEntryRisk(entry) {
  const counterRisk = Math.max(0, -(Number(entry?.breakdown?.counterRisk ?? 0)));
  const tablePressure = Math.max(0, -(Number(entry?.breakdown?.tablePressure ?? 0)));
  const antiHelper = Math.max(0, -(Number(entry?.breakdown?.antiHelper ?? 0)));
  return {
    counterRisk,
    combinedRisk: counterRisk + tablePressure + antiHelper,
  };
}

function applyPersonaRiskGate(candidatePool, personaTuning) {
  if (!Array.isArray(candidatePool) || candidatePool.length === 0) {
    return [];
  }
  const gate = personaTuning?.riskGate ?? {};
  const maxCombinedRisk = Number.isFinite(gate.maxCombinedRisk) ? gate.maxCombinedRisk : Number.POSITIVE_INFINITY;
  const maxCounterRisk = Number.isFinite(gate.maxCounterRisk) ? gate.maxCounterRisk : Number.POSITIVE_INFINITY;

  if (!Number.isFinite(maxCombinedRisk) && !Number.isFinite(maxCounterRisk)) {
    return [...candidatePool];
  }

  const filtered = candidatePool.filter((entry) => {
    const risk = getEntryRisk(entry);
    return risk.combinedRisk <= maxCombinedRisk && risk.counterRisk <= maxCounterRisk;
  });

  return filtered.length > 0 ? filtered : [...candidatePool];
}

async function chooseHeuristicAIMove({ legalMoves, signal, ...context }) {
  const decisionStartedMs = performance.now();
  const player = context.player ?? matchState.activePlayer;
  const turnIndex = (matchState?.turnCount ?? 0) + 1;
  const aiBudgetMs = context.budgetMs ?? AI_BUDGET_MS;
  const personaProfile = getPersonaProfileForPlayer(player);
  let personaId = personaProfile.id;
  const personaTuning = getPersonaTuning(personaId);
  const workerDangerConfig = mergeConfig({
    stageCandidateLimits: AI_DANGER_STAGE_CANDIDATE_LIMITS,
    stageOpponentMoveLimits: AI_DANGER_STAGE_OPPONENT_LIMITS,
    dangerWeight: AI_DANGER_WEIGHT,
    budgetFraction: AI_DANGER_BUDGET_FRACTION,
    budgetMinMs: AI_DANGER_BUDGET_MIN_MS,
    budgetMaxMs: AI_DANGER_BUDGET_MAX_MS,
  }, personaTuning?.dangerConfig);
  const workerCandidateConfig = mergeConfig({
    poolLimit: AI_CANDIDATE_POOL_LIMIT,
    minPerPiece: AI_CANDIDATE_MIN_PER_PIECE,
  }, personaTuning?.candidateConfig);
  const workerSearchConfig = mergeConfig({
    budgetFraction: AI_SEARCH_BUDGET_FRACTION,
    budgetMinMs: AI_SEARCH_BUDGET_MIN_MS,
    budgetMaxMs: AI_SEARCH_BUDGET_MAX_MS,
    rootCandidateLimit: AI_SEARCH_ROOT_CANDIDATE_LIMIT,
    depth3CandidateLimit: AI_SEARCH_DEPTH3_CANDIDATE_LIMIT,
    opponentMoveLimit: AI_SEARCH_OPPONENT_MOVE_LIMIT,
    selfMoveLimit: AI_SEARCH_SELF_MOVE_LIMIT,
    minDepth3BudgetMs: AI_SEARCH_MIN_DEPTH3_BUDGET_MS,
    replyWeight: AI_SEARCH_REPLY_WEIGHT,
    recoveryWeight: AI_SEARCH_RECOVERY_WEIGHT,
    blendFactor: AI_SEARCH_BLEND_FACTOR,
  }, personaTuning?.searchConfig);

  const pieceById = new Map(matchState.pieces.map((piece) => [piece.id, piece]));

  const pieceCandidatesAtStart = buildPieceCandidatesFromMoves(legalMoves, pieceById);
  const kingStartIndex = Math.max(0, pieceCandidatesAtStart.findIndex((entry) => entry.pieceType === PIECE_TYPES.King));
  if (pieceCandidatesAtStart.length > 0) {
    showPieceSelectionOverlay(pieceCandidatesAtStart, {
      focusIndex: kingStartIndex,
      solo: true,
      bestOpacity: 0.7,
      otherOpacity: 0.2,
    });
    await delayWithSignal(Math.max(30, Math.round(80 / Math.max(0.5, speedMultiplier))), signal);
  }

  let boardPhase = null;
  let scored = [];
  let dangerBudgetMs = 0;
  let dangerResult = { scoredMoves: [], completedStages: 0, timedOut: false };
  let dangerRescored = [];
  let candidatePool = [];
  let cacheHit = null;
  let cacheKey = null;
  let cacheSize = null;
  let searchBudgetMs = 0;
  let searchDepthReached = 0;
  let searchNodesExpanded = 0;
  let searchCacheHits = 0;
  let searchTimedOut = false;
  let searchedCandidateCount = 0;
  let searchPrincipalVariationBest = [];
  let searchPrincipalVariationByMove = {};

  try {
    const workerResult = await requestAIDecisionFromWorker({
      matchState: buildMatchSnapshotForAIWorker(matchState),
      player,
      legalMoves,
      aiBudgetMs,
      personaId: personaProfile.id,
      behaviorContext: {
        pieceMoveCountsById: [...aiPieceMoveCounts.entries()],
        recentMoves: aiRecentMoves,
      },
      dangerConfig: workerDangerConfig,
      candidateConfig: workerCandidateConfig,
      searchConfig: workerSearchConfig,
    }, { signal });

    if (workerResult) {
      boardPhase = workerResult.boardPhase ?? classifyBoardPhase(matchState);
      personaId = typeof workerResult.personaId === "string" && workerResult.personaId.trim().length > 0
        ? workerResult.personaId.trim()
        : personaProfile.id;
      scored = Array.isArray(workerResult.scored) ? workerResult.scored : [];
      dangerBudgetMs = Number(workerResult.dangerBudgetMs ?? 0);
      dangerResult = {
        scoredMoves: Array.isArray(workerResult.dangerRescored) ? workerResult.dangerRescored : [],
        completedStages: Number(workerResult.completedStages ?? 0),
        timedOut: workerResult.timedOut === true,
      };
      dangerRescored = dangerResult.scoredMoves;
      candidatePool = Array.isArray(workerResult.candidatePool) ? workerResult.candidatePool : [];
      cacheHit = typeof workerResult.cacheHit === "boolean" ? workerResult.cacheHit : null;
      cacheKey = typeof workerResult.cacheKey === "string" ? workerResult.cacheKey : null;
      cacheSize = Number.isFinite(workerResult.cacheSize) ? Number(workerResult.cacheSize) : null;
      searchBudgetMs = Number(workerResult.searchBudgetMs ?? 0);
      searchDepthReached = Number(workerResult.searchDepthReached ?? 0);
      searchNodesExpanded = Number(workerResult.searchNodesExpanded ?? 0);
      searchCacheHits = Number(workerResult.searchCacheHits ?? 0);
      searchTimedOut = workerResult.searchTimedOut === true;
      searchedCandidateCount = Number(workerResult.searchedCandidateCount ?? 0);
      searchPrincipalVariationBest = Array.isArray(workerResult.searchPrincipalVariationBest)
        ? workerResult.searchPrincipalVariationBest
        : Array.isArray(workerResult.searchPrincipalVariation)
          ? workerResult.searchPrincipalVariation
          : [];
      searchPrincipalVariationByMove = workerResult.searchPrincipalVariationByMove && typeof workerResult.searchPrincipalVariationByMove === "object"
        ? workerResult.searchPrincipalVariationByMove
        : {};
    }
  } catch (error) {
    console.warn("CubeChess AI worker failed; using main-thread fallback.", error);
    restartAIWorker();
  }

  if (scored.length === 0) {
    const localDecision = computeHeuristicDecisionLocal({
      legalMoves,
      player,
      aiBudgetMs,
      signal,
      personaTuning,
    });

    boardPhase = localDecision.boardPhase;
    scored = localDecision.scored;
    dangerBudgetMs = localDecision.dangerBudgetMs;
    dangerResult = localDecision.dangerResult;
    dangerRescored = localDecision.dangerRescored;
    candidatePool = localDecision.candidatePool;
  }

  if (scored.length === 0) {
    clearDecisionOverlay();
    const fallbackMove = legalMoves[0] ?? null;
    recordAIDecisionTrace({
      turnIndex,
      player,
      personaId,
      boardPhase: boardPhase ?? classifyBoardPhase(matchState),
      varietyMode,
      legalMoveCount: legalMoves.length,
      scoredMoveCount: 0,
      aiBudgetMs,
      cacheHit,
      cacheKey,
      cacheSize,
      searchBudgetMs,
      searchDepthReached,
      searchNodesExpanded,
      searchCacheHits,
      searchTimedOut,
      searchedCandidateCount,
      searchPrincipalVariationBest,
      searchPrincipalVariationChosen: [buildPvRootStep(fallbackMove, player)].filter(Boolean),
      elapsedMs: Number((performance.now() - decisionStartedMs).toFixed(2)),
      aborted: signal?.aborted === true,
      chosenMove: fallbackMove
        ? {
          pieceId: fallbackMove.pieceId,
          from: cloneCoord(fallbackMove.from),
          to: cloneCoord(fallbackMove.to),
        }
        : null,
      note: "no-scored-candidates",
    });
    return fallbackMove;
  }

  const personaCandidatePool = applyPersonaRiskGate(candidatePool, personaTuning);
  const personaRiskRejectedCount = Math.max(0, candidatePool.length - personaCandidatePool.length);
  let selectionPool = personaCandidatePool;
  let tacticalPool = personaCandidatePool;
  let tacticalProfile = getTacticalProfileForPhase(boardPhase);
  let tacticalFallbackUsed = false;
  let selectedBy = "deterministic_best";
  let scoreGapTop2 = computeScoreGapTop2(personaCandidatePool);
  let samplingTopK = 1;
  let tacticalFilterActive = false;
  let tacticalRejectedCount = 0;
  const usedChaoticRerank = varietyMode !== VarietyMode.Deterministic && personaCandidatePool.length > 0;

  if (usedChaoticRerank) {
    selectionPool = buildChaoticSelectionPool(candidatePool, aiRecentMoves, player);
    const tacticalResult = buildTacticalSelectionPool(selectionPool, boardPhase);
    tacticalPool = tacticalResult.pool;
    tacticalProfile = tacticalResult.profile;
    tacticalFallbackUsed = tacticalResult.fallbackUsed;
    tacticalFilterActive = tacticalPool.length < selectionPool.length;
    tacticalRejectedCount = Math.max(0, selectionPool.length - tacticalPool.length);
    scoreGapTop2 = computeScoreGapTop2(tacticalPool);
  }

  let chosenMove = tacticalPool[0]?.move ?? selectionPool[0]?.move ?? dangerRescored[0]?.move ?? scored[0]?.move ?? legalMoves[0] ?? null;
  if (!chosenMove) {
    clearDecisionOverlay();
    return null;
  }

  if (varietyMode !== VarietyMode.Deterministic && tacticalPool.length > 0) {
    const topK = getChaoticTopKForGap(scoreGapTop2, tacticalPool.length);
    samplingTopK = topK;
    const pool = tacticalPool.slice(0, topK);
    const totalWeight = pool.reduce((sum, _entry, index) => sum + (topK - index), 0);
    let ticket = nextVarietyRandom() * totalWeight;
    let chosenIndex = 0;
    for (let index = 0; index < pool.length; index += 1) {
      ticket -= (topK - index);
      if (ticket <= 0) {
        chosenIndex = index;
        chosenMove = pool[index].move;
        break;
      }
    }
    selectedBy = chosenIndex === 0 ? "chaotic_top1" : "chaotic_sampled";
  }

  const topCandidates = tacticalPool.slice(0, DECISION_MAX_CANDIDATES);
  const pieceCandidates = buildPieceCandidatesFromScored(topCandidates, pieceById);
  const chosenPieceIndex = Math.max(0, pieceCandidates.findIndex((entry) => entry.pieceId === chosenMove.pieceId));

  await previewPieceSelectionCycle(pieceCandidates, chosenPieceIndex, signal);
  await confirmPieceSelection(pieceCandidates, chosenPieceIndex, signal);

  const chosenPiece = pieceById.get(chosenMove.pieceId);
  const rawChosenPieceMoves = dangerRescored
    .filter((entry) => entry.move.pieceId === chosenMove.pieceId)
    .slice(0, DECISION_MAX_CANDIDATES);
  const bestDeterministicForPiece = chooseBestScoredMove(rawChosenPieceMoves) ?? rawChosenPieceMoves[0];

  const isSlidingPiece = chosenPiece?.type === PIECE_TYPES.Bishop
    || chosenPiece?.type === PIECE_TYPES.Rook
    || chosenPiece?.type === PIECE_TYPES.Queen;

  const orderedMoves = sortMovesByBranchDepth(rawChosenPieceMoves, chosenPiece?.type);
  const bestIndexInOrdered = Math.max(0, orderedMoves.findIndex((entry) => entry === bestDeterministicForPiece));
  const decisionCandidates = [];
  if (orderedMoves.length > 0) {
    for (let i = 0; i < orderedMoves.length; i += 1) {
      decisionCandidates.push(orderedMoves[(bestIndexInOrdered + i) % orderedMoves.length]);
    }
  }

  let focusOrder = null;
  if (experimentalBranchDepthEnabled && isSlidingPiece && decisionCandidates.length > 1 && bestDeterministicForPiece) {
    const chosenEntry = decisionCandidates.find((entry) => entry.move === chosenMove) ?? { move: chosenMove, score: 0 };
    const preferredPath = buildSlidingPreviewPath(decisionCandidates, bestDeterministicForPiece, chosenEntry);
    const seen = new Set();
    const orderedFocusEntries = [];
    for (const entry of preferredPath) {
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      orderedFocusEntries.push(entry);
    }

    focusOrder = orderedFocusEntries
      .map((entry) => decisionCandidates.indexOf(entry))
      .filter((index) => index >= 0);
  }

  const chosenMoveIndex = Math.max(0, decisionCandidates.findIndex((entry) => entry.move === chosenMove));

  await previewDecisionCycle(decisionCandidates, chosenMoveIndex, signal, focusOrder);
  await confirmDecision(decisionCandidates, chosenMoveIndex, signal);

  const chosenMoveKey = moveKey(chosenMove);
  const chosenPvFromMap = Array.isArray(searchPrincipalVariationByMove?.[chosenMoveKey])
    ? searchPrincipalVariationByMove[chosenMoveKey]
    : [];
  const searchPrincipalVariationChosen = chosenPvFromMap.length > 0
    ? chosenPvFromMap
    : [buildPvRootStep(chosenMove, player)].filter(Boolean);
  const searchPrincipalVariationBestSafe = Array.isArray(searchPrincipalVariationBest) && searchPrincipalVariationBest.length > 0
    ? searchPrincipalVariationBest
    : [buildPvRootStep(dangerRescored[0]?.move ?? chosenMove, player)].filter(Boolean);
  const chosenScoredEntry = dangerRescored.find((entry) => moveKey(entry.move) === chosenMoveKey)
    ?? scored.find((entry) => moveKey(entry.move) === chosenMoveKey)
    ?? null;
  const deterministicBest = dangerRescored[0] ?? scored[0] ?? null;
  const recentSamePieceCount = aiRecentMoves.reduce((count, entry) => count + (entry.pieceId === chosenMove.pieceId ? 1 : 0), 0);
  const recentSameDestinationCount = aiRecentMoves.reduce((count, entry) => {
    const sameDestination = entry.to?.x === chosenMove.to.x && entry.to?.y === chosenMove.to.y && entry.to?.z === chosenMove.to.z;
    return count + (entry.player === player && sameDestination ? 1 : 0);
  }, 0);

  recordAIDecisionTrace({
    turnIndex,
    player,
    personaId,
    boardPhase,
    varietyMode,
    legalMoveCount: legalMoves.length,
    scoredMoveCount: scored.length,
    candidatePoolCount: candidatePool.length,
    personaCandidatePoolCount: personaCandidatePool.length,
    personaRiskRejectedCount,
    aiBudgetMs,
    dangerBudgetMs,
    dangerCompletedStages: dangerResult.completedStages,
    dangerStageCandidateBudget: getDangerStageCandidateBudget(dangerResult.completedStages),
    dangerTimedOut: dangerResult.timedOut === true,
    cacheHit,
    cacheKey,
    cacheSize,
    searchBudgetMs,
    searchDepthReached,
    searchNodesExpanded,
    searchCacheHits,
    searchTimedOut,
    searchedCandidateCount,
    searchPrincipalVariationBest: searchPrincipalVariationBestSafe,
    searchPrincipalVariationChosen,
    aborted: signal?.aborted === true,
    selectedPieceType: chosenPiece?.type ?? inferPieceTypeFromId(chosenMove.pieceId),
    selectedBy,
    scoreGapTop2: Number(scoreGapTop2.toFixed(3)),
    samplingTopK,
    usedChaoticRerank,
    tacticalPoolCount: tacticalPool.length,
    tacticalFilterActive,
    tacticalRejectedCount,
    tacticalFallbackUsed,
    tacticalProfile: tacticalProfile.phase,
    tacticalScoreDrop: tacticalProfile.scoreDrop,
    tacticalDangerMargin: tacticalProfile.dangerMargin,
    tacticalCounterRiskCap: tacticalProfile.counterRiskCap,
    tacticalMinPool: tacticalProfile.minPool,
    chosenMove: {
      pieceId: chosenMove.pieceId,
      from: cloneCoord(chosenMove.from),
      to: cloneCoord(chosenMove.to),
      score: chosenScoredEntry ? Number((chosenScoredEntry.score ?? 0).toFixed(3)) : null,
      dangerPenalty: chosenScoredEntry ? Number((chosenScoredEntry.dangerPenalty ?? 0).toFixed(3)) : 0,
      breakdown: compactBreakdown(chosenScoredEntry?.breakdown),
    },
    deterministicBest: compactScoredEntry(deterministicBest),
    topCandidates: tacticalPool
      .slice(0, AI_TRACE_TOP_CANDIDATES)
      .map((entry) => compactScoredEntry(entry))
      .filter(Boolean),
    topPieces: pieceCandidates.slice(0, AI_TRACE_TOP_CANDIDATES).map((entry) => ({
      pieceId: entry.pieceId,
      pieceType: entry.pieceType,
      from: cloneCoord(entry.from),
      moveCount: entry.moves.length,
      bestScore: Number((entry.bestScore ?? 0).toFixed(3)),
    })),
    repetitionHints: {
      recentSamePieceCount,
      recentSameDestinationCount,
    },
    elapsedMs: Number((performance.now() - decisionStartedMs).toFixed(2)),
  });

  return chosenMove;
}

let matchState;
let occupancyMap;
let turnMachine;
let matchEndReplayTimerId = null;
const VICTORY_REPLAY_DELAY_MS = 10000;
const defaultAutoReplay = autoReplayToggle ? autoReplayToggle.checked : true;
let autoReplayEnabled = defaultAutoReplay;
let winnerCountdownEndAtMs = 0;
let gameCounter = 0;
let currentSeatOffset = 0;
let currentStartingCorners = null;
let lastMoveHudText = "";
const AI_RECENT_MOVE_LIMIT = 24;
let aiPieceMoveCounts = new Map();
let aiRecentMoves = [];

function hexToCssColor(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function hexToRgbaCss(hex, alpha = 1) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

function setActiveTurnTint(player) {
  const root = document.documentElement;
  if (!root) {
    return;
  }
  if (!player || !PLAYER_COLOR[player]) {
    root.style.setProperty("--turn-tint", "rgba(0, 0, 0, 0)");
    return;
  }
  root.style.setProperty("--turn-tint", hexToRgbaCss(PLAYER_COLOR[player], 0.05));
}

function getHighlightColor(baseHex, lift = 0.6) {
  const color = new THREE.Color(baseHex ?? 0xffffff);
  color.lerp(new THREE.Color(0xffffff), Math.max(0, Math.min(1, lift)));
  return color.getHex();
}

const KING_TAKEN_FLASH_MS = 1200;
let kingTakenFlashEndAtMs = 0;

function hideKingTakenFlash() {
  kingTakenFlashEndAtMs = 0;
  if (!eventFlashEl) {
    return;
  }
  eventFlashEl.classList.remove("is-active");
  eventFlashEl.hidden = true;
}

function showKingTakenFlash(player) {
  if (!eventFlashEl || !eventFlashTextEl) {
    return;
  }

  const playerHex = PLAYER_COLOR[player] ?? 0xffffff;
  const playerCss = hexToCssColor(playerHex);
  eventFlashEl.style.setProperty("--flash-color", playerCss);
  eventFlashTextEl.style.color = playerCss;
  eventFlashTextEl.textContent = player ? `${getPlayerDisplayName(player)} King taken!` : "King taken!";

  eventFlashEl.hidden = false;
  eventFlashEl.classList.remove("is-active");
  void eventFlashEl.offsetWidth;
  eventFlashEl.classList.add("is-active");
  kingTakenFlashEndAtMs = performance.now() + KING_TAKEN_FLASH_MS;
}

function tickKingTakenFlash(nowMs = performance.now()) {
  if (!eventFlashEl || eventFlashEl.hidden || kingTakenFlashEndAtMs <= 0) {
    return;
  }
  if (nowMs >= kingTakenFlashEndAtMs) {
    hideKingTakenFlash();
  }
}

function getKingTakenFlashRemainingMs(nowMs = performance.now()) {
  if (!eventFlashEl || eventFlashEl.hidden || kingTakenFlashEndAtMs <= 0) {
    return 0;
  }
  return Math.max(0, Math.ceil(kingTakenFlashEndAtMs - nowMs));
}

function clearWinnerReplayTimer() {
  if (matchEndReplayTimerId) {
    window.clearTimeout(matchEndReplayTimerId);
    matchEndReplayTimerId = null;
  }
}

function hideWinnerOverlay() {
  clearWinnerReplayTimer();
  winnerCountdownEndAtMs = 0;
  if (!winnerOverlayEl) {
    return;
  }
  winnerOverlayEl.hidden = true;
}

function showWinnerOverlay(winner) {
  if (!winnerOverlayEl || !winnerTextEl) {
    return;
  }
  const winnerColor = PLAYER_COLOR[winner] ?? 0xffffff;
  winnerTextEl.textContent = winner ? `${getPlayerDisplayName(winner)} Wins` : "No Winner";
  winnerTextEl.style.color = hexToCssColor(winnerColor);

  const timerVisible = autoReplayEnabled;
  winnerTimerFillEl?.parentElement?.classList.toggle("is-hidden", !timerVisible);
  winnerTimerLabelEl?.classList.toggle("is-hidden", !timerVisible);
  winnerOverlayEl.hidden = false;

  if (!autoReplayEnabled) {
    if (winnerTimerLabelEl) {
      winnerTimerLabelEl.textContent = "Auto replay is off";
    }
    if (winnerTimerFillEl) {
      winnerTimerFillEl.style.width = "100%";
    }
    return;
  }

  clearWinnerReplayTimer();
  winnerCountdownEndAtMs = performance.now() + VICTORY_REPLAY_DELAY_MS;
  matchEndReplayTimerId = window.setTimeout(() => {
    if (turnMachine?.phase === TurnPhase.MatchEnded) {
      resetMatch({ resume: true });
    }
  }, VICTORY_REPLAY_DELAY_MS);
}

function tickWinnerOverlayCountdown(nowMs = performance.now()) {
  if (!winnerOverlayEl || winnerOverlayEl.hidden || !autoReplayEnabled || winnerCountdownEndAtMs <= 0) {
    return;
  }
  const remainingMs = Math.max(0, winnerCountdownEndAtMs - nowMs);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = (remainingMs / VICTORY_REPLAY_DELAY_MS) * 100;
  if (winnerTimerLabelEl) {
    winnerTimerLabelEl.textContent = `Replay in ${remainingSec}s`;
  }
  if (winnerTimerFillEl) {
    winnerTimerFillEl.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
}

const pieceLayer = new THREE.Group();
boardGroup.add(pieceLayer);

const decisionLayer = new THREE.Group();
boardGroup.add(decisionLayer);

const pieceVisuals = new Map();

function clearPieceVisuals() {
  for (const visual of pieceVisuals.values()) {
    pieceLayer.remove(visual.root);
  }
  pieceVisuals.clear();
}

function rebuildPieceVisuals() {
  clearPieceVisuals();

  for (const piece of matchState.pieces) {
    if (!piece.alive) {
      continue;
    }
    const visual = makePieceVisual(piece);
    setPieceWorldPosition(visual, piece.coord);
    pieceLayer.add(visual.root);
    pieceVisuals.set(piece.id, visual);
  }
}

function resetMatch({ resume = true } = {}) {
  archiveCurrentGameTraces(turnMachine?.winner ?? null);
  gameCounter += 1;
  clearTurnTimer();
  clearDecisionOverlay();
  hideWinnerOverlay();
  hideKingTakenFlash();
  animations.length = 0;
  clearTrails();
  telemetry.turnDurationsMs = [];
  telemetry.roundDurationsMs = [];
  telemetry.timeoutCount = 0;
  telemetry.roundTurnCount = 0;
  telemetry.roundStartMs = performance.now();
  lastMoveHudText = "";
  aiPieceMoveCounts = new Map();
  aiRecentMoves = [];
  clearAIDecisionTraces();

  currentSeatOffset = (gameCounter - 1) % TURN_ORDER.length;
  const initial = initializeMatchState({ seatOffset: currentSeatOffset });
  matchState = initial.matchState;
  occupancyMap = initial.occupancyMap;
  currentStartingCorners = cloneStartingCorners(initial.startingCorners);
  turnMachine = new TurnStateMachine({
    matchState,
    occupancyMap,
    seatConfig: presetAllAI(),
    aiBudgetMs: AI_BUDGET_MS,
  });

  rebuildPieceVisuals();
  controls.target.set(0, 0, 0);

  if (resume) {
    paused = false;
    setPausedLabel(false);
    setStatus(`Viewer v${VERSION} reset. Autoplay active.`);
    updateTurnHud();
    updateMetricsHud();
    scheduleTurn(200);
  } else {
    setStatus(`Viewer v${VERSION} reset.`);
    updateTurnHud();
    updateMetricsHud();
  }
}

const centerGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.9, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0x9c9c9c, transparent: true, opacity: 0.13 })
);
scene.add(centerGlow);

const animations = [];
const trails = [];
const TRAIL_DURATION_MS = 460;
const TRAIL_MIN_MOVE_CELLS = 1;
const TRAIL_EMIT_STEP = 0.14;

const TRAIL_CORE_GEO = new THREE.SphereGeometry(0.24, 18, 18);
const TRAIL_CORE_KING_GEO = new THREE.SphereGeometry(0.28, 18, 18);
const TRAIL_CELL_GEO = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const TRAIL_GHOST_TMP = new THREE.Vector3();

function spawnTrailGhost(visual, position) {
  const color = visual.color;
  const isKing = visual.isKing === true;

  const cellBaseOpacity = 0.11;
  const coreBaseOpacity = isKing ? 0.2 : 0.17;
  const modelTrailBaseOpacity = isKing ? 0.16 : 0.14;

  const cellMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: cellBaseOpacity,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const cell = new THREE.Mesh(TRAIL_CELL_GEO, cellMaterial);
  const root = new THREE.Group();
  root.position.copy(position);
  root.add(cell);
  root.renderOrder = 10;

  let coreMaterial = null;
  let modelMaterials = [];

  if (visual.modelTemplate) {
    const trailModel = visual.modelTemplate.clone(true);
    modelMaterials = tintModelInstance(trailModel, color, modelTrailBaseOpacity, {
      blending: THREE.AdditiveBlending,
      emissiveScale: 0.72,
      emissiveIntensity: 1.05,
      renderOrder: 10,
    });
    root.add(trailModel);
  } else {
    const core = new THREE.Mesh(
      isKing ? TRAIL_CORE_KING_GEO : TRAIL_CORE_GEO,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: coreBaseOpacity,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    coreMaterial = core.material;
    root.add(core);
  }

  pieceLayer.add(root);
  trails.push({
    root,
    cellMaterial,
    coreMaterial,
    modelMaterials,
    startMs: performance.now(),
    durationMs: TRAIL_DURATION_MS,
    baseScale: 1,
    cellBaseOpacity,
    coreBaseOpacity,
    modelTrailBaseOpacity,
  });
}

function tickTrails() {
  const now = performance.now();
  for (let i = trails.length - 1; i >= 0; i -= 1) {
    const trail = trails[i];
    const t = Math.min(1, (now - trail.startMs) / trail.durationMs);
    const fade = Math.max(0, 1 - t);

    trail.cellMaterial.opacity = trail.cellBaseOpacity * fade;
    if (trail.coreMaterial) {
      trail.coreMaterial.opacity = trail.coreBaseOpacity * fade;
    }
    if (trail.modelMaterials?.length) {
      const modelOpacity = trail.modelTrailBaseOpacity * fade;
      for (const material of trail.modelMaterials) {
        material.opacity = modelOpacity;
      }
    }

    trail.root.scale.setScalar(trail.baseScale * (0.92 + fade * 0.08));

    if (t >= 1) {
      pieceLayer.remove(trail.root);
      trail.cellMaterial.dispose();
      if (trail.coreMaterial) {
        trail.coreMaterial.dispose();
      }
      if (trail.modelMaterials?.length) {
        for (const material of trail.modelMaterials) {
          material.dispose();
        }
      }
      trails.splice(i, 1);
    }
  }
}

function clearTrails() {
  for (const trail of trails) {
    pieceLayer.remove(trail.root);
    trail.cellMaterial.dispose();
    if (trail.coreMaterial) {
      trail.coreMaterial.dispose();
    }
    if (trail.modelMaterials?.length) {
      for (const material of trail.modelMaterials) {
        material.dispose();
      }
    }
  }
  trails.length = 0;
}

function pushMoveAnimation(pieceId, from, to, durationMs = 260) {
  const visual = pieceVisuals.get(pieceId);
  if (!visual) {
    return;
  }

  const fromWorld = boardToWorld(from.x, from.y, from.z);
  const toWorld = boardToWorld(to.x, to.y, to.z);

  const moveDistanceCells = Math.max(
    Math.abs(to.x - from.x),
    Math.abs(to.y - from.y),
    Math.abs(to.z - from.z)
  );

  animations.push({
    type: "move",
    visual,
    start: fromWorld,
    end: toWorld,
    startMs: performance.now(),
    durationMs,
    trailEnabled: moveDistanceCells >= TRAIL_MIN_MOVE_CELLS,
    lastTrailPoint: fromWorld.clone(),
  });

  if (moveDistanceCells >= TRAIL_MIN_MOVE_CELLS) {
    spawnTrailGhost(visual, fromWorld);
  }
}
function pushCaptureAnimation(pieceId, durationMs = 220, delayMs = 0) {
  const visual = pieceVisuals.get(pieceId);
  if (!visual) {
    return;
  }

  animations.push({
    type: "capture",
    visual,
    startMs: performance.now() + Math.max(0, delayMs),
    durationMs,
    done: false,
  });
}

function removeVisualAnimations(visual) {
  for (let i = animations.length - 1; i >= 0; i -= 1) {
    if (animations[i].visual === visual) {
      animations.splice(i, 1);
    }
  }
}

function pushEliminatedPlayerAnimations(player, primaryCapturedPieceId = null) {
  if (!player) {
    return;
  }

  const candidates = [];
  for (const [pieceId, visual] of pieceVisuals.entries()) {
    const piece = matchState?.pieces?.find((entry) => entry.id === pieceId);
    if (!piece || piece.owner !== player) {
      continue;
    }
    candidates.push({ pieceId, visual, dist: visual.root.position.length() });
  }

  candidates.sort((a, b) => a.dist - b.dist);
  let order = 0;

  if (primaryCapturedPieceId) {
    const primary = candidates.find((entry) => entry.pieceId === primaryCapturedPieceId);
    if (primary) {
      removeVisualAnimations(primary.visual);
      pushCaptureAnimation(primary.pieceId, 280, 0);
      order = 1;
    }
  }

  for (const entry of candidates) {
    if (entry.pieceId === primaryCapturedPieceId) {
      continue;
    }
    removeVisualAnimations(entry.visual);
    pushCaptureAnimation(entry.pieceId, 320, order * 45);
    order += 1;
  }
}

function tickAnimations() {
  const now = performance.now();

  for (let i = animations.length - 1; i >= 0; i -= 1) {
    const anim = animations[i];
    if (now < anim.startMs) {
      continue;
    }

    const t = Math.min(1, (now - anim.startMs) / anim.durationMs);

    if (anim.type === "move") {
      anim.visual.root.position.lerpVectors(anim.start, anim.end, t);

      if (anim.trailEnabled) {
        const current = anim.visual.root.position;
        const travel = current.distanceTo(anim.lastTrailPoint);
        if (travel >= TRAIL_EMIT_STEP) {
          const steps = Math.max(1, Math.floor(travel / TRAIL_EMIT_STEP));
          for (let step = 1; step <= steps; step += 1) {
            const alpha = step / steps;
            TRAIL_GHOST_TMP.lerpVectors(anim.lastTrailPoint, current, alpha);
            spawnTrailGhost(anim.visual, TRAIL_GHOST_TMP);
          }
          anim.lastTrailPoint.copy(current);
        }
      }

      if (t >= 1) {
        if (anim.trailEnabled) {
          spawnTrailGhost(anim.visual, anim.end);
        }
        animations.splice(i, 1);
      }
      continue;
    }

    if (anim.type === "capture") {
      const scale = 1 - t;
      anim.visual.root.scale.setScalar(Math.max(0.01, scale));
      anim.visual.cellMaterial.opacity = Math.max(0, CELL_HIGHLIGHT_OPACITY - t * CELL_HIGHLIGHT_OPACITY);
      const coreCaptureOpacity = Math.max(0, (anim.visual.coreBaseOpacity ?? 1) - t * (anim.visual.coreBaseOpacity ?? 1));
      if (anim.visual.modelMaterials?.length) {
        for (const material of anim.visual.modelMaterials) {
          material.opacity = coreCaptureOpacity;
        }
      } else if (anim.visual.coreMaterial) {
        anim.visual.coreMaterial.opacity = coreCaptureOpacity;
      }
      if (anim.visual.glowMaterials?.length) {
        const glowCaptureOpacity = Math.max(0, (anim.visual.glowBaseOpacity ?? 0) - t * (anim.visual.glowBaseOpacity ?? 0));
        for (const material of anim.visual.glowMaterials) {
          material.opacity = glowCaptureOpacity;
        }
      }

      if (t >= 1) {
        if (!anim.done) {
          pieceLayer.remove(anim.visual.root);
          pieceVisuals.forEach((candidate, id) => {
            if (candidate === anim.visual) {
              pieceVisuals.delete(id);
            }
          });
          anim.done = true;
        }
        animations.splice(i, 1);
      }
    }
  }
}

let paused = false;
let speedMultiplier = Number(speedSelect?.value ?? "1");
let turnTimerId = null;
let turnInFlight = false;

function delayWithSignal(ms, signal) {
  return new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve();
    }, ms);

    function onAbort() {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    }

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function buildCyclePathIndices(count, startIndex, targetIndex) {
  if (count <= 0) {
    return [];
  }
  const normalizedStart = Math.max(0, Math.min(count - 1, startIndex));
  const normalizedTarget = Math.max(0, Math.min(count - 1, targetIndex));
  const indices = [normalizedStart];
  let cursor = normalizedStart;
  while (cursor !== normalizedTarget) {
    cursor = (cursor + 1) % count;
    indices.push(cursor);
    if (indices.length > count + 1) {
      break;
    }
  }
  return indices;
}

function limitPreviewOrder(order, maxSteps) {
  if (!Array.isArray(order) || order.length <= 1) {
    return Array.isArray(order) ? [...order] : [];
  }

  const clamped = Math.max(2, Math.min(order.length, Math.floor(maxSteps)));
  if (clamped >= order.length) {
    return [...order];
  }

  const result = [order[0]];
  const interior = order.length - 2;
  const interiorTake = Math.max(0, clamped - 2);
  for (let i = 1; i <= interiorTake; i += 1) {
    const sample = Math.round((i / (interiorTake + 1)) * interior);
    const index = Math.max(1, Math.min(order.length - 2, sample));
    result.push(order[index]);
  }
  result.push(order[order.length - 1]);

  const deduped = [];
  for (const index of result) {
    if (!deduped.includes(index)) {
      deduped.push(index);
    }
  }
  return deduped;
}

function getPiecePreviewPlan(pieceCount) {
  const clampedSpeed = Math.max(0.25, speedMultiplier);
  const count = Math.max(1, pieceCount);
  let baseDwellMs;
  let cycleRatio;
  let maxVisible;

  if (clampedSpeed <= 0.5) {
    baseDwellMs = 420;
    cycleRatio = 1;
    maxVisible = 20;
  } else if (clampedSpeed <= 1) {
    baseDwellMs = 250;
    cycleRatio = 0.9;
    maxVisible = 14;
  } else if (clampedSpeed <= 2) {
    baseDwellMs = 150;
    cycleRatio = 0.72;
    maxVisible = 10;
  } else if (clampedSpeed <= 4) {
    baseDwellMs = 100;
    cycleRatio = 0.55;
    maxVisible = 8;
  } else if (clampedSpeed <= 8) {
    baseDwellMs = 68;
    cycleRatio = 0.42;
    maxVisible = 6;
  } else {
    baseDwellMs = 50;
    cycleRatio = 0.3;
    maxVisible = 5;
  }

  const cappedByBudget = Math.max(50, Math.floor(2400 / count));
  const cycleSteps = Math.max(2, Math.ceil(count * cycleRatio));
  return {
    dwellMs: Math.min(baseDwellMs, cappedByBudget),
    cycleSteps,
    maxVisible: Math.max(2, Math.min(count, maxVisible)),
  };
}

async function previewPieceSelectionCycle(pieceCandidates, targetIndex, signal) {
  if (!Array.isArray(pieceCandidates) || pieceCandidates.length === 0) {
    clearDecisionOverlay();
    return;
  }

  const plan = getPiecePreviewPlan(pieceCandidates.length);
  const orderFull = buildCyclePathIndices(pieceCandidates.length, 0, targetIndex);
  const order = limitPreviewOrder(orderFull, plan.cycleSteps);

  for (const index of order) {
    if (signal?.aborted) {
      break;
    }
    showPieceSelectionOverlay(pieceCandidates, {
      focusIndex: index,
      solo: false,
      bestOpacity: 0.62,
      otherOpacity: 0.22,
      maxVisible: plan.maxVisible,
    });
    await delayWithSignal(plan.dwellMs, signal);
  }
}

async function confirmPieceSelection(pieceCandidates, chosenIndex, signal) {
  if (!Array.isArray(pieceCandidates) || pieceCandidates.length === 0) {
    return;
  }
  const clampedIndex = Math.min(pieceCandidates.length - 1, Math.max(0, chosenIndex));
  for (let pulse = 0; pulse < 2; pulse += 1) {
    if (signal?.aborted) {
      break;
    }
    showPieceSelectionOverlay(pieceCandidates, {
      focusIndex: clampedIndex,
      solo: true,
      bestOpacity: 0.74,
      otherOpacity: 0.2,
    });
    await delayWithSignal(90, signal);
    clearDecisionOverlay();
    await delayWithSignal(60, signal);
  }
}

function getDecisionPreviewPlan(candidateCount) {
  const clampedSpeed = Math.max(0.25, speedMultiplier);
  const count = Math.min(DECISION_MAX_CANDIDATES, Math.max(1, candidateCount));
  let baseDwellMs;
  let cycleRatio;
  let maxVisible;

  if (clampedSpeed <= 0.5) {
    baseDwellMs = 560;
    cycleRatio = 1;
    maxVisible = 92;
  } else if (clampedSpeed <= 1) {
    baseDwellMs = 340;
    cycleRatio = 0.85;
    maxVisible = 64;
  } else if (clampedSpeed <= 2) {
    baseDwellMs = 210;
    cycleRatio = 0.65;
    maxVisible = 44;
  } else if (clampedSpeed <= 4) {
    baseDwellMs = 130;
    cycleRatio = 0.46;
    maxVisible = 28;
  } else if (clampedSpeed <= 8) {
    baseDwellMs = 90;
    cycleRatio = 0.32;
    maxVisible = 18;
  } else if (clampedSpeed <= 16) {
    baseDwellMs = 68;
    cycleRatio = 0.24;
    maxVisible = 14;
  } else {
    baseDwellMs = 52;
    cycleRatio = 0.18;
    maxVisible = 10;
  }

  const cappedByBudget = Math.max(60, Math.floor(5600 / count));
  const cycleSteps = Math.max(2, Math.ceil(count * cycleRatio));
  return {
    dwellMs: Math.min(baseDwellMs, cappedByBudget),
    cycleSteps,
    maxVisible: Math.max(2, Math.min(count, maxVisible)),
  };
}

function getMoveDirection(move) {
  const dx = move.to.x - move.from.x;
  const dy = move.to.y - move.from.y;
  const dz = move.to.z - move.from.z;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const stepZ = Math.sign(dz);
  const depth = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  const branchKey = (stepX + 1) * 9 + (stepY + 1) * 3 + (stepZ + 1);
  return { dx, dy, dz, stepX, stepY, stepZ, depth, branchKey };
}

function sortMovesByBranchDepth(scoredMoves, pieceType) {
  const isSliding = pieceType === PIECE_TYPES.Bishop || pieceType === PIECE_TYPES.Rook || pieceType === PIECE_TYPES.Queen;
  return [...scoredMoves].sort((a, b) => {
    const ma = a.move;
    const mb = b.move;
    if (isSliding) {
      const da = getMoveDirection(ma);
      const db = getMoveDirection(mb);
      if (da.branchKey !== db.branchKey) {
        return da.branchKey - db.branchKey;
      }
      if (da.depth !== db.depth) {
        return da.depth - db.depth;
      }
    }
    if (ma.to.x !== mb.to.x) return ma.to.x - mb.to.x;
    if (ma.to.y !== mb.to.y) return ma.to.y - mb.to.y;
    if (ma.to.z !== mb.to.z) return ma.to.z - mb.to.z;
    return ma.pieceId.localeCompare(mb.pieceId);
  });
}

function getEntryByBranchDepth(entries, branchKey, depth) {
  return entries.find((entry) => {
    const d = getMoveDirection(entry.move);
    return d.branchKey === branchKey && d.depth === depth;
  }) ?? null;
}

function getBranchDepthMeta(entries) {
  const byBranch = new Map();
  for (const entry of entries) {
    const d = getMoveDirection(entry.move);
    let bucket = byBranch.get(d.branchKey);
    if (!bucket) {
      bucket = [];
      byBranch.set(d.branchKey, bucket);
    }
    if (!bucket.includes(d.depth)) {
      bucket.push(d.depth);
    }
  }
  for (const depths of byBranch.values()) {
    depths.sort((a, b) => a - b);
  }
  const branches = [...byBranch.keys()].sort((a, b) => a - b);
  return { byBranch, branches };
}

function nearestDepthInBranch(depths, desiredDepth) {
  if (!Array.isArray(depths) || depths.length === 0) {
    return desiredDepth;
  }
  let best = depths[0];
  let bestDist = Math.abs(best - desiredDepth);
  for (let i = 1; i < depths.length; i += 1) {
    const d = depths[i];
    const dist = Math.abs(d - desiredDepth);
    if (dist < bestDist || (dist === bestDist && d < best)) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

function buildSlidingPreviewPath(entries, startEntry, targetEntry) {
  const { byBranch, branches } = getBranchDepthMeta(entries);
  if (branches.length === 0) {
    return entries;
  }

  const startDir = getMoveDirection(startEntry.move);
  const targetDir = getMoveDirection(targetEntry.move);

  const buildPath = (mode) => {
    const sequence = [];
    const seen = new Set();
    const append = (entry) => {
      if (!entry || seen.has(entry)) return;
      seen.add(entry);
      sequence.push(entry);
    };

    let currentBranch = startDir.branchKey;
    let currentDepth = startDir.depth;
    append(startEntry);

    const adjustDepth = (branch, desiredDepth) => {
      const depths = byBranch.get(branch) ?? [];
      if (depths.length === 0) return;
      while (currentDepth !== desiredDepth) {
        const direction = desiredDepth > currentDepth ? 1 : -1;
        const next = direction > 0
          ? depths.find((d) => d > currentDepth)
          : [...depths].reverse().find((d) => d < currentDepth);
        if (next === undefined) break;
        const entry = getEntryByBranchDepth(entries, branch, next);
        if (!entry) break;
        currentDepth = next;
        append(entry);
      }
    };

    const switchBranch = (targetBranch) => {
      if (currentBranch === targetBranch) return;
      const depths = byBranch.get(targetBranch) ?? [];
      if (depths.length === 0) return;
      let nextDepth = currentDepth;
      if (!depths.includes(nextDepth)) {
        nextDepth = nearestDepthInBranch(depths, currentDepth);
      }
      const entry = getEntryByBranchDepth(entries, targetBranch, nextDepth);
      if (entry) {
        currentBranch = targetBranch;
        currentDepth = nextDepth;
        append(entry);
      }
    };

    if (mode === "branch-first") {
      switchBranch(targetDir.branchKey);
      adjustDepth(targetDir.branchKey, targetDir.depth);
    } else {
      adjustDepth(currentBranch, targetDir.depth);
      switchBranch(targetDir.branchKey);
    }

    append(targetEntry);
    return sequence;
  };

  const branchFirst = buildPath("branch-first");
  const depthFirst = buildPath("depth-first");
  return depthFirst.length < branchFirst.length ? depthFirst : branchFirst;
}

function chooseBestScoredMove(scoredMoves) {
  return [...scoredMoves].sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    if (a.move.to.x !== b.move.to.x) return a.move.to.x - b.move.to.x;
    if (a.move.to.y !== b.move.to.y) return a.move.to.y - b.move.to.y;
    return a.move.to.z - b.move.to.z;
  })[0];
}

async function previewDecisionCycle(candidates, targetIndex, signal, focusOrder = null) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    clearDecisionOverlay();
    return;
  }

  const plan = getDecisionPreviewPlan(candidates.length);
  const orderBase = Array.isArray(focusOrder) && focusOrder.length > 0
    ? focusOrder
    : buildCyclePathIndices(candidates.length, 0, targetIndex);
  const order = limitPreviewOrder(orderBase, plan.cycleSteps);

  for (const index of order) {
    if (signal?.aborted) {
      break;
    }
    showDecisionOverlay(candidates, {
      focusIndex: index,
      solo: false,
      showPath: true,
      bestOpacity: 0.62,
      otherOpacity: 0.2,
      maxVisible: plan.maxVisible,
    });
    await delayWithSignal(plan.dwellMs, signal);
  }
}

async function confirmDecision(candidates, chosenIndex, signal) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return;
  }
  const clampedIndex = Math.min(candidates.length - 1, Math.max(0, chosenIndex));

  for (let pulse = 0; pulse < 2; pulse += 1) {
    if (signal?.aborted) {
      break;
    }
    showDecisionOverlay(candidates, {
      focusIndex: clampedIndex,
      solo: true,
      showPath: true,
      bestOpacity: 0.72,
      otherOpacity: 0.16,
    });
    await delayWithSignal(90, signal);
    clearDecisionOverlay();
    await delayWithSignal(60, signal);
  }
}

function estimateAIBudgetMs(legalMoveCount) {
  const moveCount = Math.min(AI_CANDIDATE_POOL_LIMIT, Math.max(1, legalMoveCount));
  const pieceCountGuess = Math.max(1, Math.min(8, Math.round(Math.sqrt(moveCount * 1.5))));

  // Keep AI timeout budget independent from playback speed so faster/slower playback does not change outcomes.
  const pieceDwellMs = Math.min(250, Math.max(50, Math.floor(2400 / pieceCountGuess)));
  const moveDwellMs = Math.min(340, Math.max(60, Math.floor(5600 / moveCount)));
  const previewMs = pieceCountGuess * pieceDwellMs + moveCount * moveDwellMs + 800;
  return Math.min(AI_BUDGET_MAX_MS, Math.max(AI_BUDGET_MS, previewMs));
}

function getTurnDelayMs() {
  const baseDelayMs = 120;
  if (speedMultiplier >= 1) {
    return Math.max(10, Math.round(baseDelayMs / speedMultiplier));
  }
  return baseDelayMs;
}


const TURN_ANIMATION_GUARD_MS = 24;

function getActiveAnimationCooldownMs(nowMs = performance.now()) {
  let maxRemainingMs = 0;
  for (const anim of animations) {
    if (!anim || (anim.type !== "move" && anim.type !== "capture")) {
      continue;
    }
    const startMs = anim.startMs ?? nowMs;
    const durationMs = anim.durationMs ?? 0;
    const remainingMs = (startMs + durationMs) - nowMs;
    if (remainingMs > maxRemainingMs) {
      maxRemainingMs = remainingMs;
    }
  }
  return Math.max(0, Math.ceil(maxRemainingMs + TURN_ANIMATION_GUARD_MS));
}
function inferPieceTypeFromId(pieceId) {
  const parts = String(pieceId ?? "").split("-");
  return parts.length >= 2 ? parts[1] : "Piece";
}

function formatMoveHudText(move) {
  if (!move) {
    return "";
  }
  const piece = matchState?.pieces?.find((candidate) => candidate.id === move.pieceId);
  const pieceType = piece?.type ?? inferPieceTypeFromId(move.pieceId);
  const target = move.to ?? { x: "?", y: "?", z: "?" };
  return `${pieceType} -> (${target.x},${target.y},${target.z})`;
}
function updateTurnHud() {
  if (turnMachine.phase === TurnPhase.MatchEnded) {
    setActiveTurnTint(null);
    setCurrentTurnLabel(`Game ${gameCounter} • Winner: ${turnMachine.winner ? getPlayerDisplayName(turnMachine.winner) : "None"}`);
    setTurnLabel(lastMoveHudText ? `Last: ${lastMoveHudText}` : "Last: -");
    return;
  }

  setActiveTurnTint(matchState.activePlayer);
  setCurrentTurnLabel(`Game ${gameCounter} • Turn ${matchState.turnCount + 1} • ${getPlayerDisplayName(matchState.activePlayer)}`);
  setTurnLabel(lastMoveHudText ? `Last: ${lastMoveHudText}` : "Last: -");
}

function maybeFollowMove(move) {
  if (!followToggle?.checked || !move?.pieceId) {
    return;
  }
  setFollowPiece(move.pieceId);
}

function recenterCameraTarget() {
  controls.target.set(0, 0, 0);
  markCameraInteraction();
}

function recordAIMoveBehavior(result) {
  const move = result?.move;
  if (!move?.pieceId) {
    return;
  }

  aiPieceMoveCounts.set(move.pieceId, (aiPieceMoveCounts.get(move.pieceId) ?? 0) + 1);
  aiRecentMoves.push({
    player: result.player ?? null,
    pieceId: move.pieceId,
    from: move.from,
    to: move.to,
  });

  if (aiRecentMoves.length > AI_RECENT_MOVE_LIMIT) {
    aiRecentMoves.splice(0, aiRecentMoves.length - AI_RECENT_MOVE_LIMIT);
  }
}
function handleTurnResult(result) {
  clearDecisionOverlay();
  if (result?.move) {
    lastMoveHudText = formatMoveHudText(result.move);
    recordAIMoveBehavior(result);
    pushMoveAnimation(result.move.pieceId, result.move.from, result.move.to);

    if (result.eliminatedPlayer) {
      pushEliminatedPlayerAnimations(result.eliminatedPlayer, result.move.capturedPieceId ?? null);
      showKingTakenFlash(result.eliminatedPlayer);
    } else if (result.move.capturedPieceId) {
      pushCaptureAnimation(result.move.capturedPieceId);
    }

    maybeFollowMove(result.move);
  }

  if (result?.type === "MatchEnded") {
    const winner = result.winner ?? turnMachine.winner;
    archiveCurrentGameTraces(winner);
    setStatus(`Match ended. Winner: ${winner ?? "None"}`);
    showWinnerOverlay(winner);
    updateTurnHud();
    updateMetricsHud();
    return;
  }

  if (result?.type === "TurnPassed") {
    setStatus(`${getPlayerDisplayName(result.player)} had no legal moves and passed.`);
  } else if (result?.timedOut) {
    setStatus(`${getPlayerDisplayName(result.player)} hit AI timeout fallback.`);
  } else if (result?.move) {
    const captureNote = result.move.isCapture ? " capture" : " move";
    setStatus(`${getPlayerDisplayName(result.player)}${captureNote}: ${result.move.pieceId}`);
  }

  updateTurnHud();
}

function clearTurnTimer() {
  if (turnTimerId) {
    window.clearTimeout(turnTimerId);
    turnTimerId = null;
  }
}

function scheduleTurn(delayMs = getTurnDelayMs()) {
  clearTurnTimer();

  if (paused || turnMachine.phase === TurnPhase.MatchEnded) {
    return;
  }

  turnTimerId = window.setTimeout(() => {
    runOneTurn();
  }, delayMs);
}

async function runOneTurn() {
  if (paused || turnInFlight || turnMachine.phase === TurnPhase.MatchEnded) {
    return;
  }

  turnInFlight = true;
  try {
    const begin = turnMachine.beginTurn();

    if (begin.type === "MatchEnded") {
      handleTurnResult(begin);
      return;
    }

    if (begin.type === TurnPhase.AwaitingAIMove) {
      const turnStartMs = performance.now();
      const result = await turnMachine.resolveAITurn({
        requestMove: chooseHeuristicAIMove,
        budgetMs: estimateAIBudgetMs(begin.legalMoves?.length ?? 1),
      });
      recordTurnTelemetry(performance.now() - turnStartMs, result?.timedOut === true);
      handleTurnResult(result);
      return;
    }

    if (begin.type === TurnPhase.AwaitingHumanMove) {
      setStatus(`Waiting for human move: ${getPlayerDisplayName(begin.player)}`);
      return;
    }

    handleTurnResult(begin);
  } catch (error) {
    console.error(error);
    setStatus(`Turn error: ${error.message}`);
  } finally {
    turnInFlight = false;
    if (!paused && turnMachine.phase !== TurnPhase.MatchEnded) {
      const cooldownMs = getActiveAnimationCooldownMs();
      const flashRemainingMs = getKingTakenFlashRemainingMs();
      const baseDelayMs = flashRemainingMs > 0 ? 0 : getTurnDelayMs();
      scheduleTurn(Math.max(baseDelayMs, cooldownMs, flashRemainingMs));
    }
  }
}

pauseBtn?.addEventListener("click", () => {
  paused = !paused;
  setPausedLabel(paused);

  if (paused) {
    clearTurnTimer();
  } else if (!turnInFlight) {
    scheduleTurn(20);
  }
});

stepBtn?.addEventListener("click", () => {
  if (!paused) {
    paused = true;
    setPausedLabel(true);
  }
  clearTurnTimer();
  runOneTurn();
});

speedSelect?.addEventListener("change", () => {
  speedMultiplier = Number(speedSelect.value);
  if (!Number.isFinite(speedMultiplier) || speedMultiplier <= 0) {
    speedMultiplier = 1;
    speedSelect.value = "1";
  }

  if (!paused && !turnInFlight) {
    scheduleTurn(40);
  }
});

varietySelect?.addEventListener("change", () => {
  varietyMode = varietySelect.value === VarietyMode.Deterministic
    ? VarietyMode.Deterministic
    : VarietyMode.Chaotic;

  if (varietyMode === VarietyMode.Chaotic) {
    reseedVariety();
  }

  updateMetricsHud();
});

resetBtn?.addEventListener("click", () => {
  resetMatch({ resume: true });
});

exportTraceBtn?.addEventListener("click", () => {
  exportAIDecisionTraces();
});
function snapPendingAnimations() {
  for (let i = animations.length - 1; i >= 0; i -= 1) {
    const anim = animations[i];
    if (anim.type === "move") {
      anim.visual.root.position.copy(anim.end);
      animations.splice(i, 1);
    }
  }
}

function applyHudCollapsed(collapsed) {
  if (!hudEl || !hudToggleBtn) {
    return;
  }
  if (collapsed) {
    snapPendingAnimations();
  }
  hudEl.classList.toggle("is-collapsed", collapsed);
  hudToggleBtn.textContent = collapsed ? "Expand" : "Hide";
  hudToggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

hudToggleBtn?.addEventListener("click", () => {
  if (!hudEl) {
    return;
  }
  applyHudCollapsed(!hudEl.classList.contains("is-collapsed"));
});

autoReplayToggle?.addEventListener("change", () => {
  autoReplayEnabled = autoReplayToggle.checked;
  if (turnMachine?.phase === TurnPhase.MatchEnded) {
    showWinnerOverlay(turnMachine.winner ?? null);
  }
});

experimentalLightToggle?.addEventListener("change", () => {
  experimentalPieceLightEnabled = experimentalLightToggle.checked;
  if (!experimentalPieceLightEnabled) {
    experimentalPieceLight.intensity = 0;
  }
  rebuildPieceVisuals();
});

experimentalBranchDepthToggle?.addEventListener("change", () => {
  experimentalBranchDepthEnabled = experimentalBranchDepthToggle.checked;
});

function animate(time) {
  const t = time * 0.001;
  centerGlow.scale.setScalar(1 + Math.sin(t * 1.7) * 0.08);

  tickAnimations();
  applyIdleBobbing(time);
  applyPieceDistanceFade();
  tickTrails();
  tickWinnerOverlayCountdown();
  tickKingTakenFlash();
  updateFollowActivePiece();
  updateExperimentalPieceLight();
  updateIdleAutoRotate(time);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onResize);

if (followToggle) {
  followToggle.checked = false;
  followToggle.addEventListener("change", () => {
    if (!followToggle.checked) {
      setFollowPiece(null);
      recenterCameraTarget();
    }
  });
}

if (varietySelect) {
  varietySelect.value = varietyMode;
}

window.CubeChessDebug = {
  ...(window.CubeChessDebug ?? {}),
  exportAIDecisionTraces,
  getAIDecisionTraces: () => aiDecisionTraces.map((entry) => ({ ...entry })),
};

updateMetricsHud();
applyHudCollapsed(window.innerWidth < 900);
recenterCameraTarget();
primePieceModels();
resetMatch({ resume: true });
requestAnimationFrame(animate);


































































