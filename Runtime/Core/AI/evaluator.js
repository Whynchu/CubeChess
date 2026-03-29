import { PIECE_TYPES } from "../GameState/constants.js";
import { BoardPhase, classifyBoardPhase } from "./phase.js";

export const DEFAULT_AI_WEIGHTS = Object.freeze({
  capture: 1.0,
  center: 0.02,
  mobility: 0.05,
  threatened: 0.2,
  defended: 0.03,
  kingSafety: 0.6,
  development: 0.12,
  inactivity: 0.07,
  repeatMove: 0.42,
  backtrack: 0.32,
  samePieceStreak: 0.12,
  sameTypeRepeat: 0.09,
  counterRisk: 0.1,
  tablePressure: 0.12,
  antiHelper: 0.14,
});

export const PIECE_VALUE = Object.freeze({
  [PIECE_TYPES.King]: 9999,
  [PIECE_TYPES.Queen]: 9,
  [PIECE_TYPES.Rook]: 5,
  [PIECE_TYPES.Bishop]: 3,
  [PIECE_TYPES.Knight]: 3,
});

const PHASE_WEIGHT_MULTIPLIERS = Object.freeze({
  [BoardPhase.Opening]: Object.freeze({
    capture: 0.92,
    center: 1.25,
    mobility: 1.14,
    threatened: 0.95,
    defended: 1.06,
    kingSafety: 1.0,
    development: 1.4,
    inactivity: 1.08,
    repeatMove: 1.0,
    backtrack: 1.05,
    samePieceStreak: 1.18,
    sameTypeRepeat: 1.15,
    counterRisk: 0.9,
    tablePressure: 0.95,
    antiHelper: 1.02,
  }),
  [BoardPhase.Midgame]: Object.freeze({
    capture: 1,
    center: 1,
    mobility: 1,
    threatened: 1,
    defended: 1,
    kingSafety: 1,
    development: 1,
    inactivity: 1,
    repeatMove: 1,
    backtrack: 1,
    samePieceStreak: 1,
    sameTypeRepeat: 1,
    counterRisk: 1,
    tablePressure: 1,
    antiHelper: 1,
  }),
  [BoardPhase.Endgame]: Object.freeze({
    capture: 1.2,
    center: 0.86,
    mobility: 1.08,
    threatened: 1.22,
    defended: 1.05,
    kingSafety: 1.26,
    development: 0.58,
    inactivity: 0.65,
    repeatMove: 1.18,
    backtrack: 1.18,
    samePieceStreak: 0.9,
    sameTypeRepeat: 0.84,
    counterRisk: 1.22,
    tablePressure: 1.2,
    antiHelper: 1.15,
  }),
});

function coordKey(coord) {
  return `${coord.x},${coord.y},${coord.z}`;
}

function coordEquals(a, b) {
  return a?.x === b?.x && a?.y === b?.y && a?.z === b?.z;
}

function inferPieceTypeFromId(pieceId) {
  const parts = String(pieceId ?? "").split("-");
  return parts.length >= 2 ? parts[1] : PIECE_TYPES.Knight;
}

function getPhaseWeights(weights, boardPhase) {
  const multipliers = PHASE_WEIGHT_MULTIPLIERS[boardPhase] ?? PHASE_WEIGHT_MULTIPLIERS[BoardPhase.Midgame];
  return {
    capture: weights.capture * multipliers.capture,
    center: weights.center * multipliers.center,
    mobility: weights.mobility * multipliers.mobility,
    threatened: weights.threatened * multipliers.threatened,
    defended: weights.defended * multipliers.defended,
    kingSafety: weights.kingSafety * multipliers.kingSafety,
    development: weights.development * multipliers.development,
    inactivity: weights.inactivity * multipliers.inactivity,
    repeatMove: weights.repeatMove * multipliers.repeatMove,
    backtrack: weights.backtrack * multipliers.backtrack,
    samePieceStreak: weights.samePieceStreak * multipliers.samePieceStreak,
    sameTypeRepeat: weights.sameTypeRepeat * multipliers.sameTypeRepeat,
    counterRisk: weights.counterRisk * multipliers.counterRisk,
    tablePressure: weights.tablePressure * multipliers.tablePressure,
    antiHelper: weights.antiHelper * multipliers.antiHelper,
  };
}

function getOpponentPressureAtDestination(threatContext, destinationKey) {
  const byPlayer = threatContext?.opponent?.attackCountsByPlayer;
  if (!(byPlayer instanceof Map) || byPlayer.size === 0) {
    return {
      opponentPlayerPressureCount: 0,
      opponentAttackersByPlayer: new Map(),
    };
  }

  const opponentAttackersByPlayer = new Map();
  let opponentPlayerPressureCount = 0;

  for (const [opponentPlayer, attackMap] of byPlayer.entries()) {
    const count = attackMap?.get?.(destinationKey) ?? 0;
    if (count > 0) {
      opponentPlayerPressureCount += 1;
      opponentAttackersByPlayer.set(opponentPlayer, count);
    }
  }

  return {
    opponentPlayerPressureCount,
    opponentAttackersByPlayer,
  };
}

