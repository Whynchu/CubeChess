import assert from "node:assert/strict";

import { Coord3 } from "../Runtime/Core/GameState/coord3.js";
import { Piece } from "../Runtime/Core/GameState/piece.js";
import { OccupancyMap } from "../Runtime/Core/GameState/occupancyMap.js";
import { PIECE_TYPES, PlayerId } from "../Runtime/Core/GameState/constants.js";
import { MatchState } from "../Runtime/Core/GameState/matchState.js";
import { generateStartingPieces } from "../Runtime/Core/Formation/formationGenerator.js";
import { initializeMatchState } from "../Runtime/Core/GameState/initializeMatchState.js";
import { GameModeId } from "../Runtime/Core/Modes/gameModes.js";
import {
  BISHOP_DIRECTIONS,
  KING_DIRECTIONS,
  KNIGHT_OFFSETS,
  QUEEN_DIRECTIONS,
  ROOK_DIRECTIONS,
} from "../Runtime/Core/Rules/movementDirections.js";
import { getLegalMoves } from "../Runtime/Core/Rules/legalMoves.js";
import { TurnPhase, TurnStateMachine } from "../Runtime/Core/Turn/index.js";
import { applyDangerAwareIterativeRescoring, applyDangerAwareRescoring, BoardPhase, classifyBoardPhase, createTurnThreatContext, evaluateHeuristicMove } from "../Runtime/Core/AI/index.js";
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

function buildPiece(id, owner, type, x, y, z, options = {}) {
  return new Piece({ id, owner, type, coord: new Coord3(x, y, z), ...options });
}

