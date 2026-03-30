import { PIECE_TYPES } from "../GameState/constants.js";
import {
  BISHOP_DIRECTIONS,
  KING_DIRECTIONS,
  KNIGHT_OFFSETS,
  QUEEN_DIRECTIONS,
  ROOK_DIRECTIONS,
} from "./movementDirections.js";
import {
  buildMove,
  finalizeMoves,
  getPieceById,
  inBoundsCoord,
  isEnemy,
  isFriendly,
} from "./moveUtils.js";
import { Coord3 } from "../GameState/coord3.js";

function maybeCoord(origin, dx, dy, dz, step = 1) {
  const x = origin.x + (dx * step);
  const y = origin.y + (dy * step);
  const z = origin.z + (dz * step);
  if (!Coord3.inBounds(x, y, z)) {
    return null;
  }
  return new Coord3(x, y, z);
}

function generateSlidingMoves(piece, occupancyMap, directions) {
  const moves = [];

  for (const [dx, dy, dz] of directions) {
    let step = 1;
    while (true) {
      const destination = maybeCoord(piece.coord, dx, dy, dz, step);
      if (!destination) {
        break;
      }

      const occupant = occupancyMap.tryGetPieceAt(destination);
      if (!occupant) {
        moves.push(buildMove(piece, destination));
        step += 1;
        continue;
      }

      if (isEnemy(piece, occupant)) {
        moves.push(buildMove(piece, destination, occupant));
      }

      if (isFriendly(piece, occupant) || isEnemy(piece, occupant)) {
        break;
      }
    }
  }

  return moves;
}

function generateKnightMoves(piece, occupancyMap) {
  const moves = [];

  for (const [dx, dy, dz] of KNIGHT_OFFSETS) {
    const destination = maybeCoord(piece.coord, dx, dy, dz, 1);
    if (!destination || !inBoundsCoord(destination)) {
      continue;
    }

    const occupant = occupancyMap.tryGetPieceAt(destination);
    if (!occupant) {
      moves.push(buildMove(piece, destination));
      continue;
    }
    if (isEnemy(piece, occupant)) {
      moves.push(buildMove(piece, destination, occupant));
    }
  }

  return moves;
}

function generateKingMoves(piece, occupancyMap) {
  const moves = [];

  for (const [dx, dy, dz] of KING_DIRECTIONS) {
    const destination = maybeCoord(piece.coord, dx, dy, dz, 1);
    if (!destination) {
      continue;
    }

    const occupant = occupancyMap.tryGetPieceAt(destination);
    if (!occupant) {
      moves.push(buildMove(piece, destination));
      continue;
    }
    if (isEnemy(piece, occupant)) {
      moves.push(buildMove(piece, destination, occupant));
    }
  }

  return moves;
}

function getPawnForwardVector(piece) {
  const x = Number(piece?.forward?.x ?? 0);
  const y = Number(piece?.forward?.y ?? 0);
  const z = Number(piece?.forward?.z ?? 0);
  if (x !== 0 || y !== 0 || z !== 0) {
    return { x, y, z };
  }

  return piece?.coord?.y <= 3
    ? { x: 0, y: 1, z: 0 }
    : { x: 0, y: -1, z: 0 };
}

function isPawnStartCoord(piece, forward) {
  if (forward.y > 0) {
    return piece.coord.y === 1;
  }
  if (forward.y < 0) {
    return piece.coord.y === 6;
  }
  return false;
}

function generatePawnMoves(piece, occupancyMap) {
  const moves = [];
  const forward = getPawnForwardVector(piece);
  const oneForward = maybeCoord(piece.coord, forward.x, forward.y, forward.z, 1);

  if (oneForward && !occupancyMap.tryGetPieceAt(oneForward)) {
    moves.push(buildMove(piece, oneForward));

    if (isPawnStartCoord(piece, forward)) {
      const twoForward = maybeCoord(piece.coord, forward.x, forward.y, forward.z, 2);
      if (twoForward && !occupancyMap.tryGetPieceAt(twoForward)) {
        moves.push(buildMove(piece, twoForward));
      }
    }
  }

  const captureOffsets = [
    [forward.x + 1, forward.y, forward.z],
    [forward.x - 1, forward.y, forward.z],
    [forward.x, forward.y, forward.z + 1],
    [forward.x, forward.y, forward.z - 1],
  ];

  for (const [dx, dy, dz] of captureOffsets) {
    const destination = maybeCoord(piece.coord, dx, dy, dz, 1);
    if (!destination) {
      continue;
    }

    const occupant = occupancyMap.tryGetPieceAt(destination);
    if (occupant && isEnemy(piece, occupant)) {
      moves.push(buildMove(piece, destination, occupant));
    }
  }

  return moves;
}

export function getPseudoLegalMoves(matchState, occupancyMap, pieceId) {
  return getLegalMoves(matchState, occupancyMap, pieceId).map((move) => move.to);
}

export function getLegalMoves(matchState, occupancyMap, pieceId) {
  const piece = getPieceById(matchState, pieceId);

  let rawMoves;
  switch (piece.type) {
    case PIECE_TYPES.Rook:
      rawMoves = generateSlidingMoves(piece, occupancyMap, ROOK_DIRECTIONS);
      break;
    case PIECE_TYPES.Bishop:
      rawMoves = generateSlidingMoves(piece, occupancyMap, BISHOP_DIRECTIONS);
      break;
    case PIECE_TYPES.Queen:
      rawMoves = generateSlidingMoves(piece, occupancyMap, QUEEN_DIRECTIONS);
      break;
    case PIECE_TYPES.Knight:
      rawMoves = generateKnightMoves(piece, occupancyMap);
      break;
    case PIECE_TYPES.King:
      rawMoves = generateKingMoves(piece, occupancyMap);
      break;
    case PIECE_TYPES.Pawn:
      rawMoves = generatePawnMoves(piece, occupancyMap);
      break;
    default:
      throw new Error(`Unsupported piece type: ${piece.type}`);
  }

  return finalizeMoves(rawMoves);
}
