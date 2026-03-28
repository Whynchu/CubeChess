import { PIECE_TYPES } from "../GameState/constants.js";

export const DEFAULT_AI_WEIGHTS = Object.freeze({
  capture: 1.0,
  center: 0.02,
  mobility: 0.05,
});

export const PIECE_VALUE = Object.freeze({
  [PIECE_TYPES.King]: 9999,
  [PIECE_TYPES.Queen]: 9,
  [PIECE_TYPES.Rook]: 5,
  [PIECE_TYPES.Bishop]: 3,
  [PIECE_TYPES.Knight]: 3,
});

export function evaluateHeuristicMove({ move, matchState, legalMoves, weights = DEFAULT_AI_WEIGHTS }) {
  const breakdown = {
    capture: 0,
    center: 0,
    mobility: 0,
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

  const score = breakdown.capture + breakdown.center + breakdown.mobility;
  return { score, breakdown };
}