function buildScenario(pieces, activePlayer = PlayerId.Yellow, options = {}) {
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
    turnOrder: options.turnOrder,
    gameModeId: options.gameModeId,
    resultType: options.resultType ?? null,
    enPassantTarget: options.enPassantTarget ?? null,
    noProgressHalfmoveClock: options.noProgressHalfmoveClock ?? 0,
    repetitionCounts: options.repetitionCounts ?? {},
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

run("Duel king can castle when path is clear and safe", () => {
  const yellowKing = buildPiece("Yellow-King-00", PlayerId.Yellow, PIECE_TYPES.King, 4, 7, 7);
  const yellowRookA = buildPiece("Yellow-Rook-00", PlayerId.Yellow, PIECE_TYPES.Rook, 0, 7, 7);
  const yellowRookB = buildPiece("Yellow-Rook-01", PlayerId.Yellow, PIECE_TYPES.Rook, 7, 7, 7);
  const redKing = buildPiece("Red-King-00", PlayerId.Red, PIECE_TYPES.King, 4, 0, 0);
  const { matchState, occupancyMap } = buildScenario(
    [yellowKing, yellowRookA, yellowRookB, redKing],
    PlayerId.Yellow,
    { gameModeId: GameModeId.Duel2P, turnOrder: [PlayerId.Yellow, PlayerId.Red] }
  );

  const moves = getLegalMoves(matchState, occupancyMap, yellowKing.id);
  const castleMoves = moves.filter((move) => move.special === "castle");

  assert.equal(castleMoves.length, 2);
  assert.ok(castleMoves.some((move) => move.to.x === 2 && move.rookMove?.to?.x === 3), "Expected queen-side castle");
  assert.ok(castleMoves.some((move) => move.to.x === 6 && move.rookMove?.to?.x === 5), "Expected king-side castle");
});

run("Duel castling is rejected when transit square is threatened", () => {
  const yellowKing = buildPiece("Yellow-King-00", PlayerId.Yellow, PIECE_TYPES.King, 4, 7, 7);
  const yellowRook = buildPiece("Yellow-Rook-01", PlayerId.Yellow, PIECE_TYPES.Rook, 7, 7, 7);
  const redKing = buildPiece("Red-King-00", PlayerId.Red, PIECE_TYPES.King, 4, 0, 0);
  const redRook = buildPiece("Red-Rook-00", PlayerId.Red, PIECE_TYPES.Rook, 5, 0, 7);
  const { matchState, occupancyMap } = buildScenario(
    [yellowKing, yellowRook, redKing, redRook],
    PlayerId.Yellow,
    { gameModeId: GameModeId.Duel2P, turnOrder: [PlayerId.Yellow, PlayerId.Red] }
  );

  const moves = getLegalMoves(matchState, occupancyMap, yellowKing.id);
  assert.equal(moves.some((move) => move.special === "castle" && move.to.x === 6), false);
});

run("Duel castling repositions rook and marks moved pieces", async () => {
  const yellowKing = buildPiece("Yellow-King-00", PlayerId.Yellow, PIECE_TYPES.King, 4, 7, 7);
  const yellowRook = buildPiece("Yellow-Rook-01", PlayerId.Yellow, PIECE_TYPES.Rook, 7, 7, 7);
  const redKing = buildPiece("Red-King-00", PlayerId.Red, PIECE_TYPES.King, 4, 0, 0);
  const { matchState, occupancyMap } = buildScenario(
    [yellowKing, yellowRook, redKing],
    PlayerId.Yellow,
    { gameModeId: GameModeId.Duel2P, turnOrder: [PlayerId.Yellow, PlayerId.Red] }
  );

  const machine = new TurnStateMachine({
    matchState,
    occupancyMap,
    seatConfig: presetAllAI(),
    aiBudgetMs: 100,
  });

  machine.beginTurn();
  const result = await machine.resolveAITurn({
    requestMove: ({ legalMoves }) => legalMoves.find((move) => move.special === "castle" && move.to.x === 6) ?? legalMoves[0],
  });

  assert.equal(result.type, "TurnResolved");
  assert.equal(result.move.special, "castle");
  assert.deepEqual(yellowKing.coord.toJSON(), { x: 6, y: 7, z: 7 });
  assert.deepEqual(yellowRook.coord.toJSON(), { x: 5, y: 7, z: 7 });
  assert.equal(yellowKing.hasMoved, true);
  assert.equal(yellowRook.hasMoved, true);
});

run("Duel en passant appears only on immediate reply to straight double-step", async () => {
  const yellowKing = buildPiece("Yellow-King-00", PlayerId.Yellow, PIECE_TYPES.King, 4, 7, 7);
  const yellowPawn = buildPiece("Yellow-Pawn-00", PlayerId.Yellow, PIECE_TYPES.Pawn, 4, 6, 6, { forward: { x: 0, y: 0, z: -1 } });
  const redKing = buildPiece("Red-King-00", PlayerId.Red, PIECE_TYPES.King, 4, 0, 0);
  const redPawn = buildPiece("Red-Pawn-00", PlayerId.Red, PIECE_TYPES.Pawn, 5, 6, 4, { forward: { x: 0, y: 0, z: 1 } });
  const { matchState, occupancyMap } = buildScenario(
    [yellowKing, yellowPawn, redKing, redPawn],
    PlayerId.Yellow,
    { gameModeId: GameModeId.Duel2P, turnOrder: [PlayerId.Yellow, PlayerId.Red] }
  );

  const machine = new TurnStateMachine({
    matchState,
    occupancyMap,
    seatConfig: presetAllAI(),
    aiBudgetMs: 100,
  });

  machine.beginTurn();
  await machine.resolveAITurn({
    requestMove: ({ legalMoves }) => legalMoves.find((move) => move.pieceId === yellowPawn.id && move.to.x === 4 && move.to.y === 6 && move.to.z === 4) ?? legalMoves[0],
  });

  assert.equal(matchState.enPassantTarget?.vulnerablePawnId, yellowPawn.id);

  const redMoves = getLegalMoves(matchState, occupancyMap, redPawn.id);
  const enPassant = redMoves.find((move) => move.special === "en_passant");

  assert.ok(enPassant, "Expected en passant capture to be legal on immediate reply");
  assert.deepEqual(enPassant.to, { x: 4, y: 6, z: 5 });
  assert.equal(enPassant.capturedPieceId, yellowPawn.id);

  const secondTurn = machine.beginTurn();
  assert.equal(secondTurn.player, PlayerId.Red);
  const result = await machine.resolveAITurn({
    requestMove: ({ legalMoves }) => legalMoves.find((move) => move.special === "en_passant") ?? legalMoves[0],
  });

  assert.equal(result.move.special, "en_passant");
  assert.equal(yellowPawn.alive, false);
  assert.deepEqual(redPawn.coord.toJSON(), { x: 4, y: 6, z: 5 });
});

run("Duel en passant expires after one reply window", async () => {
  const yellowKing = buildPiece("Yellow-King-00", PlayerId.Yellow, PIECE_TYPES.King, 4, 7, 7);
  const yellowPawn = buildPiece("Yellow-Pawn-00", PlayerId.Yellow, PIECE_TYPES.Pawn, 4, 6, 6, { forward: { x: 0, y: 0, z: -1 } });
  const redKing = buildPiece("Red-King-00", PlayerId.Red, PIECE_TYPES.King, 4, 0, 0);
  const redPawn = buildPiece("Red-Pawn-00", PlayerId.Red, PIECE_TYPES.Pawn, 5, 6, 4, { forward: { x: 0, y: 0, z: 1 } });
  const { matchState, occupancyMap } = buildScenario(
    [yellowKing, yellowPawn, redKing, redPawn],
    PlayerId.Yellow,
    { gameModeId: GameModeId.Duel2P, turnOrder: [PlayerId.Yellow, PlayerId.Red] }
  );

  const machine = new TurnStateMachine({
    matchState,
    occupancyMap,
    seatConfig: presetAllAI(),
    aiBudgetMs: 100,
  });

  machine.beginTurn();
  await machine.resolveAITurn({
    requestMove: ({ legalMoves }) => legalMoves.find((move) => move.pieceId === yellowPawn.id && move.to.x === 4 && move.to.y === 6 && move.to.z === 4) ?? legalMoves[0],
  });

  machine.beginTurn();
  await machine.resolveAITurn({
    requestMove: ({ legalMoves }) => legalMoves.find((move) => move.pieceId === redKing.id && !move.isCapture) ?? legalMoves[0],
  });

  machine.beginTurn();
  await machine.resolveAITurn({
    requestMove: ({ legalMoves }) => legalMoves.find((move) => move.pieceId === yellowKing.id && !move.isCapture) ?? legalMoves[0],
  });

  const redMoves = getLegalMoves(matchState, occupancyMap, redPawn.id);
  assert.equal(redMoves.some((move) => move.special === "en_passant"), false);
  assert.equal(matchState.enPassantTarget, null);
});

run("Duel ends in draw on threefold repetition", async () => {
  const yellowKing = buildPiece("Yellow-King-00", PlayerId.Yellow, PIECE_TYPES.King, 0, 7, 7, { hasMoved: true });
  const redKing = buildPiece("Red-King-00", PlayerId.Red, PIECE_TYPES.King, 7, 0, 0, { hasMoved: true });
  const { matchState, occupancyMap } = buildScenario(
    [yellowKing, redKing],
    PlayerId.Yellow,
    { gameModeId: GameModeId.Duel2P, turnOrder: [PlayerId.Yellow, PlayerId.Red] }
  );

  const machine = new TurnStateMachine({
    matchState,
    occupancyMap,
    seatConfig: presetAllAI(),
    aiBudgetMs: 100,
  });

  const moveSequence = [
    { player: PlayerId.Yellow, to: { x: 1, y: 7, z: 7 } },
    { player: PlayerId.Red, to: { x: 6, y: 0, z: 0 } },
    { player: PlayerId.Yellow, to: { x: 0, y: 7, z: 7 } },
    { player: PlayerId.Red, to: { x: 7, y: 0, z: 0 } },
    { player: PlayerId.Yellow, to: { x: 1, y: 7, z: 7 } },
    { player: PlayerId.Red, to: { x: 6, y: 0, z: 0 } },
    { player: PlayerId.Yellow, to: { x: 0, y: 7, z: 7 } },
    { player: PlayerId.Red, to: { x: 7, y: 0, z: 0 } },
  ];

  let finalResult = null;
  for (const expected of moveSequence) {
    const begin = machine.beginTurn();
    assert.equal(begin.player, expected.player);
    finalResult = await machine.resolveAITurn({
      requestMove: ({ legalMoves }) => legalMoves.find((move) => move.to.x === expected.to.x && move.to.y === expected.to.y && move.to.z === expected.to.z) ?? legalMoves[0],
    });
  }

  assert.equal(finalResult?.type, "MatchEnded");
  assert.equal(finalResult?.winner ?? null, null);
  assert.equal(finalResult?.resultType, "draw_repetition");
  assert.equal(machine.phase, TurnPhase.MatchEnded);
});

run("Duel ends in draw on no-progress halfmove limit", async () => {
  const yellowKing = buildPiece("Yellow-King-00", PlayerId.Yellow, PIECE_TYPES.King, 0, 7, 7);
  const redKing = buildPiece("Red-King-00", PlayerId.Red, PIECE_TYPES.King, 7, 0, 0);
  const { matchState, occupancyMap } = buildScenario(
    [yellowKing, redKing],
    PlayerId.Yellow,
    {
      gameModeId: GameModeId.Duel2P,
      turnOrder: [PlayerId.Yellow, PlayerId.Red],
      noProgressHalfmoveClock: 99,
    }
  );

  const machine = new TurnStateMachine({
    matchState,
    occupancyMap,
    seatConfig: presetAllAI(),
    aiBudgetMs: 100,
  });

  machine.beginTurn();
  const result = await machine.resolveAITurn({
    requestMove: ({ legalMoves }) => legalMoves.find((move) => move.to.x === 1 && move.to.y === 7 && move.to.z === 7) ?? legalMoves[0],
  });

  assert.equal(result.type, "MatchEnded");
  assert.equal(result.winner ?? null, null);
  assert.equal(result.resultType, "draw_no_progress");
  assert.equal(machine.phase, TurnPhase.MatchEnded);
});

run("AI phase classifier identifies opening, midgame, and endgame", () => {
  const opening = initializeMatchState().matchState;
  opening.turnCount = 4;
  assert.equal(classifyBoardPhase(opening), BoardPhase.Opening);

  const midgame = initializeMatchState().matchState;
  midgame.turnCount = 20;
  const removableMid = midgame.pieces.filter((piece) => piece.type !== PIECE_TYPES.King).slice(0, 4);
  for (const piece of removableMid) {
    piece.alive = false;
  }
  assert.equal(classifyBoardPhase(midgame), BoardPhase.Midgame);

  const endgame = initializeMatchState().matchState;
  endgame.turnCount = 36;
  for (const piece of endgame.pieces) {
    if (piece.type !== PIECE_TYPES.King) {
      piece.alive = false;
    }
  }
  assert.equal(classifyBoardPhase(endgame), BoardPhase.Endgame);
});
run("AI evaluator scales development pressure by board phase", () => {
  const yellowRook = buildPiece("Yellow-Rook-1", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const redKing = buildPiece("Red-King-1", PlayerId.Red, PIECE_TYPES.King, 7, 7, 7);
  const yellowKing = buildPiece("Yellow-King-1", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);

  const { matchState, occupancyMap } = buildScenario([yellowRook, redKing, yellowKing], PlayerId.Yellow);
  const legalMoves = getLegalMoves(matchState, occupancyMap, yellowRook.id);
  const candidateMove = legalMoves[0];

  assert.ok(candidateMove, "Expected at least one legal rook move");

  const behaviorContext = {
    pieceMoveCountsById: new Map(),
    recentMoves: [],
  };

  const openingEval = evaluateHeuristicMove({
    move: candidateMove,
    matchState,
    legalMoves,
    behaviorContext,
    boardPhase: BoardPhase.Opening,
  });

  const endgameEval = evaluateHeuristicMove({
    move: candidateMove,
    matchState,
    legalMoves,
    behaviorContext,
    boardPhase: BoardPhase.Endgame,
  });

  assert.ok(openingEval.breakdown.development > endgameEval.breakdown.development, "Opening should incentivize development more than endgame");
  assert.ok(openingEval.score > endgameEval.score, "Opening score should increase for fresh-piece activation");
});
run("AI danger-aware rescoring penalizes lines with strong opponent replies", () => {
  const yellowRook = buildPiece("Yellow-Rook-1", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const yellowKing = buildPiece("Yellow-King-1", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);
  const redRook = buildPiece("Red-Rook-1", PlayerId.Red, PIECE_TYPES.Rook, 3, 6, 3);
  const redKing = buildPiece("Red-King-1", PlayerId.Red, PIECE_TYPES.King, 7, 7, 7);
  const blueRook = buildPiece("Blue-Rook-1", PlayerId.Blue, PIECE_TYPES.Rook, 3, 7, 3);
  const blueKing = buildPiece("Blue-King-1", PlayerId.Blue, PIECE_TYPES.King, 7, 0, 7);

  const { matchState, occupancyMap } = buildScenario(
    [yellowRook, yellowKing, redRook, redKing, blueRook, blueKing],
    PlayerId.Yellow
  );

  const legalMoves = getLegalMoves(matchState, occupancyMap, yellowRook.id);
  const captureMove = legalMoves.find((move) => move.capturedPieceId === redRook.id);

  assert.ok(captureMove, "Expected capture move against red rook");

  const threatContext = createTurnThreatContext({ matchState, occupancyMap, player: PlayerId.Yellow });
  const baseScore = evaluateHeuristicMove({
    move: captureMove,
    matchState,
    legalMoves,
    threatContext,
  }).score;

  const rescored = applyDangerAwareRescoring({
    scoredMoves: [{ move: captureMove, score: baseScore }],
    matchState,
    player: PlayerId.Yellow,
    maxCandidates: 1,
    opponentMoveLimit: 40,
    dangerWeight: 1,
  });

  assert.equal(rescored.length, 1);
  assert.ok(rescored[0].dangerPenalty > 0, "Capture line should receive danger penalty from opponent response");
  assert.ok(rescored[0].score < baseScore, "Danger-aware score should be lower than base score when reply risk exists");
});
run("AI iterative danger rescoring returns best-known move when budget is tight", () => {
  const yellowRook = buildPiece("Yellow-Rook-1", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const yellowKing = buildPiece("Yellow-King-1", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);
  const redRook = buildPiece("Red-Rook-1", PlayerId.Red, PIECE_TYPES.Rook, 3, 6, 3);
  const redKing = buildPiece("Red-King-1", PlayerId.Red, PIECE_TYPES.King, 7, 7, 7);
  const blueRook = buildPiece("Blue-Rook-1", PlayerId.Blue, PIECE_TYPES.Rook, 3, 7, 3);
  const blueKing = buildPiece("Blue-King-1", PlayerId.Blue, PIECE_TYPES.King, 7, 0, 7);

  const { matchState, occupancyMap } = buildScenario(
    [yellowRook, yellowKing, redRook, redKing, blueRook, blueKing],
    PlayerId.Yellow
  );

  const legalMoves = getLegalMoves(matchState, occupancyMap, yellowRook.id);
  const captureMove = legalMoves.find((move) => move.capturedPieceId === redRook.id);
  const threatContext = createTurnThreatContext({ matchState, occupancyMap, player: PlayerId.Yellow });
  const scored = legalMoves.slice(0, 6).map((move) => ({
    move,
    score: evaluateHeuristicMove({ move, matchState, legalMoves, threatContext }).score,
  }));

  const result = applyDangerAwareIterativeRescoring({
    scoredMoves: scored,
    matchState,
    player: PlayerId.Yellow,
    stageCandidateLimits: [2, 4, 6],
    stageOpponentMoveLimits: [6, 12, 20],
    budgetMs: 0,
  });

  assert.ok(Array.isArray(result.scoredMoves), "Iterative rescoring should return scored move list");
  assert.equal(result.completedStages, 0, "Zero budget should skip deeper stages and keep best-known baseline");
  assert.ok(result.scoredMoves.length === scored.length, "Iterative rescoring should preserve candidate count");
  assert.ok(result.scoredMoves.every((entry) => Number.isFinite(entry.score)), "Iterative pass should preserve finite scoring on all candidates");
});
run("AI threat context marks attacked destination for opponent pressure", () => {
  const yellowRook = buildPiece("Yellow-Rook-1", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const yellowKing = buildPiece("Yellow-King-1", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);
  const redRook = buildPiece("Red-Rook-1", PlayerId.Red, PIECE_TYPES.Rook, 3, 7, 3);
  const redKing = buildPiece("Red-King-1", PlayerId.Red, PIECE_TYPES.King, 7, 7, 7);

  const { matchState, occupancyMap } = buildScenario([yellowRook, yellowKing, redRook, redKing], PlayerId.Yellow);
  const legalMoves = getLegalMoves(matchState, occupancyMap, yellowRook.id);
  const riskyMove = legalMoves.find((move) => move.to.x === 3 && move.to.y === 4 && move.to.z === 3);

  assert.ok(riskyMove, "Expected risky destination move to exist");

  const threatContext = createTurnThreatContext({ matchState, occupancyMap, player: PlayerId.Yellow });
  const evaluation = evaluateHeuristicMove({ move: riskyMove, matchState, legalMoves, threatContext });

  assert.ok(evaluation.breakdown.threat < 0, "Threat breakdown should penalize attacked destination");
  assert.ok(threatContext.opponent.attackCounts.get("3,4,3") > 0, "Opponent should attack destination voxel");
});
run("AI evaluator applies counter-risk penalty when destination has net opponent pressure", () => {
  const yellowRook = buildPiece("Yellow-Rook-1", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const yellowKing = buildPiece("Yellow-King-1", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);
  const redRook = buildPiece("Red-Rook-1", PlayerId.Red, PIECE_TYPES.Rook, 3, 7, 3);
  const redQueen = buildPiece("Red-Queen-1", PlayerId.Red, PIECE_TYPES.Queen, 7, 4, 3);
  const redKing = buildPiece("Red-King-1", PlayerId.Red, PIECE_TYPES.King, 7, 7, 7);

  const { matchState, occupancyMap } = buildScenario(
    [yellowRook, yellowKing, redRook, redQueen, redKing],
    PlayerId.Yellow
  );

  const legalMoves = getLegalMoves(matchState, occupancyMap, yellowRook.id);
  const riskyMove = legalMoves.find((move) => move.to.x === 3 && move.to.y === 4 && move.to.z === 3);
  const saferMove = legalMoves.find((move) => move.to.x === 2 && move.to.y === 3 && move.to.z === 3);

  assert.ok(riskyMove, "Expected risky destination move to exist");
  assert.ok(saferMove, "Expected safer destination move to exist");

  const threatContext = createTurnThreatContext({ matchState, occupancyMap, player: PlayerId.Yellow });
  const riskyEval = evaluateHeuristicMove({ move: riskyMove, matchState, legalMoves, threatContext });
  const saferEval = evaluateHeuristicMove({ move: saferMove, matchState, legalMoves, threatContext });

  assert.ok(riskyEval.breakdown.counterRisk < 0, "Risky move should incur counter-risk penalty");
  assert.ok(saferEval.breakdown.counterRisk >= riskyEval.breakdown.counterRisk, "Safer move should not be penalized more than risky move");
  assert.ok(saferEval.score > riskyEval.score, "Safer move should outscore risky move under counter-risk weighting");
});
run("AI threat context tracks per-opponent attack maps", () => {
  const yellowRook = buildPiece("Yellow-Rook-1", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const yellowKing = buildPiece("Yellow-King-1", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);
  const redRook = buildPiece("Red-Rook-1", PlayerId.Red, PIECE_TYPES.Rook, 3, 7, 3);
  const redKing = buildPiece("Red-King-1", PlayerId.Red, PIECE_TYPES.King, 7, 7, 7);
  const blueQueen = buildPiece("Blue-Queen-1", PlayerId.Blue, PIECE_TYPES.Queen, 7, 4, 3);
  const blueKing = buildPiece("Blue-King-1", PlayerId.Blue, PIECE_TYPES.King, 7, 0, 7);

  const { matchState, occupancyMap } = buildScenario(
    [yellowRook, yellowKing, redRook, redKing, blueQueen, blueKing],
    PlayerId.Yellow
  );

  const threatContext = createTurnThreatContext({ matchState, occupancyMap, player: PlayerId.Yellow });
  const byPlayer = threatContext.opponent.attackCountsByPlayer;

  assert.ok(byPlayer instanceof Map, "Expected opponent attack maps keyed by player");
  assert.ok(byPlayer.has(PlayerId.Red), "Expected red attack map to be present");
  assert.ok(byPlayer.has(PlayerId.Blue), "Expected blue attack map to be present");
  assert.ok((byPlayer.get(PlayerId.Red)?.get("3,4,3") ?? 0) > 0, "Expected red pressure on destination");
  assert.ok((byPlayer.get(PlayerId.Blue)?.get("3,4,3") ?? 0) > 0, "Expected blue pressure on destination");
});

run("AI evaluator applies table-pressure penalty when multiple opponents cover destination", () => {
  const yellowRook = buildPiece("Yellow-Rook-1", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const yellowKing = buildPiece("Yellow-King-1", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);
  const redRook = buildPiece("Red-Rook-1", PlayerId.Red, PIECE_TYPES.Rook, 3, 7, 3);
  const redKing = buildPiece("Red-King-1", PlayerId.Red, PIECE_TYPES.King, 7, 7, 7);
  const blueQueen = buildPiece("Blue-Queen-1", PlayerId.Blue, PIECE_TYPES.Queen, 7, 4, 3);
  const blueKing = buildPiece("Blue-King-1", PlayerId.Blue, PIECE_TYPES.King, 7, 0, 7);

  const { matchState, occupancyMap } = buildScenario(
    [yellowRook, yellowKing, redRook, redKing, blueQueen, blueKing],
    PlayerId.Yellow
  );

  const legalMoves = getLegalMoves(matchState, occupancyMap, yellowRook.id);
  const riskyMove = legalMoves.find((move) => move.to.x === 3 && move.to.y === 4 && move.to.z === 3);
  const saferMove = legalMoves.find((move) => move.to.x === 2 && move.to.y === 3 && move.to.z === 3);

  assert.ok(riskyMove, "Expected risky destination move to exist");
  assert.ok(saferMove, "Expected safer destination move to exist");

  const threatContext = createTurnThreatContext({ matchState, occupancyMap, player: PlayerId.Yellow });
  const riskyEval = evaluateHeuristicMove({ move: riskyMove, matchState, legalMoves, threatContext });
  const saferEval = evaluateHeuristicMove({ move: saferMove, matchState, legalMoves, threatContext });

  assert.ok(riskyEval.breakdown.tablePressure < 0, "Multi-opponent destination should incur table-pressure penalty");
  assert.ok(saferEval.breakdown.tablePressure >= riskyEval.breakdown.tablePressure, "Safer destination should not be penalized more");
});

run("AI evaluator applies anti-helper penalty when capture feeds third-party pressure", () => {
  const yellowRook = buildPiece("Yellow-Rook-1", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const yellowKing = buildPiece("Yellow-King-1", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);
  const redRook = buildPiece("Red-Rook-1", PlayerId.Red, PIECE_TYPES.Rook, 3, 7, 3);
  const redKing = buildPiece("Red-King-1", PlayerId.Red, PIECE_TYPES.King, 7, 7, 7);
  const blueQueen = buildPiece("Blue-Queen-1", PlayerId.Blue, PIECE_TYPES.Queen, 7, 7, 3);
  const blueKing = buildPiece("Blue-King-1", PlayerId.Blue, PIECE_TYPES.King, 7, 0, 7);

  const { matchState, occupancyMap } = buildScenario(
    [yellowRook, yellowKing, redRook, redKing, blueQueen, blueKing],
    PlayerId.Yellow
  );

  const legalMoves = getLegalMoves(matchState, occupancyMap, yellowRook.id);
  const captureMove = legalMoves.find((move) => move.capturedPieceId === redRook.id);

  assert.ok(captureMove, "Expected capture move against red rook");

  const threatContext = createTurnThreatContext({ matchState, occupancyMap, player: PlayerId.Yellow });
  const captureEval = evaluateHeuristicMove({ move: captureMove, matchState, legalMoves, threatContext });

  assert.ok(captureEval.breakdown.antiHelper < 0, "Capture under third-party pressure should incur anti-helper penalty");
});
run("AI heuristic evaluator is deterministic and favors high-value captures", () => {
  const yellowRook = buildPiece("Yellow-Rook-1", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const redQueen = buildPiece("Red-Queen-1", PlayerId.Red, PIECE_TYPES.Queen, 3, 6, 3);
  const redKing = buildPiece("Red-King-1", PlayerId.Red, PIECE_TYPES.King, 7, 7, 7);
  const yellowKing = buildPiece("Yellow-King-1", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);

  const { matchState, occupancyMap } = buildScenario([yellowRook, redQueen, redKing, yellowKing], PlayerId.Yellow);
  const legalMoves = getLegalMoves(matchState, occupancyMap, yellowRook.id);

  const captureMove = legalMoves.find((move) => move.capturedPieceId === redQueen.id);
  const quietMove = legalMoves.find((move) => !move.capturedPieceId);

  assert.ok(captureMove, "Expected a capture move against the queen");
  assert.ok(quietMove, "Expected at least one non-capture move");

  const captureEvalA = evaluateHeuristicMove({ move: captureMove, matchState, legalMoves });
  const captureEvalB = evaluateHeuristicMove({ move: captureMove, matchState, legalMoves });
  const quietEval = evaluateHeuristicMove({ move: quietMove, matchState, legalMoves });

  assert.equal(captureEvalA.score, captureEvalB.score);
  assert.deepEqual(captureEvalA.breakdown, captureEvalB.breakdown);
  assert.ok(captureEvalA.breakdown.capture > 0, "Capture breakdown should be positive for capture move");
  assert.ok(captureEvalA.breakdown.capture > quietEval.breakdown.capture, "Capture move should carry stronger capture breakdown than quiet move");
  assert.ok(Number.isFinite(captureEvalA.score), "Capture evaluation score should be finite");
  assert.ok(Number.isFinite(quietEval.score), "Quiet evaluation score should be finite");
});
run("AI evaluator applies development and repetition penalties from behavior context", () => {
  const yellowRook = buildPiece("Yellow-Rook-1", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const redKing = buildPiece("Red-King-1", PlayerId.Red, PIECE_TYPES.King, 7, 7, 7);
  const yellowKing = buildPiece("Yellow-King-1", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);

  const { matchState, occupancyMap } = buildScenario([yellowRook, redKing, yellowKing], PlayerId.Yellow);
  const legalMoves = getLegalMoves(matchState, occupancyMap, yellowRook.id);
  const candidateMove = legalMoves[0];

  assert.ok(candidateMove, "Expected at least one legal rook move");

  const freshContext = {
    pieceMoveCountsById: new Map(),
    recentMoves: [],
  };

  const repeatedContext = {
    pieceMoveCountsById: new Map([[yellowRook.id, 6]]),
    recentMoves: [
      { pieceId: yellowRook.id, from: candidateMove.from, to: candidateMove.to },
      { pieceId: yellowRook.id, from: candidateMove.to, to: candidateMove.from },
    ],
  };

  const freshEval = evaluateHeuristicMove({ move: candidateMove, matchState, legalMoves, behaviorContext: freshContext });
  const repeatedEval = evaluateHeuristicMove({ move: candidateMove, matchState, legalMoves, behaviorContext: repeatedContext });

  assert.ok(freshEval.breakdown.development > 0, "Fresh piece should get development bonus");
  assert.ok(repeatedEval.breakdown.inactivity < 0, "Repeated piece should get inactivity penalty");
  assert.ok(repeatedEval.breakdown.repetition < 0, "Repeated/backtrack move should get repetition penalty");
  assert.ok(freshEval.score > repeatedEval.score, "Fresh context should outscore repeated context for same move");
});
run("AI evaluator penalizes same-type streaks to improve piece diversity", () => {
  const yellowRook = buildPiece("Yellow-Rook-1", PlayerId.Yellow, PIECE_TYPES.Rook, 3, 3, 3);
  const yellowKnight = buildPiece("Yellow-Knight-1", PlayerId.Yellow, PIECE_TYPES.Knight, 4, 4, 4);
  const yellowKing = buildPiece("Yellow-King-1", PlayerId.Yellow, PIECE_TYPES.King, 0, 0, 0);
  const redKing = buildPiece("Red-King-1", PlayerId.Red, PIECE_TYPES.King, 7, 7, 7);

  const { matchState, occupancyMap } = buildScenario([yellowRook, yellowKnight, yellowKing, redKing], PlayerId.Yellow);
  const rookMove = getLegalMoves(matchState, occupancyMap, yellowRook.id)[0];
  const knightMove = getLegalMoves(matchState, occupancyMap, yellowKnight.id)[0];

  assert.ok(rookMove, "Expected at least one rook move");
  assert.ok(knightMove, "Expected at least one knight move");

  const behaviorContext = {
    pieceMoveCountsById: new Map(),
    recentMoves: [
      { pieceId: yellowRook.id, from: rookMove.from, to: rookMove.to },
      { pieceId: yellowRook.id, from: rookMove.to, to: rookMove.from },
      { pieceId: "Yellow-Rook-99", from: rookMove.from, to: rookMove.to },
      { pieceId: "Yellow-Rook-98", from: rookMove.from, to: rookMove.to },
    ],
  };

  const rookEval = evaluateHeuristicMove({
    move: rookMove,
    matchState,
    legalMoves: getLegalMoves(matchState, occupancyMap, yellowRook.id),
    behaviorContext,
  });

  const knightEval = evaluateHeuristicMove({
    move: knightMove,
    matchState,
    legalMoves: getLegalMoves(matchState, occupancyMap, yellowKnight.id),
    behaviorContext,
  });

  assert.ok(rookEval.breakdown.diversity < 0, "Rook move should incur diversity penalty under same-type streak");
  assert.ok(knightEval.breakdown.diversity >= rookEval.breakdown.diversity, "Different type should be penalized less than repeated type");
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














