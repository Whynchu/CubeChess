import assert from "node:assert/strict";

import { Coord3 } from "../Runtime/Core/GameState/coord3.js";
import { Piece } from "../Runtime/Core/GameState/piece.js";
import { OccupancyMap } from "../Runtime/Core/GameState/occupancyMap.js";
import { PIECE_TYPES, PlayerId } from "../Runtime/Core/GameState/constants.js";
import { MatchState } from "../Runtime/Core/GameState/matchState.js";
import { generateStartingPieces } from "../Runtime/Core/Formation/formationGenerator.js";
import { initializeMatchState } from "../Runtime/Core/GameState/initializeMatchState.js";
import {
  BISHOP_DIRECTIONS,
  KING_DIRECTIONS,
  KNIGHT_OFFSETS,
  QUEEN_DIRECTIONS,
  ROOK_DIRECTIONS,
} from "../Runtime/Core/Rules/movementDirections.js";
import { getLegalMoves } from "../Runtime/Core/Rules/legalMoves.js";
import { TurnPhase, TurnStateMachine } from "../Runtime/Core/Turn/index.js";
import {
  ControllerType,
  createSeatConfig,
  presetAllAI,
  presetOneHumanThreeAI,
  presetTwoHumanTwoAI,
} from "../Runtime/Core/Seats/index.js";

const pendingTests = [];

function run(name, fn) {
  const testPromise = Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`PASS ${name}`);
    })
    .catch((error) => {
      console.error(`FAIL ${name}`);
      console.error(error);
      process.exitCode = 1;
    });

  pendingTests.push(testPromise);
}

function buildPiece(id, owner, type, x, y, z) {
  return new Piece({ id, owner, type, coord: new Coord3(x, y, z) });
}

function buildScenario(pieces, activePlayer = PlayerId.Yellow) {
  const occupancyMap = new OccupancyMap();
  for (const piece of pieces) {
    const placed = occupancyMap.place(piece);
    if (!placed) {
      throw new Error(`Scenario collision for ${piece.id}`);
    }
  }

  const matchState = new MatchState({
    pieces,
    activePlayer,
    eliminatedPlayers: [],
    turnCount: 0,
    lastMove: null,
  });

  return { matchState, occupancyMap };
}

function hasMoveTo(moves, x, y, z) {
  return moves.some((m) => m.to.x === x && m.to.y === y && m.to.z === z);
}

function assertSortedByXYZ(moves) {
  for (let i = 1; i < moves.length; i += 1) {
    const a = moves[i - 1].to;
    const b = moves[i].to;
    const isSorted = (a.x < b.x)
      || (a.x === b.x && a.y < b.y)
      || (a.x === b.x && a.y === b.y && a.z <= b.z);
    assert.equal(isSorted, true, `Moves are not sorted at index ${i}`);
  }
}

run("Coord3 validates bounds", () => {
  assert.doesNotThrow(() => new Coord3(0, 0, 0));
  assert.doesNotThrow(() => new Coord3(7, 7, 7));
  assert.throws(() => new Coord3(-1, 0, 0));
  assert.throws(() => new Coord3(0, 8, 0));
  assert.throws(() => new Coord3(0, 0, 8));
});

run("Coord3 equality and key", () => {
  const a = new Coord3(2, 3, 4);
  const b = new Coord3(2, 3, 4);
  const c = new Coord3(2, 3, 5);
  assert.equal(a.key(), "2,3,4");
  assert.equal(a.equals(b), true);
  assert.equal(a.equals(c), false);
});

run("Formation creates 64 unique pieces and coords", () => {
  const pieces = generateStartingPieces();
  assert.equal(pieces.length, 64);

  const ids = new Set(pieces.map((p) => p.id));
  const coords = new Set(pieces.map((p) => p.coord.key()));
  assert.equal(ids.size, 64);
  assert.equal(coords.size, 64);

  for (const piece of pieces) {
    assert.ok(piece.coord.x >= 0 && piece.coord.x <= 7);
    assert.ok(piece.coord.y >= 0 && piece.coord.y <= 7);
    assert.ok(piece.coord.z >= 0 && piece.coord.z <= 7);
  }
});

