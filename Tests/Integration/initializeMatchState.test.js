import test from "node:test";
import assert from "node:assert/strict";

import { PlayerId } from "../../Runtime/Core/GameState/constants.js";
import { initializeMatchState } from "../../Runtime/Core/GameState/initializeMatchState.js";

test("initializeMatchState returns a valid deterministic opening state", () => {
  const first = initializeMatchState();
  const second = initializeMatchState();

  assert.equal(first.matchState.activePlayer, PlayerId.Yellow);
  assert.equal(first.matchState.turnCount, 0);
  assert.equal(first.matchState.lastMove, null);
  assert.equal(first.matchState.pieces.length, 32);
  assert.equal(first.occupancyMap.size, 32);

  const firstSerialized = JSON.stringify(first.matchState);
  const secondSerialized = JSON.stringify(second.matchState);
  assert.equal(firstSerialized, secondSerialized);
});
