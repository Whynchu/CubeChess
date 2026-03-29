import { Coord3 } from "../GameState/coord3.js";
import { Piece, pieceId } from "../GameState/piece.js";
import { PIECE_TYPES, PlayerId, TURN_ORDER } from "../GameState/constants.js";

const CORNERS = Object.freeze({
  [PlayerId.Yellow]: new Coord3(0, 7, 0),
  [PlayerId.Red]: new Coord3(7, 0, 7),
  [PlayerId.Blue]: new Coord3(0, 0, 0),
  [PlayerId.Purple]: new Coord3(7, 7, 7),
  [PlayerId.Orange]: new Coord3(7, 0, 0),
  [PlayerId.Green]: new Coord3(7, 7, 0),
  [PlayerId.Cyan]: new Coord3(0, 0, 7),
  [PlayerId.Pink]: new Coord3(0, 7, 7),
});

export const POSITION_ONE_CORNER = CORNERS[PlayerId.Yellow];

export const POSITION_ROTATION_ORDER = Object.freeze([
  PlayerId.Yellow,
  PlayerId.Red,
  PlayerId.Purple,
  PlayerId.Blue,
  PlayerId.Green,
  PlayerId.Cyan,
  PlayerId.Pink,
  PlayerId.Orange,
]);

function inwardStep(value) {
  return value === 0 ? 1 : -1;
}

function offset(corner, x, y, z) {
  const sx = inwardStep(corner.x);
  const sy = inwardStep(corner.y);
  const sz = inwardStep(corner.z);
  return corner.withDelta(x * sx, y * sy, z * sz);
}

function cloneCoord(coord) {
  return new Coord3(coord.x, coord.y, coord.z);
}

export function normalizeSeatOffset(seatOffset = 0) {
  const cycleLength = POSITION_ROTATION_ORDER.length;
  const normalized = Number.isFinite(seatOffset) ? Math.trunc(seatOffset) : 0;
  return ((normalized % cycleLength) + cycleLength) % cycleLength;
}

export function getStartingCornerAssignments(seatOffset = 0) {
  const normalizedOffset = normalizeSeatOffset(seatOffset);
  const assignments = {};

  for (let positionIndex = 0; positionIndex < POSITION_ROTATION_ORDER.length; positionIndex += 1) {
    const slotOwner = POSITION_ROTATION_ORDER[positionIndex];
    const occupant = POSITION_ROTATION_ORDER[(positionIndex + normalizedOffset) % POSITION_ROTATION_ORDER.length];
    assignments[occupant] = {
      slotOwner,
      coord: cloneCoord(CORNERS[slotOwner]),
    };
  }

  for (const owner of TURN_ORDER) {
    if (!assignments[owner]) {
      assignments[owner] = {
        slotOwner: owner,
        coord: cloneCoord(CORNERS[owner]),
      };
    }
  }

  return assignments;
}

export function generateStartingPieces({ seatOffset = 0 } = {}) {
  const allPieces = [];
  const assignments = getStartingCornerAssignments(seatOffset);

  for (const owner of TURN_ORDER) {
    const corner = assignments[owner]?.coord ?? cloneCoord(CORNERS[owner]);
    const pieces = [
      new Piece({ id: pieceId(owner, PIECE_TYPES.King, 0), owner, type: PIECE_TYPES.King, coord: cloneCoord(corner) }),

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
