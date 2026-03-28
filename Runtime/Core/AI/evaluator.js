import { PIECE_TYPES } from "../GameState/constants.js";

export const DEFAULT_AI_WEIGHTS = Object.freeze({
  capture: 1.0,
  center: 0.02,
  mobility: 0.05,
  threatened: 0.2,
  defended: 0.03,
  kingSafety: 0.6,
});

export const PIECE_VALUE = Object.freeze({
  [PIECE_TYPES.King]: 9999,
  [PIECE_TYPES.Queen]: 9,
  [PIECE_TYPES.Rook]: 5,
  [PIECE_TYPES.Bishop]: 3,
  [PIECE_TYPES.Knight]: 3,
});

function coordKey(coord) {
  return `${coord.x},${coord.y},${coord.z}`;
}

export function evaluateHeuristicMove({ move, matchState, legalMoves, threatContext = null, weights = DEFAULT_AI_WEIGHTS }) {
  const breakdown = {
    capture: 0,
    center: 0,
    mobility: 0,
    threat: 0,
    defense: 0,
    kingSafety: 0,
  };

  if (move?.capturedPieceId) {
    const captured = matchState?.pieces?.find((piece) => piece.id === move.capturedPieceId);
    if (captured) {
      breakdown.capture = (PIECE_VALUE[captured.type] ?? 1) * weights.capture;
    }
  }

  const centerDistance = Math.abs(move.to.x - 3.5) + Math.abs(move.to.y - 3.5) + Math.abs(move.to.z - 3.5);
  breakdown.center = (10.5 - centerDistance) * weights.center;

  const ownPieceOptions = legalMoves.filter((candidate) => candidate.pieceId === move.pieceId).length;
  breakdown.mobility = ownPieceOptions * weights.mobility;

  const destinationKey = coordKey(move.to);
  const opponentAttackers = threatContext?.opponent?.attackCounts?.get(destinationKey) ?? 0;
  const friendlySupport = threatContext?.friendly?.attackCounts?.get(destinationKey) ?? 0;

  breakdown.threat = -(opponentAttackers * weights.threatened);
  breakdown.defense = friendlySupport * weights.defended;

  const movingPiece = matchState?.pieces?.find((piece) => piece.id === move.pieceId);
  if (movingPiece?.type === PIECE_TYPES.King && opponentAttackers > 0) {
    breakdown.kingSafety = -(opponentAttackers * weights.kingSafety);
  }

  const score = breakdown.capture
    + breakdown.center
    + breakdown.mobility
    + breakdown.threat
    + breakdown.defense
    + breakdown.kingSafety;

  return { score, breakdown };
}
