import test from "node:test";
import assert from "node:assert/strict";

import { PlayerId } from "../../Runtime/Core/GameState/constants.js";
import { generateStartingPieces } from "../../Runtime/Core/Formation/formationGenerator.js";

const PLAYERS = [PlayerId.Yellow, PlayerId.Red, PlayerId.Purple, PlayerId.Blue,
  PlayerId.Green, PlayerId.Orange, PlayerId.Pink, PlayerId.Cyan];

test("Starting formation creates 32 unique, in-bounds pieces", () => {
  const pieces = generateStartingPieces();
  assert.equal(pieces.length, 64);

  const ids = new Set();
  const coords = new Set();

  for (const piece of pieces) {
    ids.add(piece.id);
    coords.add(piece.coord.key());

    assert.ok(piece.coord.x >= 0 && piece.coord.x <= 7);
    assert.ok(piece.coord.y >= 0 && piece.coord.y <= 7);
    assert.ok(piece.coord.z >= 0 && piece.coord.z <= 7);
  }

  assert.equal(ids.size, 64);
  assert.equal(coords.size, 64);
});

test("Starting formation places exactly 8 pieces per player", () => {
  const pieces = generateStartingPieces();

  for (const player of PLAYERS) {
    const count = pieces.filter((p) => p.owner === player).length;
    assert.equal(count, 8, `${player} should have 8 pieces`);
  }
});
