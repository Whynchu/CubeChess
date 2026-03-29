import { Coord3 } from "./coord3.js";

export class OccupancyMap {
  constructor() {
    this.byCoord = new Map();
    this.byPiece = new Map();
  }

  static keyFromCoord(coord) {
    return coord instanceof Coord3 ? coord.key() : new Coord3(coord.x, coord.y, coord.z).key();
  }

  get size() {
    return this.byCoord.size;
  }

  isOccupied(coord) {
    return this.byCoord.has(OccupancyMap.keyFromCoord(coord));
  }

  tryGetPieceAt(coord) {
    return this.byCoord.get(OccupancyMap.keyFromCoord(coord)) ?? null;
  }

  place(piece) {
    const key = piece.coord.key();
    if (this.byCoord.has(key)) {
      return false;
    }

    this.byCoord.set(key, piece);
    this.byPiece.set(piece.id, piece.coord);
    return true;
  }

  remove(pieceId) {
    const coord = this.byPiece.get(pieceId);
    if (!coord) {
      return false;
    }

    this.byPiece.delete(pieceId);
    this.byCoord.delete(coord.key());
    return true;
  }

  move(piece, destination) {
    const dest = destination instanceof Coord3 ? destination : Coord3.from(destination);
    const sourceKey = piece.coord.key();
    const destKey = dest.key();

    if (!this.byCoord.has(sourceKey)) {
      throw new Error(`Cannot move missing source piece: ${piece.id}`);
    }
    if (this.byCoord.has(destKey)) {
      return false;
    }

    this.byCoord.delete(sourceKey);
    piece.coord = dest;
    this.byCoord.set(destKey, piece);
    this.byPiece.set(piece.id, dest);
    return true;
  }

  validateNoCollisions() {
    if (this.byCoord.size !== this.byPiece.size) {
      throw new Error("OccupancyMap index mismatch between coord and piece maps");
    }

    for (const [pieceId, coord] of this.byPiece.entries()) {
      const piece = this.byCoord.get(coord.key());
      if (!piece || piece.id !== pieceId) {
        throw new Error(`OccupancyMap collision detected for piece ${pieceId}`);
      }
    }
  }
}
