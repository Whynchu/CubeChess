import { PIECE_TYPES } from "../GameState/constants.js";
import { BoardPhase, classifyBoardPhase } from "./phase.js";

export const DEFAULT_AI_WEIGHTS = Object.freeze({
  capture: 1.0,
  center: 0.02,
  mobility: 0.042,
  threatened: 0.2,
  defended: 0.04,
  kingSafety: 0.6,
  development: 0.16,
  inactivity: 0.07,
  repeatMove: 0.46,
  backtrack: 0.35,
  samePieceStreak: 0.16,
  sameTypeRepeat: 0.14,
  counterRisk: 0.1,
  tablePressure: 0.22,
  antiHelper: 0.24,
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
    tablePressure: 0.9,
    antiHelper: 1.0,
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
    tablePressure: 1.12,
    antiHelper: 1.18,
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
    tablePressure: 1.38,
    antiHelper: 1.34,
  }),
});

const MOBILITY_PIECE_SCALE = Object.freeze({
  [PIECE_TYPES.King]: 0.72,
  [PIECE_TYPES.Queen]: 0.72,
  [PIECE_TYPES.Rook]: 1.02,
  [PIECE_TYPES.Bishop]: 1.12,
  [PIECE_TYPES.Knight]: 1.14,
});

const DEVELOPMENT_PIECE_SCALE = Object.freeze({
  [PIECE_TYPES.King]: 0,
  [PIECE_TYPES.Queen]: 0.45,
  [PIECE_TYPES.Rook]: 1.05,
  [PIECE_TYPES.Bishop]: 1.18,
  [PIECE_TYPES.Knight]: 1.14,
});

const PRESSURE_RISK_SCALE = Object.freeze({
  [PIECE_TYPES.King]: 1.18,
  [PIECE_TYPES.Queen]: 1.16,
  [PIECE_TYPES.Rook]: 1.02,
  [PIECE_TYPES.Bishop]: 0.96,
  [PIECE_TYPES.Knight]: 0.94,
});

const SUPPORT_REWARD_SCALE = Object.freeze({
  [PIECE_TYPES.King]: 0.22,
  [PIECE_TYPES.Queen]: 0.42,
  [PIECE_TYPES.Rook]: 0.72,
  [PIECE_TYPES.Bishop]: 0.8,
  [PIECE_TYPES.Knight]: 0.76,
});

const OPENING_QUEEN_UNDEVELOPED_TAX = 0.28;
const OPENING_QUEEN_REUSE_TAX = 0.2;
const OPENING_QUEEN_UNSUPPORTED_EXTRA = 0.22;
const OPENING_KNIGHT_INITIATIVE_REWARD = 0.34;
const OPENING_ROOK_RELEASE_REWARD = 0.12;
const DIVERSITY_RECENT_WINDOW = 16;
const DIVERSITY_OVERUSED_TYPE_RATIO = 0.45;
const DIVERSITY_OVERUSED_TYPE_TAX = 0.2;
const DIVERSITY_UNDERUSED_TYPE_REWARD = 0.24;
const DIVERSITY_UNDERUSED_KNIGHT_BONUS = 0.18;

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

