import { Coord3 } from "../GameState/coord3.js";

export function inBoundsCoord(coord) {
  return Coord3.inBounds(coord.x, coord.y, coord.z);
}

export function getPieceById(matchState, pieceId) {
  const piece = matchState.pieces.find((p) => p.id === pieceId && p.alive);
  if (!piece) {
    throw new Error(`Piece not found or not alive: ${pieceId}`);
  }
  return piece;
}

export function isFriendly(piece, otherPiece) {
  return otherPiece && piece.owner === otherPiece.owner;
}

export function isEnemy(piece, otherPiece) {
  return otherPiece && piece.owner !== otherPiece.owner;
}

export function buildMove(piece, destination, occupant = null) {
  return {
    pieceId: piece.id,
    from: piece.coord.toJSON(),
    to: destination.toJSON(),
    isCapture: Boolean(occupant),
    capturedPieceId: occupant ? occupant.id : null,
  };
}

export function sortMovesDeterministic(moves) {
  return moves.sort((a, b) => {
    if (a.to.x !== b.to.x) return a.to.x - b.to.x;
    if (a.to.y !== b.to.y) return a.to.y - b.to.y;
    if (a.to.z !== b.to.z) return a.to.z - b.to.z;
    if (a.isCapture !== b.isCapture) return a.isCapture ? -1 : 1;
    return a.pieceId.localeCompare(b.pieceId);
  });
}

export function dedupeByDestination(moves) {
  const seen = new Set();
  const out = [];

  for (const move of moves) {
    const key = `${move.to.x},${move.to.y},${move.to.z}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(move);
  }

  return out;
}

export function finalizeMoves(moves) {
  return sortMovesDeterministic(dedupeByDestination(moves));
}
