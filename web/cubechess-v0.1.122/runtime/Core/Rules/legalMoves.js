import { PIECE_TYPES } from "../GameState/constants.js";
import { MatchState } from "../GameState/matchState.js";
import { OccupancyMap } from "../GameState/occupancyMap.js";
import { Piece } from "../GameState/piece.js";
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
import { GameModeId } from "../Modes/gameModes.js";

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

function buildSpecialMove(baseMove, extra) {
  return {
    ...baseMove,
    capturedPieceId: extra.capturedPieceId ?? baseMove.capturedPieceId ?? null,
    special: extra.special ?? null,
    rookMove: extra.rookMove ?? null,
    captureSquare: extra.captureSquare ?? null,
  };
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

function getPawnPrimaryAxis(forward) {
  if (forward.x !== 0) return "x";
  if (forward.y !== 0) return "y";
  return "z";
}

function isPawnStartCoord(piece, forward) {
  const axis = getPawnPrimaryAxis(forward);
  if (axis === "x") {
    return forward.x > 0 ? piece.coord.x === 1 : piece.coord.x === 6;
  }
  if (axis === "y") {
    return forward.y > 0 ? piece.coord.y === 1 : piece.coord.y === 6;
  }
  return forward.z > 0 ? piece.coord.z === 1 : piece.coord.z === 6;
}

function getPawnCaptureOffsets(forward) {
  const axis = getPawnPrimaryAxis(forward);
  if (axis === "x") {
    return [
      [forward.x, 1, 0],
      [forward.x, -1, 0],
      [forward.x, 0, 1],
      [forward.x, 0, -1],
    ];
  }
  if (axis === "y") {
    return [
      [1, forward.y, 0],
      [-1, forward.y, 0],
      [0, forward.y, 1],
      [0, forward.y, -1],
    ];
  }
  return [
    [1, 0, forward.z],
    [-1, 0, forward.z],
    [0, 1, forward.z],
    [0, -1, forward.z],
  ];
}

function getPawnAdvanceOffsets(forward) {
  const axis = getPawnPrimaryAxis(forward);
  if (axis === "x") {
    return [
      [forward.x, 0, 0],
      [forward.x, 1, 0],
      [forward.x, -1, 0],
    ];
  }
  if (axis === "y") {
    return [
      [0, forward.y, 0],
      [0, forward.y, 1],
      [0, forward.y, -1],
    ];
  }
  return [
    [0, 0, forward.z],
    [0, 1, forward.z],
    [0, -1, forward.z],
  ];
}

function getDuelEnPassantMove(matchState, piece, forward) {
  const target = matchState?.enPassantTarget;
  if (!target || target.eligiblePlayer !== piece.owner || !target.captureSquare || !target.passedThroughSquare) {
    return null;
  }

  const axis = getPawnPrimaryAxis(forward);
  if (axis !== "z") {
    return null;
  }

  const destination = Coord3.from(target.passedThroughSquare);
  const captureSquare = Coord3.from(target.captureSquare);
  const vulnerablePawn = matchState.pieces.find((candidate) => candidate.id === target.vulnerablePawnId && candidate.alive);
  if (!vulnerablePawn) {
    return null;
  }

  const expectedZ = piece.coord.z + forward.z;
  if (destination.z !== expectedZ || destination.y !== piece.coord.y) {
    return null;
  }

  if (Math.abs(destination.x - piece.coord.x) !== 1) {
    return null;
  }

  if (captureSquare.x !== destination.x || captureSquare.y !== destination.y || captureSquare.z !== piece.coord.z) {
    return null;
  }

  return buildSpecialMove(buildMove(piece, destination), {
    special: "en_passant",
    captureSquare: captureSquare.toJSON(),
    capturedPieceId: vulnerablePawn.id,
  });
}

function generatePawnMoves(matchState, piece, occupancyMap) {
  const moves = [];
  const forward = getPawnForwardVector(piece);
  const advanceOffsets = getPawnAdvanceOffsets(forward);

  for (let index = 0; index < advanceOffsets.length; index += 1) {
    const [dx, dy, dz] = advanceOffsets[index];
    const destination = maybeCoord(piece.coord, dx, dy, dz, 1);
    if (!destination || occupancyMap.tryGetPieceAt(destination)) {
      continue;
    }

    moves.push(buildMove(piece, destination));

    const isStraightAdvance = index === 0;
    if (!isStraightAdvance || !isPawnStartCoord(piece, forward)) {
      continue;
    }

    const twoForward = maybeCoord(piece.coord, dx, dy, dz, 2);
    if (twoForward && !occupancyMap.tryGetPieceAt(twoForward)) {
      moves.push(buildMove(piece, twoForward));
    }
  }

  for (const [dx, dy, dz] of getPawnCaptureOffsets(forward)) {
    const destination = maybeCoord(piece.coord, dx, dy, dz, 1);
    if (!destination) {
      continue;
    }

    const occupant = occupancyMap.tryGetPieceAt(destination);
    if (occupant && isEnemy(piece, occupant)) {
      moves.push(buildMove(piece, destination, occupant));
    }
  }

  if (isDuelMatch(matchState)) {
    const enPassantMove = getDuelEnPassantMove(matchState, piece, forward);
    if (enPassantMove) {
      moves.push(enPassantMove);
    }
  }

  return moves;
}

function getDuelCastleMoves(matchState, occupancyMap, piece) {
  if (piece.type !== PIECE_TYPES.King || piece.hasMoved || isPlayerKingUnderThreat(matchState, occupancyMap, piece.owner)) {
    return [];
  }

  const candidates = [];
  const rooks = matchState.pieces
    .filter((candidate) => candidate.alive && candidate.owner === piece.owner && candidate.type === PIECE_TYPES.Rook && !candidate.hasMoved)
    .sort((a, b) => a.coord.x - b.coord.x);

  for (const rook of rooks) {
    if (rook.coord.y !== piece.coord.y || rook.coord.z !== piece.coord.z) {
      continue;
    }

    const direction = Math.sign(rook.coord.x - piece.coord.x);
    if (direction === 0) {
      continue;
    }

    const kingDestinationX = piece.coord.x + (2 * direction);
    if (!Coord3.inBounds(kingDestinationX, piece.coord.y, piece.coord.z)) {
      continue;
    }

    const rookDestinationX = kingDestinationX - direction;
    if (!Coord3.inBounds(rookDestinationX, piece.coord.y, piece.coord.z)) {
      continue;
    }

    let pathClear = true;
    for (let x = piece.coord.x + direction; x !== rook.coord.x; x += direction) {
      if (occupancyMap.tryGetPieceAt(new Coord3(x, piece.coord.y, piece.coord.z))) {
        pathClear = false;
        break;
      }
    }
    if (!pathClear) {
      continue;
    }

    const transitSquares = [
      new Coord3(piece.coord.x + direction, piece.coord.y, piece.coord.z),
      new Coord3(kingDestinationX, piece.coord.y, piece.coord.z),
    ];
    if (transitSquares.some((square) => isSquareThreatenedByOpponents(matchState, occupancyMap, square, piece.owner))) {
      continue;
    }

    candidates.push(buildSpecialMove(buildMove(piece, transitSquares[1]), {
      special: "castle",
      rookMove: {
        pieceId: rook.id,
        from: rook.coord.toJSON(),
        to: new Coord3(rookDestinationX, rook.coord.y, rook.coord.z).toJSON(),
      },
    }));
  }

  return candidates;
}

function generateSlidingThreatCoords(piece, occupancyMap, directions) {
  const threatened = [];

  for (const [dx, dy, dz] of directions) {
    let step = 1;
    while (true) {
      const destination = maybeCoord(piece.coord, dx, dy, dz, step);
      if (!destination) {
        break;
      }

      threatened.push(destination);
      if (occupancyMap.tryGetPieceAt(destination)) {
        break;
      }

      step += 1;
    }
  }

  return threatened;
}

function generateJumpThreatCoords(piece, offsets) {
  const threatened = [];

  for (const [dx, dy, dz] of offsets) {
    const destination = maybeCoord(piece.coord, dx, dy, dz, 1);
    if (destination) {
      threatened.push(destination);
    }
  }

  return threatened;
}

function generatePawnThreatCoords(piece) {
  const threatened = [];
  const forward = getPawnForwardVector(piece);

  for (const [dx, dy, dz] of getPawnCaptureOffsets(forward)) {
    const destination = maybeCoord(piece.coord, dx, dy, dz, 1);
    if (destination) {
      threatened.push(destination);
    }
  }

  return threatened;
}

export function getThreatenedCoordsForPiece(matchState, occupancyMap, pieceId) {
  const piece = getPieceById(matchState, pieceId);

  switch (piece.type) {
    case PIECE_TYPES.Rook:
      return generateSlidingThreatCoords(piece, occupancyMap, ROOK_DIRECTIONS);
    case PIECE_TYPES.Bishop:
      return generateSlidingThreatCoords(piece, occupancyMap, BISHOP_DIRECTIONS);
    case PIECE_TYPES.Queen:
      return generateSlidingThreatCoords(piece, occupancyMap, QUEEN_DIRECTIONS);
    case PIECE_TYPES.Knight:
      return generateJumpThreatCoords(piece, KNIGHT_OFFSETS);
    case PIECE_TYPES.King:
      return generateJumpThreatCoords(piece, KING_DIRECTIONS);
    case PIECE_TYPES.Pawn:
      return generatePawnThreatCoords(piece);
    default:
      throw new Error(`Unsupported piece type: ${piece.type}`);
  }
}

function generatePseudoLegalMoveRecords(matchState, occupancyMap, pieceId) {
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
      if (isDuelMatch(matchState)) {
        rawMoves.push(...getDuelCastleMoves(matchState, occupancyMap, piece));
      }
      break;
    case PIECE_TYPES.Pawn:
      rawMoves = generatePawnMoves(matchState, piece, occupancyMap);
      break;
    default:
      throw new Error(`Unsupported piece type: ${piece.type}`);
  }

  return finalizeMoves(rawMoves);
}

