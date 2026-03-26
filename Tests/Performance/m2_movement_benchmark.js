import { performance } from "node:perf_hooks";

import { Coord3 } from "../../Runtime/Core/GameState/coord3.js";
import { MatchState } from "../../Runtime/Core/GameState/matchState.js";
import { OccupancyMap } from "../../Runtime/Core/GameState/occupancyMap.js";
import { Piece } from "../../Runtime/Core/GameState/piece.js";
import { PIECE_TYPES, PlayerId } from "../../Runtime/Core/GameState/constants.js";
import { getLegalMoves } from "../../Runtime/Core/Rules/legalMoves.js";

const TYPES = [
  PIECE_TYPES.Rook,
  PIECE_TYPES.Bishop,
  PIECE_TYPES.Queen,
  PIECE_TYPES.Knight,
  PIECE_TYPES.King,
];

function makePiece(i, owner, type, x, y, z) {
  return new Piece({ id: `${owner}-${type}-${String(i).padStart(2, "0")}`, owner, type, coord: new Coord3(x, y, z) });
}

function buildScenario(name, coordsPerPlayer) {
  const players = [PlayerId.Yellow, PlayerId.Red, PlayerId.Purple, PlayerId.Blue];
  const pieces = [];
  let idx = 0;

  for (let p = 0; p < players.length; p += 1) {
    const owner = players[p];
    const coords = coordsPerPlayer[p] || [];
    for (let c = 0; c < coords.length; c += 1) {
      const type = TYPES[c % TYPES.length];
      const [x, y, z] = coords[c];
      pieces.push(makePiece(idx++, owner, type, x, y, z));
    }
  }

  const occupancyMap = new OccupancyMap();
  for (const piece of pieces) {
    occupancyMap.place(piece);
  }

  const matchState = new MatchState({
    pieces,
    activePlayer: PlayerId.Yellow,
    eliminatedPlayers: [],
    turnCount: 0,
    lastMove: null,
  });

  return { name, matchState, occupancyMap };
}

const scenarios = [
  buildScenario("low_density", [
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
    [[7, 7, 7], [6, 7, 7], [7, 6, 7]],
    [[0, 7, 0], [1, 7, 0], [0, 6, 0]],
    [[7, 0, 7], [6, 0, 7], [7, 1, 7]],
  ]),
  buildScenario("medium_density", [
    [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [1, 1, 1]],
    [[7, 7, 7], [6, 7, 7], [7, 6, 7], [6, 6, 7], [6, 6, 6]],
    [[0, 7, 0], [1, 7, 0], [0, 6, 0], [1, 6, 0], [1, 6, 1]],
    [[7, 0, 7], [6, 0, 7], [7, 1, 7], [6, 1, 7], [6, 1, 6]],
  ]),
  buildScenario("high_density", [
    [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]],
    [[7, 7, 7], [6, 7, 7], [7, 6, 7], [6, 6, 7], [7, 7, 6], [6, 7, 6], [7, 6, 6], [6, 6, 6]],
    [[0, 7, 0], [1, 7, 0], [0, 6, 0], [1, 6, 0], [0, 7, 1], [1, 7, 1], [0, 6, 1], [1, 6, 1]],
    [[7, 0, 7], [6, 0, 7], [7, 1, 7], [6, 1, 7], [7, 0, 6], [6, 0, 6], [7, 1, 6], [6, 1, 6]],
  ]),
];

function benchmarkScenario(scenario, iterations = 200) {
  const pieces = scenario.matchState.pieces;
  const started = performance.now();
  let moveCount = 0;

  for (let i = 0; i < iterations; i += 1) {
    for (const piece of pieces) {
      const moves = getLegalMoves(scenario.matchState, scenario.occupancyMap, piece.id);
      moveCount += moves.length;
    }
  }

  const elapsedMs = performance.now() - started;
  const evals = iterations * pieces.length;
  return {
    scenario: scenario.name,
    pieces: pieces.length,
    iterations,
    evaluations: evals,
    totalMovesEvaluated: moveCount,
    totalMs: Number(elapsedMs.toFixed(2)),
    avgMsPerPieceEval: Number((elapsedMs / evals).toFixed(4)),
  };
}

const results = scenarios.map((s) => benchmarkScenario(s));
console.table(results);
