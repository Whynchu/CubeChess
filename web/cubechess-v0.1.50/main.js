import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/FBXLoader.js";

import { initializeMatchState } from "../../Runtime/Core/GameState/initializeMatchState.js";
import { TURN_ORDER, PIECE_TYPES } from "../../Runtime/Core/GameState/constants.js";
import { TurnPhase, TurnStateMachine } from "../../Runtime/Core/Turn/index.js";
import { presetAllAI } from "../../Runtime/Core/Seats/index.js";

const VERSION = "0.1.50";
const BOARD_SIZE = 8;
const AI_BUDGET_MS = 400;
const AI_BUDGET_MAX_MS = 10000;

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
const hudEl = document.getElementById("hud");
const hudToggleBtn = document.getElementById("hudToggleBtn");
const autoReplayToggle = document.getElementById("autoReplayToggle");
const experimentalLightToggle = document.getElementById("experimentalLightToggle");
const experimentalBranchDepthToggle = document.getElementById("experimentalBranchDepthToggle");
const winnerOverlayEl = document.getElementById("winnerOverlay");
const winnerTextEl = document.getElementById("winnerText");
const winnerTimerFillEl = document.getElementById("winnerTimerFill");
const winnerTimerLabelEl = document.getElementById("winnerTimerLabel");

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
controls.enablePan = false;

const ambient = new THREE.AmbientLight(0xa8d4ff, 0.55);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xc0e2ff, 0.8);
keyLight.position.set(14, 18, 10);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x5599ff, 0.7, 80);
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
  const lineMat = new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.1 });
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
  return new THREE.LineSegments(geo, lineMat);
}

