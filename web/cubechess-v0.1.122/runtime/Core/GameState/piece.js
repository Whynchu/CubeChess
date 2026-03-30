import { PIECE_TYPES, PlayerId } from "./constants.js";
import { Coord3 } from "./coord3.js";

const VALID_PLAYERS = new Set(Object.values(PlayerId));
const VALID_TYPES = new Set(Object.values(PIECE_TYPES));

function normalizeForward(forward) {
  if (!forward) {
    return null;
  }

  const x = Number(forward.x ?? 0);
  const y = Number(forward.y ?? 0);
  const z = Number(forward.z ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new Error("Piece forward vector must be numeric when provided");
  }

  return Object.freeze({ x, y, z });
}

export class Piece {
  constructor({ id, owner, type, coord, alive = true, forward = null, hasMoved = false }) {
    if (!id || typeof id !== "string") {
      throw new Error("Piece id must be a non-empty string");
    }
    if (!VALID_PLAYERS.has(owner)) {
      throw new Error(`Invalid owner: ${owner}`);
    }
    if (!VALID_TYPES.has(type)) {
      throw new Error(`Invalid type: ${type}`);
    }

    this.id = id;
    this.owner = owner;
    this.type = type;
    this.coord = coord instanceof Coord3 ? coord : Coord3.from(coord);
    this.alive = Boolean(alive);
    this.forward = normalizeForward(forward);
    this.hasMoved = Boolean(hasMoved);
  }

  toJSON() {
    return {
      id: this.id,
      owner: this.owner,
      type: this.type,
      coord: this.coord.toJSON(),
      alive: this.alive,
      forward: this.forward ? { ...this.forward } : null,
      hasMoved: this.hasMoved,
    };
  }
}

export function pieceId(owner, type, index) {
  const n = String(index).padStart(2, "0");
  return `${owner}-${type}-${n}`;
}
