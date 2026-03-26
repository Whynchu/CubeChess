import test from "node:test";
import assert from "node:assert/strict";

import { Coord3 } from "../../Runtime/Core/GameState/coord3.js";
import { Piece } from "../../Runtime/Core/GameState/piece.js";
import { OccupancyMap } from "../../Runtime/Core/GameState/occupancyMap.js";
import { PIECE_TYPES, PlayerId } from "../../Runtime/Core/GameState/constants.js";

function buildPiece(id, coord) {
  return new Piece({
    id,
    owner: PlayerId.Yellow,
    type: PIECE_TYPES.Rook,
    coord,
  });
}

test("OccupancyMap rejects duplicate placement", () => {
  const map = new OccupancyMap();
  const first = buildPiece("Yellow-Rook-00", new Coord3(1, 1, 1));
  const second = buildPiece("Yellow-Rook-01", new Coord3(1, 1, 1));

  assert.equal(map.place(first), true);
  assert.equal(map.place(second), false);
  assert.equal(map.size, 1);
});

test("OccupancyMap move updates source and destination atomically", () => {
  const map = new OccupancyMap();
  const piece = buildPiece("Yellow-Rook-00", new Coord3(1, 1, 1));
  assert.equal(map.place(piece), true);

  assert.equal(map.move(piece, new Coord3(2, 2, 2)), true);
  assert.equal(map.isOccupied(new Coord3(1, 1, 1)), false);
  assert.equal(map.isOccupied(new Coord3(2, 2, 2)), true);
  map.validateNoCollisions();
});
