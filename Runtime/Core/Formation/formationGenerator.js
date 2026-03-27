import { Coord3 } from "../GameState/coord3.js";
import { Piece, pieceId } from "../GameState/piece.js";
import { PIECE_TYPES, PlayerId } from "../GameState/constants.js";

const CORNERS = Object.freeze({
  [PlayerId.Yellow]: new Coord3(0, 7, 0),
  [PlayerId.Red]: new Coord3(7, 0, 7),
  [PlayerId.Blue]: new Coord3(0, 0, 0),
  [PlayerId.Purple]: new Coord3(7, 7, 7),
});

function inwardStep(value) {
  return value === 0 ? 1 : -1;
}

function offset(corner, x, y, z) {
  const sx = inwardStep(corner.x);
  const sy = inwardStep(corner.y);
  const sz = inwardStep(corner.z);
  return corner.withDelta(x * sx, y * sy, z * sz);
}

export function generateStartingPieces() {
  const allPieces = [];

  for (const owner of [PlayerId.Yellow, PlayerId.Red, PlayerId.Purple, PlayerId.Blue]) {
    const corner = CORNERS[owner];
    const pieces = [
      new Piece({ id: pieceId(owner, PIECE_TYPES.King, 0), owner, type: PIECE_TYPES.King, coord: corner }),

      new Piece({ id: pieceId(owner, PIECE_TYPES.Queen, 0), owner, type: PIECE_TYPES.Queen, coord: offset(corner, 1, 0, 0) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Bishop, 0), owner, type: PIECE_TYPES.Bishop, coord: offset(corner, 0, 1, 0) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Bishop, 1), owner, type: PIECE_TYPES.Bishop, coord: offset(corner, 0, 0, 1) }),

      new Piece({ id: pieceId(owner, PIECE_TYPES.Rook, 0), owner, type: PIECE_TYPES.Rook, coord: offset(corner, 1, 1, 0) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Rook, 1), owner, type: PIECE_TYPES.Rook, coord: offset(corner, 1, 0, 1) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Knight, 0), owner, type: PIECE_TYPES.Knight, coord: offset(corner, 0, 1, 1) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Knight, 1), owner, type: PIECE_TYPES.Knight, coord: offset(corner, 1, 1, 1) }),
    ];

    allPieces.push(...pieces);
  }

  return allPieces;
}

