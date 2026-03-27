import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/OrbitControls.js";

import { initializeMatchState } from "../../Runtime/Core/GameState/initializeMatchState.js";
import { TURN_ORDER, PIECE_TYPES } from "../../Runtime/Core/GameState/constants.js";
import { TurnPhase, TurnStateMachine } from "../../Runtime/Core/Turn/index.js";
import { presetAllAI } from "../../Runtime/Core/Seats/index.js";

const VERSION = "0.1.11";
const BOARD_SIZE = 8;
const AI_BUDGET_MS = 400;

const statusEl = document.getElementById("status");
const turnEl = document.getElementById("turn");
const pausedEl = document.getElementById("paused");
const pauseBtn = document.getElementById("pauseBtn");
const stepBtn = document.getElementById("stepBtn");
const speedSelect = document.getElementById("speedSelect");
const followToggle = document.getElementById("followToggle");
const resetBtn = document.getElementById("resetBtn");
const metricsEl = document.getElementById("metrics");
const varietySelect = document.getElementById("varietySelect");

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
scene.fog = new THREE.Fog(0x08131d, 18, 42);

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

const ambient = new THREE.AmbientLight(0xa8d4ff, 0.55);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xc0e2ff, 0.8);
keyLight.position.set(14, 18, 10);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x5599ff, 0.7, 80);
fillLight.position.set(-10, 6, -8);
scene.add(fillLight);

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
    color: 0x6dc2ff,
    transparent: true,
    opacity: 0.04,
    transmission: 0.46,
    roughness: 0.2,
    metalness: 0.05,
  });
  const shell = new THREE.Mesh(shellGeo, shellMat);

  const edges = new THREE.EdgesGeometry(shellGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.55 });
  const edgeLines = new THREE.LineSegments(edges, edgeMat);
  shell.add(edgeLines);

  return shell;
}

function createGridLines() {
  const lineMat = new THREE.LineBasicMaterial({ color: 0x78b8e2, transparent: true, opacity: 0.11 });
  const points = [];
  const min = -boardExtent / 2;
  const max = boardExtent / 2;

  for (let yi = 0; yi <= BOARD_SIZE; yi += 1) {
    const y = min + yi;
    for (let zi = 0; zi <= BOARD_SIZE; zi += 1) {
      const z = min + zi;
      points.push(new THREE.Vector3(min, y, z), new THREE.Vector3(max, y, z));
    }
  }

  for (let xi = 0; xi <= BOARD_SIZE; xi += 1) {
    const x = min + xi;
    for (let zi = 0; zi <= BOARD_SIZE; zi += 1) {
      const z = min + zi;
      points.push(new THREE.Vector3(x, min, z), new THREE.Vector3(x, max, z));
    }
  }

  for (let xi = 0; xi <= BOARD_SIZE; xi += 1) {
    const x = min + xi;
    for (let yi = 0; yi <= BOARD_SIZE; yi += 1) {
      const y = min + yi;
      points.push(new THREE.Vector3(x, y, min), new THREE.Vector3(x, y, max));
    }
  }

  const geo = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineSegments(geo, lineMat);
}

boardGroup.add(createCubeShell());
boardGroup.add(createGridLines());

const PLAYER_COLOR = Object.freeze({
  Yellow: 0xffce3a,
  Red: 0xff5858,
  Purple: 0xb578ff,
  Blue: 0x48a7ff,
});

const VarietyMode = Object.freeze({
  Deterministic: "deterministic",
  Chaotic: "chaotic",
});

let varietyMode = varietySelect?.value ?? VarietyMode.Chaotic;
let varietySeed = 1;

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
const AI_WEIGHTS = Object.freeze({
  capture: 1.0,
  center: 0.02,
  mobility: 0.05,
});

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
const PIECE_VALUE = Object.freeze({
  [PIECE_TYPES.King]: 9999,
  [PIECE_TYPES.Queen]: 9,
  [PIECE_TYPES.Rook]: 5,
  [PIECE_TYPES.Bishop]: 3,
  [PIECE_TYPES.Knight]: 3,
});

function makePieceVisual(piece) {
  const color = PLAYER_COLOR[piece.owner] ?? 0xffffff;
  const isKing = piece.type === PIECE_TYPES.King;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(isKing ? 0.3 : 0.25, 24, 24),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isKing ? 1.08 : 0.9,
      roughness: 0.18,
      metalness: 0.06,
      transparent: true,
      opacity: 0.97,
      depthTest: true,
    })
  );

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(isKing ? 0.44 : 0.36, 22, 22),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isKing ? 0.24 : 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  );

  const outerHalo = new THREE.Mesh(
    new THREE.SphereGeometry(isKing ? 0.58 : 0.48, 20, 20),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isKing ? 0.13 : 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  );

  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(isKing ? 0.13 : 0.1, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      depthTest: false,
    })
  );

  const root = new THREE.Group();
  root.add(core);
  root.add(halo);
  root.add(outerHalo);
  root.add(spark);
  spark.position.set(0.07, 0.07, 0.07);

  return {
    root,
    coreMaterial: core.material,
    haloMaterial: halo.material,
    outerHaloMaterial: outerHalo.material,
    sparkMaterial: spark.material,
  };
}

function setPieceWorldPosition(pieceVisual, coord) {
  pieceVisual.root.position.copy(boardToWorld(coord.x, coord.y, coord.z));
}