function isDuelMatch(matchState) {
  return matchState?.gameModeId === GameModeId.Duel2P;
}

function cloneMatchContext(matchState) {
  const pieces = matchState.pieces.map((piece) => new Piece({
    id: piece.id,
    owner: piece.owner,
    type: piece.type,
    coord: Coord3.from(piece.coord),
    alive: piece.alive,
    forward: piece.forward,
    hasMoved: piece.hasMoved,
  }));

  const clone = new MatchState({
    pieces,
    activePlayer: matchState.activePlayer,
    eliminatedPlayers: [...matchState.eliminatedPlayers],
    turnCount: matchState.turnCount,
    lastMove: matchState.lastMove,
    turnOrder: [...(matchState.turnOrder ?? [])],
    gameModeId: matchState.gameModeId,
    resultType: matchState.resultType ?? null,
    enPassantTarget: matchState.enPassantTarget ? { ...matchState.enPassantTarget } : null,
  });

  const occupancy = new OccupancyMap();
  for (const piece of pieces) {
    if (piece.alive) {
      occupancy.place(piece);
    }
  }

  return { matchState: clone, occupancyMap: occupancy };
}

function applyPseudoLegalMoveToClone(matchState, occupancyMap, move) {
  const piece = matchState.pieces.find((candidate) => candidate.alive && candidate.id === move.pieceId);
  if (!piece) {
    return false;
  }

  const destination = Coord3.from(move.to);
  const isEnPassant = move.special === "en_passant";
  const captureSquare = isEnPassant ? Coord3.from(move.captureSquare ?? move.to) : destination;
  const target = occupancyMap.tryGetPieceAt(captureSquare);
  if (target && target.owner === piece.owner) {
    return false;
  }

  if (target) {
    target.alive = false;
    occupancyMap.remove(target.id);
  } else if (isEnPassant) {
    return false;
  }

  if (!occupancyMap.move(piece, destination)) {
    return false;
  }

  if (move.special === "castle" && move.rookMove) {
    const rook = matchState.pieces.find((candidate) => candidate.alive && candidate.id === move.rookMove.pieceId);
    if (!rook) {
      return false;
    }
    if (!occupancyMap.move(rook, Coord3.from(move.rookMove.to))) {
      return false;
    }
    rook.hasMoved = true;
  }

  piece.hasMoved = true;
  return true;
}

