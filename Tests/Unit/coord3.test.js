import test from "node:test";
import assert from "node:assert/strict";

import { Coord3 } from "../../Runtime/Core/GameState/coord3.js";

test("Coord3 validates bounds", () => {
  assert.doesNotThrow(() => new Coord3(0, 0, 0));
  assert.doesNotThrow(() => new Coord3(7, 7, 7));

  assert.throws(() => new Coord3(-1, 0, 0), /Out-of-bounds/);
  assert.throws(() => new Coord3(0, 8, 0), /Out-of-bounds/);
  assert.throws(() => new Coord3(0, 0, 999), /Out-of-bounds/);
});

test("Coord3 key and equality are deterministic", () => {
  const a = new Coord3(2, 3, 4);
  const b = new Coord3(2, 3, 4);
  const c = new Coord3(2, 3, 5);

  assert.equal(a.key(), "2,3,4");
  assert.equal(a.equals(b), true);
  assert.equal(a.equals(c), false);
});