export function evaluateHeuristicMove({
  move,
  matchState,
  legalMoves,
  threatContext = null,
  behaviorContext = null,
  weights = DEFAULT_AI_WEIGHTS,
  boardPhase = null,
}) {
  const resolvedBoardPhase = boardPhase ?? classifyBoardPhase(matchState);
  const phaseWeights = getPhaseWeights(weights, resolvedBoardPhase);

  const breakdown = {
    capture: 0,
    center: 0,
    mobility: 0,
    threat: 0,
    defense: 0,
    kingSafety: 0,
    development: 0,
    inactivity: 0,
    repetition: 0,
    diversity: 0,
    counterRisk: 0,
    tablePressure: 0,
    antiHelper: 0,
    boardPhase: resolvedBoardPhase,
  };

  if (move?.capturedPieceId) {
    const captured = matchState?.pieces?.find((piece) => piece.id === move.capturedPieceId);
    if (captured) {
      breakdown.capture = (PIECE_VALUE[captured.type] ?? 1) * phaseWeights.capture;
    }
  }

  const centerDistance = Math.abs(move.to.x - 3.5) + Math.abs(move.to.y - 3.5) + Math.abs(move.to.z - 3.5);
  breakdown.center = (10.5 - centerDistance) * phaseWeights.center;

  const ownPieceOptions = legalMoves.filter((candidate) => candidate.pieceId === move.pieceId).length;
  breakdown.mobility = ownPieceOptions * phaseWeights.mobility;

  const destinationKey = coordKey(move.to);
  const opponentAttackers = threatContext?.opponent?.attackCounts?.get(destinationKey) ?? 0;
  const friendlySupport = threatContext?.friendly?.attackCounts?.get(destinationKey) ?? 0;

  breakdown.threat = -(opponentAttackers * phaseWeights.threatened);
  breakdown.defense = friendlySupport * phaseWeights.defended;

  const movingPiece = matchState?.pieces?.find((piece) => piece.id === move.pieceId);
  const movingPieceValue = PIECE_VALUE[movingPiece?.type] ?? 1;

  if (movingPiece?.type === PIECE_TYPES.King && opponentAttackers > 0) {
    breakdown.kingSafety = -(opponentAttackers * phaseWeights.kingSafety);
  }

  const netPressure = Math.max(0, opponentAttackers - friendlySupport);
  if (netPressure > 0) {
    breakdown.counterRisk = -(netPressure * movingPieceValue * phaseWeights.counterRisk);
  }

  const {
    opponentPlayerPressureCount,
    opponentAttackersByPlayer,
  } = getOpponentPressureAtDestination(threatContext, destinationKey);

  const extraOpponents = Math.max(0, opponentPlayerPressureCount - 1);
  if (extraOpponents > 0) {
    const tablePressureScale = (movingPieceValue * 0.5) + 0.5;
    breakdown.tablePressure = -(extraOpponents * tablePressureScale * phaseWeights.tablePressure);
  }

  if (move?.capturedPieceId && opponentAttackersByPlayer.size > 0) {
    const captured = matchState?.pieces?.find((piece) => piece.id === move.capturedPieceId);
    const capturedOwner = captured?.owner ?? null;
    let helperPressure = 0;
    for (const [opponentPlayer, attackCount] of opponentAttackersByPlayer.entries()) {
      if (opponentPlayer === capturedOwner) {
        continue;
      }
      helperPressure += attackCount;
    }
    if (helperPressure > 0) {
      breakdown.antiHelper = -(helperPressure * movingPieceValue * phaseWeights.antiHelper);
    }
  }

  const pieceMoveCount = behaviorContext?.pieceMoveCountsById?.get?.(move.pieceId) ?? 0;
  if (pieceMoveCount === 0 && movingPiece?.type !== PIECE_TYPES.King) {
    breakdown.development = phaseWeights.development;
  }

  breakdown.inactivity = -(Math.min(pieceMoveCount, 8) * phaseWeights.inactivity);

  const recentMoves = Array.isArray(behaviorContext?.recentMoves) ? behaviorContext.recentMoves : [];
  const recentSamePiece = recentMoves.filter((entry) => entry?.pieceId === move.pieceId);

  if (recentSamePiece.some((entry) => coordEquals(entry.to, move.to))) {
    breakdown.repetition -= phaseWeights.repeatMove;
  }

  const lastSamePiece = recentSamePiece.length > 0 ? recentSamePiece[recentSamePiece.length - 1] : null;
  if (lastSamePiece && coordEquals(lastSamePiece.from, move.to) && coordEquals(lastSamePiece.to, move.from)) {
    breakdown.repetition -= phaseWeights.backtrack;
  }

  const samePieceStreakPenalty = Math.max(0, recentSamePiece.length - 1) * phaseWeights.samePieceStreak;
  breakdown.diversity -= Math.min(samePieceStreakPenalty, phaseWeights.samePieceStreak * 4);

  const movingType = movingPiece?.type ?? inferPieceTypeFromId(move.pieceId);
  if (movingType !== PIECE_TYPES.King) {
    const recentSameType = recentMoves.filter((entry) => {
      const entryType = inferPieceTypeFromId(entry?.pieceId);
      return entryType === movingType;
    }).length;

    if (recentSameType >= 3) {
      const sameTypePenalty = Math.min(4, recentSameType - 2) * phaseWeights.sameTypeRepeat;
      breakdown.diversity -= sameTypePenalty;
    }
  }

  const score = breakdown.capture
    + breakdown.center
    + breakdown.mobility
    + breakdown.threat
    + breakdown.defense
    + breakdown.kingSafety
    + breakdown.development
    + breakdown.inactivity
    + breakdown.repetition
    + breakdown.diversity
    + breakdown.counterRisk
    + breakdown.tablePressure
    + breakdown.antiHelper;

  return { score, breakdown, boardPhase: resolvedBoardPhase };
}
