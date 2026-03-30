import { BOARD_SIZE } from "./constants.js";

export class Coord3 {
  constructor(x, y, z) {
    if (!Coord3.inBounds(x, y, z)) {
      throw new RangeError(`Out-of-bounds Coord3(${x}, ${y}, ${z})`);
    }

    this.x = x;
    this.y = y;
    this.z = z;
  }

  static inBounds(x, y, z) {
    return Number.isInteger(x)
      && Number.isInteger(y)
      && Number.isInteger(z)
      && x >= 0
      && x < BOARD_SIZE
      && y >= 0
      && y < BOARD_SIZE
      && z >= 0
      && z < BOARD_SIZE;
  }

  static from(obj) {
    return new Coord3(obj.x, obj.y, obj.z);
  }

  key() {
    return `${this.x},${this.y},${this.z}`;
  }

  equals(other) {
    return this.x === other.x && this.y === other.y && this.z === other.z;
  }

  withDelta(dx, dy, dz) {
    return new Coord3(this.x + dx, this.y + dy, this.z + dz);
  }

  toJSON() {
    return { x: this.x, y: this.y, z: this.z };
  }
}