function buildRecentTypeHistogram(recentMoves) {
  const histogram = new Map();
  for (const entry of recentMoves) {
    const entryType = inferPieceTypeFromId(entry?.pieceId);
    histogram.set(entryType, (histogram.get(entryType) ?? 0) + 1);
  }
  return histogram;
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

  const destinationKey = coordKey(move.to);
  const opponentAttackers = threatContext?.opponent?.attackCounts?.get(destinationKey) ?? 0;
  const friendlySupport = threatContext?.friendly?.attackCounts?.get(destinationKey) ?? 0;

  breakdown.threat = -(opponentAttackers * phaseWeights.threatened);
  breakdown.defense = friendlySupport * phaseWeights.defended;

  const movingPiece = matchState?.pieces?.find((piece) => piece.id === move.pieceId);
  const movingPieceValue = PIECE_VALUE[movingPiece?.type] ?? 1;
  const movingType = movingPiece?.type ?? inferPieceTypeFromId(move.pieceId);
  const mobilityScale = MOBILITY_PIECE_SCALE[movingType] ?? 1;
  const developmentScale = DEVELOPMENT_PIECE_SCALE[movingType] ?? 1;
  const pressureRiskScale = PRESSURE_RISK_SCALE[movingType] ?? 1;
  const supportRewardScale = SUPPORT_REWARD_SCALE[movingType] ?? 0.5;

  breakdown.mobility = ownPieceOptions * phaseWeights.mobility * mobilityScale;
  if (friendlySupport > 0) {
    breakdown.defense += friendlySupport * phaseWeights.defended * supportRewardScale;
  }

  if (movingPiece?.type === PIECE_TYPES.King && opponentAttackers > 0) {
    breakdown.kingSafety = -(opponentAttackers * phaseWeights.kingSafety);
  }

  const netPressure = Math.max(0, opponentAttackers - friendlySupport);
  if (netPressure > 0) {
    breakdown.counterRisk = -(netPressure * movingPieceValue * pressureRiskScale * phaseWeights.counterRisk);
  }

  const {
    opponentPlayerPressureCount,
    opponentAttackersByPlayer,
  } = getOpponentPressureAtDestination(threatContext, destinationKey);

  const extraOpponents = Math.max(0, opponentPlayerPressureCount - 1);
  const baseTablePressure = opponentPlayerPressureCount > 0 && netPressure > 0 ? 0.35 : 0;
  const tablePressureUnits = baseTablePressure + extraOpponents;
  if (tablePressureUnits > 0) {
    const tablePressureScale = ((movingPieceValue * 0.5) + 0.5) * pressureRiskScale;
    breakdown.tablePressure = -(tablePressureUnits * tablePressureScale * phaseWeights.tablePressure);
  }

  let helperPressure = 0;
  if (opponentAttackersByPlayer.size > 0) {
    if (move?.capturedPieceId) {
      const captured = matchState?.pieces?.find((piece) => piece.id === move.capturedPieceId);
      const capturedOwner = captured?.owner ?? null;
      for (const [opponentPlayer, attackCount] of opponentAttackersByPlayer.entries()) {
        if (opponentPlayer === capturedOwner) {
          continue;
        }
        helperPressure += attackCount;
      }
    }

    if (helperPressure === 0 && opponentPlayerPressureCount >= 2 && netPressure > 0) {
      helperPressure = opponentPlayerPressureCount - 1;
    }
  }

  if (helperPressure > 0) {
    breakdown.antiHelper = -(helperPressure * movingPieceValue * pressureRiskScale * phaseWeights.antiHelper);
  }

  const pieceMoveCountById = behaviorContext?.pieceMoveCountsById;
  const pieceMoveCount = pieceMoveCountById?.get?.(move.pieceId) ?? 0;
  if (pieceMoveCount === 0 && movingType !== PIECE_TYPES.King) {
    breakdown.development = phaseWeights.development * developmentScale;
    if (friendlySupport > 0 && movingType !== PIECE_TYPES.Queen) {
      breakdown.development += phaseWeights.development * 0.32;
    }
  }

  let undevelopedMinorCount = 0;
  if (Array.isArray(matchState?.pieces) && movingPiece?.owner) {
    for (const piece of matchState.pieces) {
      if (!piece?.alive || piece.owner !== movingPiece.owner) {
        continue;
      }
      if (piece.type !== PIECE_TYPES.Knight && piece.type !== PIECE_TYPES.Bishop && piece.type !== PIECE_TYPES.Rook) {
        continue;
      }
      if ((pieceMoveCountById?.get?.(piece.id) ?? 0) === 0) {
        undevelopedMinorCount += 1;
      }
    }
  }

  if (resolvedBoardPhase === BoardPhase.Opening) {
    if (movingType === PIECE_TYPES.Queen && !move?.capturedPieceId) {
      const undevelopedTax = Math.min(4, undevelopedMinorCount) * phaseWeights.development * OPENING_QUEEN_UNDEVELOPED_TAX;
      const reuseTax = pieceMoveCount > 0 ? Math.min(3, pieceMoveCount) * phaseWeights.sameTypeRepeat * OPENING_QUEEN_REUSE_TAX : 0;
      const unsupportedTax = friendlySupport === 0 ? phaseWeights.threatened * OPENING_QUEEN_UNSUPPORTED_EXTRA : 0;
      breakdown.development -= (undevelopedTax + reuseTax + unsupportedTax);
    }

    if (movingType === PIECE_TYPES.Knight && pieceMoveCount <= 1) {
      const centerFactor = Math.max(0, (10.5 - centerDistance) / 10.5);
      breakdown.development += phaseWeights.development * (OPENING_KNIGHT_INITIATIVE_REWARD + (centerFactor * 0.2));
    }

    if (movingType === PIECE_TYPES.Rook && pieceMoveCount === 0 && undevelopedMinorCount >= 2) {
      breakdown.development += phaseWeights.development * OPENING_ROOK_RELEASE_REWARD;
    }
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

  const recentWindowMoves = recentMoves.slice(-DIVERSITY_RECENT_WINDOW);
  const recentTypeHistogram = buildRecentTypeHistogram(recentWindowMoves);
  const recentSameType = recentTypeHistogram.get(movingType) ?? 0;

  if (movingType !== PIECE_TYPES.King) {
    if (recentSameType >= 3) {
      const sameTypePenalty = Math.min(4, recentSameType - 2) * phaseWeights.sameTypeRepeat;
      breakdown.diversity -= sameTypePenalty;
    }

    const overusedThreshold = Math.max(4, Math.ceil(recentWindowMoves.length * DIVERSITY_OVERUSED_TYPE_RATIO));
    if (recentSameType > overusedThreshold) {
      const overuseUnits = recentSameType - overusedThreshold;
      breakdown.diversity -= overuseUnits * phaseWeights.sameTypeRepeat * DIVERSITY_OVERUSED_TYPE_TAX;
    }

    const typeDiversityPool = [PIECE_TYPES.Queen, PIECE_TYPES.Rook, PIECE_TYPES.Bishop, PIECE_TYPES.Knight];
    const expectedPerType = recentWindowMoves.length > 0 ? (recentWindowMoves.length / typeDiversityPool.length) : 0;
    if (movingType !== PIECE_TYPES.Queen && expectedPerType > 0) {
      const underusedThreshold = Math.max(1, Math.floor(expectedPerType * 0.6));
      if (recentSameType <= underusedThreshold) {
        breakdown.diversity += phaseWeights.sameTypeRepeat * DIVERSITY_UNDERUSED_TYPE_REWARD;
        if (movingType === PIECE_TYPES.Knight) {
          breakdown.diversity += phaseWeights.sameTypeRepeat * DIVERSITY_UNDERUSED_KNIGHT_BONUS;
        }
      }
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
