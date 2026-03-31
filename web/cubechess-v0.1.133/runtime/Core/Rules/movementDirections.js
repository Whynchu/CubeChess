import { Coord3 } from "../GameState/coord3.js";

function signPermutations(base) {
  const results = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        results.push([base[0] * sx, base[1] * sy, base[2] * sz]);
      }
    }
  }
  return results;
}

function uniqueOffsets(offsets) {
  const seen = new Set();
  const out = [];
  for (const [x, y, z] of offsets) {
    const key = `${x},${y},${z}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push([x, y, z]);
  }
  return out;
}

export const ROOK_DIRECTIONS = Object.freeze([
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]);

export const BISHOP_DIRECTIONS = Object.freeze([
  [1, 1, 0],
  [1, -1, 0],
  [-1, 1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [1, 0, -1],
  [-1, 0, 1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, 1, -1],
  [0, -1, 1],
  [0, -1, -1],
]);

export const QUEEN_DIRECTIONS = Object.freeze(
  uniqueOffsets(
    signPermutations([1, 1, 1])
      .concat(BISHOP_DIRECTIONS)
      .concat(ROOK_DIRECTIONS)
  )
);

export const KING_DIRECTIONS = Object.freeze([...QUEEN_DIRECTIONS]);

export const KNIGHT_OFFSETS = Object.freeze(
  uniqueOffsets([
    ...signPermutations([2, 1, 0]),
    ...signPermutations([2, 0, 1]),
    ...signPermutations([1, 2, 0]),
    ...signPermutations([1, 0, 2]),
    ...signPermutations([0, 2, 1]),
    ...signPermutations([0, 1, 2]),
  ])
);

export function directionVectorToCoord(origin, direction, distance = 1) {
  return new Coord3(
    origin.x + (direction[0] * distance),
    origin.y + (direction[1] * distance),
    origin.z + (direction[2] * distance)
  );
}