function findAliveKing(matchState, player) {
  return matchState.pieces.find((piece) => piece.alive && piece.owner === player && piece.type === PIECE_TYPES.King) ?? null;
}

function isSquareThreatenedByPlayer(matchState, occupancyMap, square, player) {
  const enemyPieces = matchState.pieces
    .filter((piece) => piece.alive && piece.owner === player)
    .sort((a, b) => a.id.localeCompare(b.id));

  const squareKey = Coord3.from(square).key();
  for (const piece of enemyPieces) {
    const threatened = getThreatenedCoordsForPiece(matchState, occupancyMap, piece.id);
    if (threatened.some((coord) => coord.key() === squareKey)) {
      return true;
    }
  }

  return false;
}

function isSquareThreatenedByOpponents(matchState, occupancyMap, square, player) {
  const opponents = [...new Set(
    matchState.pieces
      .filter((piece) => piece.alive && piece.owner !== player && !matchState.eliminatedPlayers.has(piece.owner))
      .map((piece) => piece.owner)
  )].sort((a, b) => a.localeCompare(b));

  for (const opponent of opponents) {
    if (isSquareThreatenedByPlayer(matchState, occupancyMap, square, opponent)) {
      return true;
    }
  }

  return false;
}

export function isPlayerKingUnderThreat(matchState, occupancyMap, player) {
  const king = findAliveKing(matchState, player);
  if (!king) {
    return true;
  }
  return isSquareThreatenedByOpponents(matchState, occupancyMap, king.coord, player);
}

function filterMovesLeavingKingExposed(matchState, occupancyMap, player, pseudoMoves) {
  const legalMoves = [];

  for (const move of pseudoMoves) {
    const clone = cloneMatchContext(matchState);
    if (!applyPseudoLegalMoveToClone(clone.matchState, clone.occupancyMap, move)) {
      continue;
    }

    if (!isPlayerKingUnderThreat(clone.matchState, clone.occupancyMap, player)) {
      legalMoves.push(move);
    }
  }

  return legalMoves;
}

export function getPseudoLegalMoves(matchState, occupancyMap, pieceId) {
  return generatePseudoLegalMoveRecords(matchState, occupancyMap, pieceId).map((move) => move.to);
}

export function getLegalMoves(matchState, occupancyMap, pieceId) {
  const piece = getPieceById(matchState, pieceId);
  const pseudoMoves = generatePseudoLegalMoveRecords(matchState, occupancyMap, pieceId);

  if (!isDuelMatch(matchState)) {
    return pseudoMoves;
  }

  return filterMovesLeavingKingExposed(matchState, occupancyMap, piece.owner, pseudoMoves);
}