run("Formation creates 8 pieces per player", () => {
  const pieces = generateStartingPieces();
  for (const player of [PlayerId.Yellow, PlayerId.Red, PlayerId.Purple, PlayerId.Blue,
    PlayerId.Green, PlayerId.Orange, PlayerId.Pink, PlayerId.Cyan]) {
    assert.equal(pieces.filter((p) => p.owner === player).length, 8);
  }
});

run("OccupancyMap rejects duplicates", () => {
  const map = new OccupancyMap();
  const a = buildPiece("Yellow-Rook-00", PlayerId.Yellow, PIECE_TYPES.Rook, 1, 1, 1);
  const b = buildPiece("Yellow-Rook-01", PlayerId.Yellow, PIECE_TYPES.Rook, 1, 1, 1);

  assert.equal(map.place(a), true);
  assert.equal(map.place(b), false);
});

run("OccupancyMap move updates source and destination", () => {
  const map = new OccupancyMap();
  const piece = buildPiece("Yellow-Rook-00", PlayerId.Yellow, PIECE_TYPES.Rook, 1, 1, 1);
  assert.equal(map.place(piece), true);
  assert.equal(map.move(piece, new Coord3(2, 2, 2)), true);
  assert.equal(map.isOccupied(new Coord3(1, 1, 1)), false);
  assert.equal(map.isOccupied(new Coord3(2, 2, 2)), true);
  map.validateNoCollisions();
});

run("initializeMatchState is deterministic and valid", () => {
  const first = initializeMatchState();
  const second = initializeMatchState();

  assert.equal(first.matchState.activePlayer, PlayerId.Yellow);
  assert.equal(first.matchState.turnCount, 0);
  assert.equal(first.matchState.lastMove, null);
  assert.equal(first.matchState.pieces.length, 64);
  assert.equal(first.occupancyMap.size, 64);

  assert.equal(JSON.stringify(first.matchState), JSON.stringify(second.matchState));
});

run("Direction tables have canonical counts", () => {
  assert.equal(ROOK_DIRECTIONS.length, 6);
  assert.equal(BISHOP_DIRECTIONS.length, 12);
  assert.equal(QUEEN_DIRECTIONS.length, 26);
  assert.equal(KING_DIRECTIONS.length, 26);
  assert.equal(KNIGHT_OFFSETS.length, 24);
});

