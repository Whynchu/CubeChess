import { PIECE_TYPES, PlayerId } from "./constants.js";
import { Coord3 } from "./coord3.js";

const VALID_PLAYERS = new Set(Object.values(PlayerId));
const VALID_TYPES = new Set(Object.values(PIECE_TYPES));

export class Piece {
  constructor({ id, owner, type, coord, alive = true }) {
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
  }

  toJSON() {
    return {
      id: this.id,
      owner: this.owner,
      type: this.type,
      coord: this.coord.toJSON(),
      alive: this.alive,
    };
  }
}

export function pieceId(owner, type, index) {
  const n = String(index).padStart(2, "0");
  return `${owner}-${type}-${n}`;
}
