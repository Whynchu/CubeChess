import { Coord3 } from "../GameState/coord3.js";
import { Piece, pieceId } from "../GameState/piece.js";
import { PIECE_TYPES, PlayerId, TURN_ORDER } from "../GameState/constants.js";
import { GameModeId, getGameModeDefinition } from "../Modes/gameModes.js";

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

const DEFAULT_DUEL_PLAYERS = Object.freeze([PlayerId.Yellow, PlayerId.Red]);
const DUEL_TOP_WALL_Y = 7;
const DUEL_BOTTOM_WALL_Y = 0;
const DUEL_TOP_BACK_RANK_Z = 7;
const DUEL_TOP_PAWN_RANK_Y = 6;
const DUEL_TOP_PAWN_RANK_Z = 6;
const DUEL_BOTTOM_BACK_RANK_Z = 0;
const DUEL_BOTTOM_PAWN_RANK_Y = 1;
const DUEL_BOTTOM_PAWN_RANK_Z = 1;
const DUEL_BACK_RANK_ORDER = Object.freeze([
  PIECE_TYPES.Rook,
  PIECE_TYPES.Knight,
  PIECE_TYPES.Bishop,
  PIECE_TYPES.Queen,
  PIECE_TYPES.King,
  PIECE_TYPES.Bishop,
  PIECE_TYPES.Knight,
  PIECE_TYPES.Rook,
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

function createDuelPiece(owner, type, index, x, y, z, forward) {
  return new Piece({
    id: pieceId(owner, type, index),
    owner,
    type,
    coord: new Coord3(x, y, z),
    forward: type === PIECE_TYPES.Pawn ? { ...forward } : null,
  });
}

function resolveDuelPlayers(activePlayers = null) {
  if (Array.isArray(activePlayers) && activePlayers.length >= 2) {
    const [topPlayer, bottomPlayer] = activePlayers;
    if (TURN_ORDER.includes(topPlayer) && TURN_ORDER.includes(bottomPlayer) && topPlayer !== bottomPlayer) {
      return [topPlayer, bottomPlayer];
    }
  }
  return [...DEFAULT_DUEL_PLAYERS];
}

export function normalizeSeatOffset(seatOffset = 0) {
  const cycleLength = POSITION_ROTATION_ORDER.length;
  const normalized = Number.isFinite(seatOffset) ? Math.trunc(seatOffset) : 0;
  return ((normalized % cycleLength) + cycleLength) % cycleLength;
}

function normalizeModeSeatOffset(gameModeId = GameModeId.Chaos8P, seatOffset = 0) {
  const rotationLength = Math.max(1, getGameModeDefinition(gameModeId).seatRotationLength ?? POSITION_ROTATION_ORDER.length);
  const normalized = Number.isFinite(seatOffset) ? Math.trunc(seatOffset) : 0;
  return ((normalized % rotationLength) + rotationLength) % rotationLength;
}

export function getTurnOrderForSeatOffset(seatOffset = 0) {
  const normalizedOffset = normalizeSeatOffset(seatOffset);
  return Object.freeze(
    POSITION_ROTATION_ORDER.map((_, positionIndex) => POSITION_ROTATION_ORDER[(positionIndex + normalizedOffset) % POSITION_ROTATION_ORDER.length])
  );
}

export function getTurnOrderForMode({ gameModeId = GameModeId.Chaos8P, seatOffset = 0, activePlayers = null } = {}) {
  if (gameModeId === GameModeId.Duel2P) {
    return Object.freeze([...resolveDuelPlayers(activePlayers)]);
  }
  return getTurnOrderForSeatOffset(seatOffset);
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

function getDuelStartingAssignments(activePlayers = null) {
  const [topPlayer, bottomPlayer] = resolveDuelPlayers(activePlayers);
  return {
    [topPlayer]: {
      slotOwner: PlayerId.Yellow,
      coord: new Coord3(4, DUEL_TOP_WALL_Y, DUEL_TOP_BACK_RANK_Z),
    },
    [bottomPlayer]: {
      slotOwner: PlayerId.Red,
      coord: new Coord3(4, DUEL_BOTTOM_WALL_Y, DUEL_BOTTOM_BACK_RANK_Z),
    },
  };
}

export function getStartingAssignmentsForMode({ gameModeId = GameModeId.Chaos8P, seatOffset = 0, activePlayers = null } = {}) {
  if (gameModeId === GameModeId.Duel2P) {
    return getDuelStartingAssignments(activePlayers);
  }
  return getStartingCornerAssignments(seatOffset);
}

export function generateStartingPieces({ seatOffset = 0 } = {}) {
  const allPieces = [];
  const assignments = getStartingCornerAssignments(seatOffset);

  for (const owner of TURN_ORDER) {
    const corner = assignments[owner]?.coord ?? cloneCoord(CORNERS[owner]);
    const pieces = [
      new Piece({ id: pieceId(owner, PIECE_TYPES.King, 0), owner, type: PIECE_TYPES.King, coord: cloneCoord(corner) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Knight, 0), owner, type: PIECE_TYPES.Knight, coord: offset(corner, 1, 0, 0) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Knight, 1), owner, type: PIECE_TYPES.Knight, coord: offset(corner, 0, 1, 0) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Bishop, 1), owner, type: PIECE_TYPES.Bishop, coord: offset(corner, 0, 0, 1) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Rook, 0), owner, type: PIECE_TYPES.Rook, coord: offset(corner, 1, 1, 0) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Rook, 1), owner, type: PIECE_TYPES.Rook, coord: offset(corner, 1, 0, 1) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Queen, 0), owner, type: PIECE_TYPES.Queen, coord: offset(corner, 0, 1, 1) }),
      new Piece({ id: pieceId(owner, PIECE_TYPES.Bishop, 0), owner, type: PIECE_TYPES.Bishop, coord: offset(corner, 1, 1, 1) }),
    ];

    allPieces.push(...pieces);
  }

  return allPieces;
}