run("Rook open-board center move count is 21", () => {
  const rook = buildPiece("Yellow-Rook-00", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const { matchState, occupancyMap } = buildScenario([rook]);
  const moves = getLegalMoves(matchState, occupancyMap, rook.id);
  assert.equal(moves.length, 21);
  assertSortedByXYZ(moves);
});

run("Bishop open-board center move count is 39", () => {
  const bishop = buildPiece("Yellow-Bishop-00", PlayerId.Yellow, PIECE_TYPES.Bishop, 3, 3, 3);
  const { matchState, occupancyMap } = buildScenario([bishop]);
  const moves = getLegalMoves(matchState, occupancyMap, bishop.id);
  assert.equal(moves.length, 39);
  assertSortedByXYZ(moves);
});

run("Queen open-board center move count is 85", () => {
  const queen = buildPiece("Yellow-Queen-00", PlayerId.Yellow, PIECE_TYPES.Queen, 3, 3, 3);
  const { matchState, occupancyMap } = buildScenario([queen]);
  const moves = getLegalMoves(matchState, occupancyMap, queen.id);
  assert.equal(moves.length, 85);
  assertSortedByXYZ(moves);
});

run("Knight center move count is 24 and corner move count is 6", () => {
  const centerKnight = buildPiece("Yellow-Knight-00", PlayerId.Yellow, PIECE_TYPES.Knight, 3, 3, 3);
  const cornerKnight = buildPiece("Yellow-Knight-01", PlayerId.Yellow, PIECE_TYPES.Knight, 0, 0, 0);

  let scenario = buildScenario([centerKnight]);
  assert.equal(getLegalMoves(scenario.matchState, scenario.occupancyMap, centerKnight.id).length, 24);

  scenario = buildScenario([cornerKnight]);
  assert.equal(getLegalMoves(scenario.matchState, scenario.occupancyMap, cornerKnight.id).length, 6);
});

run("King center move count is 26 and corner move count is 7", () => {
  const centerKing = buildPiece("Yellow-King-00", PlayerId.Yellow, PIECE_TYPES.King, 3, 3, 3);
  const cornerKing = buildPiece("Yellow-King-01", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);

  let scenario = buildScenario([centerKing]);
  assert.equal(getLegalMoves(scenario.matchState, scenario.occupancyMap, centerKing.id).length, 26);

  scenario = buildScenario([cornerKing]);
  assert.equal(getLegalMoves(scenario.matchState, scenario.occupancyMap, cornerKing.id).length, 7);
});

run("Rook blocking and capture behavior is correct", () => {
  const rook = buildPiece("Yellow-Rook-00", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const friendly = buildPiece("Yellow-Bishop-00", PlayerId.Yellow, PIECE_TYPES.Bishop, 5, 3, 3);
  const enemy = buildPiece("Red-Bishop-00", PlayerId.Red, PIECE_TYPES.Bishop, 1, 3, 3);

  const { matchState, occupancyMap } = buildScenario([rook, friendly, enemy]);
  const moves = getLegalMoves(matchState, occupancyMap, rook.id);

  assert.equal(hasMoveTo(moves, 4, 3, 3), true, "rook should move until friendly blocker");
  assert.equal(hasMoveTo(moves, 5, 3, 3), false, "rook cannot move into friendly blocker");

  assert.equal(hasMoveTo(moves, 2, 3, 3), true, "rook can move toward enemy blocker");
  assert.equal(hasMoveTo(moves, 1, 3, 3), true, "rook can capture enemy blocker");
  assert.equal(hasMoveTo(moves, 0, 3, 3), false, "rook cannot move beyond enemy blocker");

  const captureMove = moves.find((m) => m.to.x === 1 && m.to.y === 3 && m.to.z === 3);
  assert.equal(captureMove.isCapture, true);
  assert.equal(captureMove.capturedPieceId, enemy.id);
});


run("Seat presets produce valid deterministic mappings", () => {
  const allAI = presetAllAI();
  assert.equal(allAI[PlayerId.Yellow], ControllerType.AI);
  assert.equal(allAI[PlayerId.Red], ControllerType.AI);
  assert.equal(allAI[PlayerId.Purple], ControllerType.AI);
  assert.equal(allAI[PlayerId.Blue], ControllerType.AI);
  assert.equal(allAI[PlayerId.Green], ControllerType.AI);
  assert.equal(allAI[PlayerId.Orange], ControllerType.AI);
  assert.equal(allAI[PlayerId.Pink], ControllerType.AI);
  assert.equal(allAI[PlayerId.Cyan], ControllerType.AI);

  const oneHuman = presetOneHumanThreeAI(PlayerId.Purple);
  assert.equal(oneHuman[PlayerId.Purple], ControllerType.Human);
  assert.equal(oneHuman[PlayerId.Yellow], ControllerType.AI);

  const twoHuman = presetTwoHumanTwoAI(PlayerId.Yellow, PlayerId.Blue);
  assert.equal(twoHuman[PlayerId.Yellow], ControllerType.Human);
  assert.equal(twoHuman[PlayerId.Blue], ControllerType.Human);
  assert.equal(twoHuman[PlayerId.Red], ControllerType.AI);
});

run("TurnStateMachine resolves deterministic all-AI round flow", async () => {
  const { matchState, occupancyMap } = initializeMatchState();
  const machine = new TurnStateMachine({
    matchState,
    occupancyMap,
    seatConfig: presetAllAI(),
    aiBudgetMs: 100,
  });

  for (let i = 0; i < 8; i += 1) {
    const begin = machine.beginTurn();
    assert.equal(begin.type, TurnPhase.AwaitingAIMove);
    const resolved = await machine.resolveAITurn({ requestMove: ({ legalMoves }) => legalMoves[0] });
    assert.equal(resolved.type, "TurnResolved");
    assert.equal(machine.phase, TurnPhase.Idle);
  }

  assert.equal(matchState.turnCount, 8);
  assert.equal(matchState.activePlayer, PlayerId.Yellow);
});

run("TurnStateMachine enforces human turn gate and rejects out-of-turn input", async () => {
  const { matchState, occupancyMap } = initializeMatchState();
  const machine = new TurnStateMachine({
    matchState,
    occupancyMap,
    seatConfig: presetOneHumanThreeAI(PlayerId.Yellow),
    aiBudgetMs: 100,
  });

  const beginHuman = machine.beginTurn();
  assert.equal(beginHuman.type, TurnPhase.AwaitingHumanMove);

  assert.throws(() => {
    machine.submitHumanMove({
      player: PlayerId.Red,
      move: beginHuman.legalMoves[0],
    });
  });

  const humanResolved = machine.submitHumanMove({
    player: PlayerId.Yellow,
    move: beginHuman.legalMoves[0],
  });
  assert.equal(humanResolved.type, "TurnResolved");
  assert.equal(matchState.activePlayer, PlayerId.Red);

  const beginAI = machine.beginTurn();
  assert.equal(beginAI.type, TurnPhase.AwaitingAIMove);
  const aiResolved = await machine.resolveAITurn({ requestMove: ({ legalMoves }) => legalMoves[0] });
  assert.equal(aiResolved.type, "TurnResolved");
  assert.equal(matchState.activePlayer, PlayerId.Purple);
});

run("TurnStateMachine applies king-capture elimination and declares winner", async () => {
  const yellowKing = buildPiece("Yellow-King-00", PlayerId.Yellow, PIECE_TYPES.King, 7, 7, 7);
  const yellowRook = buildPiece("Yellow-Rook-00", PlayerId.Yellow, PIECE_TYPES.Rook, 0, 0, 0);
  const redKing = buildPiece("Red-King-00", PlayerId.Red, PIECE_TYPES.King, 0, 0, 1);

  const { matchState, occupancyMap } = buildScenario([yellowKing, yellowRook, redKing], PlayerId.Yellow);
  const seatConfig = presetAllAI();

  const machine = new TurnStateMachine({
    matchState,
    occupancyMap,
    seatConfig,
    aiBudgetMs: 100,
  });

  const begin = machine.beginTurn();
  assert.equal(begin.type, TurnPhase.AwaitingAIMove);

  const resolved = await machine.resolveAITurn({
    requestMove: ({ legalMoves }) => legalMoves.find((move) => move.capturedPieceId === redKing.id) ?? legalMoves[0],
  });

  assert.equal(resolved.type, "MatchEnded");
  assert.equal(resolved.eliminatedPlayer, PlayerId.Red);
  assert.equal(resolved.winner, PlayerId.Yellow);
  assert.equal(machine.phase, TurnPhase.MatchEnded);
  assert.equal(matchState.eliminatedPlayers.has(PlayerId.Red), true);
});

run("AI timeout path returns fallback move within budget", async () => {
  const { matchState, occupancyMap } = initializeMatchState();
  const machine = new TurnStateMachine({
    matchState,
    occupancyMap,
    seatConfig: presetAllAI(),
    aiBudgetMs: 5,
  });

  const begin = machine.beginTurn();
  assert.equal(begin.type, TurnPhase.AwaitingAIMove);

  const start = Date.now();
  const resolved = await machine.resolveAITurn({
    budgetMs: 5,
    requestMove: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return null;
    },
  });
  const elapsedMs = Date.now() - start;

  assert.equal(resolved.type, "TurnResolved");
  assert.equal(resolved.timedOut, true);
  assert.ok(elapsedMs < 1000, `timeout fallback took too long: ${elapsedMs}ms`);
});
await Promise.all(pendingTests);

if (process.exitCode) {
  process.exit(process.exitCode);
}