function createCellCenters() {
  const plusMaterial = new THREE.LineBasicMaterial({
    color: 0x9fd8ff,
    transparent: true,
    opacity: 0.2,
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

boardGroup.add(createCubeShell());
boardGroup.add(createGridLines());
boardGroup.add(createCellCenters());
const PLAYER_COLOR = Object.freeze({
  Yellow: 0xffce3a,
  Red: 0xff5858,
  Purple: 0xb578ff,
  Blue: 0x48a7ff,
  Green: 0x2ecc71,
  Orange: 0xf39c12,
  Pink: 0xe91e63,
  Cyan: 0x00bcd4,
});

const VarietyMode = Object.freeze({
  Deterministic: "deterministic",
  Chaotic: "chaotic",
});

let varietyMode = varietySelect?.value ?? VarietyMode.Chaotic;
let followPieceId = null;
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
const CELL_HIGHLIGHT_OPACITY = 0.14;
const PIECE_FADE_NEAR_DISTANCE = 6;
const PIECE_FADE_FAR_DISTANCE = 28;
const PIECE_FADE_NEAR_FACTOR = 0.88;
const PIECE_FADE_FAR_FACTOR = 0.32;
const MODEL_CORE_BASE_OPACITY = 0.92;
const MODEL_CORE_KING_BASE_OPACITY = 0.96;
const MODEL_GLOW_BASE_OPACITY = 0.24;
const MODEL_GLOW_KING_BASE_OPACITY = 0.3;

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
      next.depthTest = false;
      next.depthWrite = false;
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
    const glowInstance = modelTemplate.clone(true);
    glowMaterials = tintModelInstance(glowInstance, color, glowBaseOpacity, {
      blending: THREE.AdditiveBlending,
      emissiveScale: 0.6,
      emissiveIntensity: 1.15,
      renderOrder: 11,
    });
    glowInstance.scale.multiplyScalar(1.1);
    root.add(glowInstance);

    const modelInstance = modelTemplate.clone(true);
    modelMaterials = tintModelInstance(modelInstance, color, coreBaseOpacity, {
      emissiveScale: experimentalPieceLightEnabled ? 0.62 : 0.26,
      emissiveIntensity: experimentalPieceLightEnabled ? 1.15 : 0.7,
      depthTest: true,
      depthWrite: false,
    });
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
  for (const visual of pieceVisuals.values()) {
    const underCaptureAnim = animations.some((anim) => anim.type === "capture" && anim.visual === visual);
    if (underCaptureAnim) {
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

const DECISION_MAX_CANDIDATES = 512;
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
    const cubeColor = emphasize ? 0xffffff : pieceColor;
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
        color: 0xffffff,
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
    const mat = new THREE.MeshBasicMaterial({
      color: emphasize ? 0xffffff : pieceColor,
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

  const scored = [];

  for (const move of legalMoves) {
    if (signal?.aborted) {
      break;
    }

    const score = scoreMove(move, { ...context, legalMoves });
    scored.push({ move, score });
  }

  if (scored.length === 0) {
    clearDecisionOverlay();
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

  let chosenMove = scored[0].move;
  if (varietyMode !== VarietyMode.Deterministic) {
    const topK = Math.min(5, scored.length);
    const pool = scored.slice(0, topK);
    const totalWeight = pool.reduce((sum, _entry, index) => sum + (topK - index), 0);
    let ticket = nextVarietyRandom() * totalWeight;
    for (let index = 0; index < pool.length; index += 1) {
      ticket -= (topK - index);
      if (ticket <= 0) {
        chosenMove = pool[index].move;
        break;
      }
    }
  }

  const topCandidates = scored.slice(0, DECISION_MAX_CANDIDATES);
  const pieceCandidates = buildPieceCandidatesFromScored(topCandidates, pieceById);
  const chosenPieceIndex = Math.max(0, pieceCandidates.findIndex((entry) => entry.pieceId === chosenMove.pieceId));

  await previewPieceSelectionCycle(pieceCandidates, chosenPieceIndex, signal);
  await confirmPieceSelection(pieceCandidates, chosenPieceIndex, signal);

  const chosenPiece = pieceById.get(chosenMove.pieceId);
  const rawChosenPieceMoves = topCandidates.filter((entry) => entry.move.pieceId === chosenMove.pieceId);
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

function hexToCssColor(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
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
  winnerTextEl.textContent = winner ? `${winner} Wins` : "No Winner";
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
  clearTurnTimer();
  clearDecisionOverlay();
  hideWinnerOverlay();
  animations.length = 0;
  clearTrails();
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
const trails = [];
const TRAIL_DURATION_MS = 460;
const TRAIL_MIN_MOVE_CELLS = 1;
const TRAIL_EMIT_STEP = 0.14;

const TRAIL_CORE_GEO = new THREE.SphereGeometry(0.24, 18, 18);
const TRAIL_CORE_KING_GEO = new THREE.SphereGeometry(0.28, 18, 18);
const TRAIL_CELL_GEO = new THREE.BoxGeometry(0.9, 0.9, 0.9);

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

      if (anim.trailEnabled) {
        const current = anim.visual.root.position;
        const travel = current.distanceTo(anim.lastTrailPoint);
        if (travel >= TRAIL_EMIT_STEP) {
          const steps = Math.max(1, Math.floor(travel / TRAIL_EMIT_STEP));
          for (let step = 1; step <= steps; step += 1) {
            const alpha = step / steps;
            const ghostPos = new THREE.Vector3().lerpVectors(anim.lastTrailPoint, current, alpha);
            spawnTrailGhost(anim.visual, ghostPos);
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

function getPiecePreviewPlan(pieceCount) {
  const clampedSpeed = Math.max(0.25, speedMultiplier);
  const count = Math.max(1, pieceCount);
  let baseDwellMs;

  if (clampedSpeed <= 0.5) {
    baseDwellMs = 360;
  } else if (clampedSpeed <= 1) {
    baseDwellMs = 220;
  } else {
    baseDwellMs = 120;
  }

  const cappedByBudget = Math.max(90, Math.floor(2400 / count));
  return { dwellMs: Math.min(baseDwellMs, cappedByBudget) };
}

async function previewPieceSelectionCycle(pieceCandidates, targetIndex, signal) {
  if (!Array.isArray(pieceCandidates) || pieceCandidates.length === 0) {
    clearDecisionOverlay();
    return;
  }

  const plan = getPiecePreviewPlan(pieceCandidates.length);
  const order = buildCyclePathIndices(pieceCandidates.length, 0, targetIndex);

  for (const index of order) {
    if (signal?.aborted) {
      break;
    }
    showPieceSelectionOverlay(pieceCandidates, {
      focusIndex: index,
      solo: false,
      bestOpacity: 0.62,
      otherOpacity: 0.22,
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

  if (clampedSpeed <= 0.5) {
    baseDwellMs = 500;
  } else if (clampedSpeed <= 1) {
    baseDwellMs = 320;
  } else {
    baseDwellMs = 170;
  }

  const cappedByBudget = Math.max(100, Math.floor(5600 / count));
  return { dwellMs: Math.min(baseDwellMs, cappedByBudget) };
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
  const order = Array.isArray(focusOrder) && focusOrder.length > 0
    ? focusOrder
    : buildCyclePathIndices(candidates.length, 0, targetIndex);

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
  const moveCount = Math.min(DECISION_MAX_CANDIDATES, Math.max(1, legalMoveCount));
  const pieceCountGuess = Math.max(1, Math.min(8, Math.round(Math.sqrt(moveCount * 1.5))));
  const piecePlan = getPiecePreviewPlan(pieceCountGuess);
  const movePlan = getDecisionPreviewPlan(moveCount);
  const previewMs = pieceCountGuess * piecePlan.dwellMs + moveCount * movePlan.dwellMs + 800;
  return Math.min(AI_BUDGET_MAX_MS, Math.max(AI_BUDGET_MS, previewMs));
}

function getTurnDelayMs() {
  const baseDelayMs = 120;
  if (speedMultiplier >= 1) {
    return Math.max(60, Math.round(baseDelayMs / speedMultiplier));
  }
  return baseDelayMs;
}


function updateTurnHud() {
  if (turnMachine.phase === TurnPhase.MatchEnded) {
    setTurnLabel(`Winner: ${turnMachine.winner ?? "None"}`);
    return;
  }

  setTurnLabel(`Turn ${matchState.turnCount + 1} • ${matchState.activePlayer}`);
}

function maybeFollowMove(move) {
  if (!followToggle?.checked || !move?.pieceId) {
    return;
  }
  setFollowPiece(move.pieceId);
}

function recenterCameraTarget() {
  controls.target.set(0, 0, 0);
}

function handleTurnResult(result) {
  clearDecisionOverlay();
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
    showWinnerOverlay(winner);
    updateTurnHud();
    updateMetricsHud();
    return;
  }

  if (result?.type === "TurnPassed") {
    setStatus(`${result.player} had no legal moves and passed.`);
  } else if (result?.timedOut) {
    setStatus(`${result.player} hit AI timeout fallback.`);
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
        budgetMs: estimateAIBudgetMs(begin.legalMoves?.length ?? 1),
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
  applyPieceDistanceFade();
  tickTrails();
  tickWinnerOverlayCountdown();
  updateFollowActivePiece();
  updateExperimentalPieceLight();
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

updateMetricsHud();
applyHudCollapsed(window.innerWidth < 900);
recenterCameraTarget();
primePieceModels();
resetMatch({ resume: true });
requestAnimationFrame(animate);














































