function generateDuelStartingPieces(activePlayers = null) {
  const [topPlayer, bottomPlayer] = resolveDuelPlayers(activePlayers);
  const pieces = [];

  for (let x = 0; x < DUEL_BACK_RANK_ORDER.length; x += 1) {
    const backType = DUEL_BACK_RANK_ORDER[x];
    const backIndex = backType === PIECE_TYPES.Rook || backType === PIECE_TYPES.Knight || backType === PIECE_TYPES.Bishop
      ? (x < 4 ? 0 : 1)
      : 0;

    pieces.push(createDuelPiece(topPlayer, backType, backIndex, x, DUEL_TOP_WALL_Y, DUEL_TOP_BACK_RANK_Z, { x: 0, y: 0, z: -1 }));
    pieces.push(createDuelPiece(bottomPlayer, backType, backIndex, x, DUEL_BOTTOM_WALL_Y, DUEL_BOTTOM_BACK_RANK_Z, { x: 0, y: 0, z: 1 }));
  }

  for (let x = 0; x < 8; x += 1) {
    pieces.push(createDuelPiece(topPlayer, PIECE_TYPES.Pawn, x, x, DUEL_TOP_PAWN_RANK_Y, DUEL_TOP_PAWN_RANK_Z, { x: 0, y: 0, z: -1 }));
    pieces.push(createDuelPiece(bottomPlayer, PIECE_TYPES.Pawn, x, x, DUEL_BOTTOM_PAWN_RANK_Y, DUEL_BOTTOM_PAWN_RANK_Z, { x: 0, y: 0, z: 1 }));
  }

  return pieces;
}

export function generateStartingPiecesForMode({ gameModeId = GameModeId.Chaos8P, seatOffset = 0, activePlayers = null } = {}) {
  if (gameModeId === GameModeId.Duel2P) {
    return generateDuelStartingPieces(activePlayers);
  }
  return generateStartingPieces({ seatOffset });
}