function scoreMove(move, context) {
  const { matchState, legalMoves } = context;
  let score = 0;

  if (move.capturedPieceId) {
    const captured = matchState.pieces.find((piece) => piece.id === move.capturedPieceId);
    if (captured) {
      score += (PIECE_VALUE[captured.type] ?? 1) * AI_WEIGHTS.capture;
    }
  }

  const centerDistance = Math.abs(move.to.x - 3.5) + Math.abs(move.to.y - 3.5) + Math.abs(move.to.z - 3.5);
  score += (10.5 - centerDistance) * AI_WEIGHTS.center;

  const ownPieceOptions = legalMoves.filter((candidate) => candidate.pieceId === move.pieceId).length;
  score += ownPieceOptions * AI_WEIGHTS.mobility;

  return score;
}

async function chooseHeuristicAIMove({ legalMoves, signal, ...context }) {
  const scored = [];

  for (const move of legalMoves) {
    if (signal?.aborted) {
      break;
    }

    const score = scoreMove(move, { ...context, legalMoves });
    scored.push({ move, score });
  }

  if (scored.length === 0) {
    return legalMoves[0] ?? null;
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
  return scored[0].move;
}

let matchState;
let occupancyMap;
let turnMachine;

const pieceLayer = new THREE.Group();
boardGroup.add(pieceLayer);

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
  clearTurnTimer();
  animations.length = 0;
  telemetry.turnDurationsMs = [];
  telemetry.roundDurationsMs = [];
  telemetry.timeoutCount = 0;
  telemetry.roundTurnCount = 0;
  telemetry.roundStartMs = performance.now();

  const initial = initializeMatchState();
  matchState = initial.matchState;
  occupancyMap = initial.occupancyMap;
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
  new THREE.MeshBasicMaterial({ color: 0x58b8ff, transparent: true, opacity: 0.13 })
);
scene.add(centerGlow);

const animations = [];
function pushMoveAnimation(pieceId, from, to, durationMs = 260) {
  const visual = pieceVisuals.get(pieceId);
  if (!visual) {
    return;
  }

  animations.push({
    type: "move",
    visual,
    start: boardToWorld(from.x, from.y, from.z),
    end: boardToWorld(to.x, to.y, to.z),
    startMs: performance.now(),
    durationMs,
  });
}

function pushCaptureAnimation(pieceId, durationMs = 220) {
  const visual = pieceVisuals.get(pieceId);
  if (!visual) {
    return;
  }

  animations.push({
    type: "capture",
    visual,
    startMs: performance.now(),
    durationMs,
    done: false,
  });
}

function tickAnimations() {
  const now = performance.now();

  for (let i = animations.length - 1; i >= 0; i -= 1) {
    const anim = animations[i];
    const t = Math.min(1, (now - anim.startMs) / anim.durationMs);

    if (anim.type === "move") {
      anim.visual.root.position.lerpVectors(anim.start, anim.end, t);
      if (t >= 1) {
        animations.splice(i, 1);
      }
      continue;
    }

    if (anim.type === "capture") {
      const scale = 1 - t;
      anim.visual.root.scale.setScalar(Math.max(0.01, scale));
      anim.visual.coreMaterial.opacity = Math.max(0, 1 - t);
      anim.visual.haloMaterial.opacity = Math.max(0, 0.22 - t * 0.22);
      anim.visual.outerHaloMaterial.opacity = Math.max(0, 0.11 - t * 0.11);
      anim.visual.sparkMaterial.opacity = Math.max(0, 0.84 - t * 0.84);

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

function getTurnDelayMs() {
  const baseDelayMs = 540;
  return Math.max(80, Math.round(baseDelayMs / Math.max(0.25, speedMultiplier)));
}

function updateTurnHud() {
  if (turnMachine.phase === TurnPhase.MatchEnded) {
    setTurnLabel(`Winner: ${turnMachine.winner ?? "None"}`);
    return;
  }

  setTurnLabel(`Turn ${matchState.turnCount + 1} • ${matchState.activePlayer}`);
}

function maybeFollowMove(move) {
  if (!followToggle?.checked || !move?.to) {
    return;
  }
  controls.target.copy(boardToWorld(move.to.x, move.to.y, move.to.z));
}

function handleTurnResult(result) {
  if (result?.move) {
    pushMoveAnimation(result.move.pieceId, result.move.from, result.move.to);
    if (result.move.capturedPieceId) {
      pushCaptureAnimation(result.move.capturedPieceId);
    }
    maybeFollowMove(result.move);
  }

  if (result?.type === "MatchEnded") {
    const winner = result.winner ?? turnMachine.winner;
    setStatus(`Match ended. Winner: ${winner ?? "None"}`);
    updateTurnHud();
    updateMetricsHud();
    return;
  }

  if (result?.type === "TurnPassed") {
    setStatus(`${result.player} had no legal moves and passed.`);
  } else if (result?.timedOut) {
    setStatus(`${result.player} hit AI timeout fallback (${AI_BUDGET_MS}ms).`);
  } else if (result?.move) {
    const captureNote = result.move.isCapture ? " capture" : " move";
    setStatus(`${result.player}${captureNote}: ${result.move.pieceId}`);
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
        budgetMs: AI_BUDGET_MS,
      });
      recordTurnTelemetry(performance.now() - turnStartMs, result?.timedOut === true);
      handleTurnResult(result);
      return;
    }

    if (begin.type === TurnPhase.AwaitingHumanMove) {
      setStatus(`Waiting for human move: ${begin.player}`);
      return;
    }

    handleTurnResult(begin);
  } catch (error) {
    console.error(error);
    setStatus(`Turn error: ${error.message}`);
  } finally {
    turnInFlight = false;
    if (!paused && turnMachine.phase !== TurnPhase.MatchEnded) {
      scheduleTurn();
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

function animate(time) {
  const t = time * 0.001;
  centerGlow.scale.setScalar(1 + Math.sin(t * 1.7) * 0.08);

  tickAnimations();
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
}

if (varietySelect) {
  varietySelect.value = varietyMode;
}

updateMetricsHud();
resetMatch({ resume: true });
requestAnimationFrame(animate);





































