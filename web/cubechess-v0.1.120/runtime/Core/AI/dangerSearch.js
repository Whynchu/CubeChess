import { Coord3 } from "../GameState/coord3.js";
import { MatchState } from "../GameState/matchState.js";
import { OccupancyMap } from "../GameState/occupancyMap.js";
import { Piece } from "../GameState/piece.js";
import { PIECE_TYPES } from "../GameState/constants.js";
import { collectLegalMovesForPlayer } from "../Turn/turnStateMachine.js";
import { classifyBoardPhase } from "./phase.js";
import { createTurnThreatContext } from "./threat.js";
import { evaluateHeuristicMove } from "./evaluator.js";

function moveKey(move) {
  return `${move.pieceId}:${move.to.x},${move.to.y},${move.to.z}`;
}

function cloneMatchContext(matchState) {
  const pieces = matchState.pieces.map((piece) => new Piece({
    id: piece.id,
    owner: piece.owner,
    type: piece.type,
    coord: Coord3.from(piece.coord),
    alive: piece.alive,
  }));

  const clone = new MatchState({
    pieces,
    activePlayer: matchState.activePlayer,
    eliminatedPlayers: [...matchState.eliminatedPlayers],
    turnCount: matchState.turnCount,
    lastMove: matchState.lastMove,
    turnOrder: [...(matchState.turnOrder ?? [])],
  });

  const occupancyMap = new OccupancyMap();
  for (const piece of pieces) {
    if (piece.alive) {
      occupancyMap.place(piece);
    }
  }

  return { matchState: clone, occupancyMap };
}

function eliminatePlayer(matchState, occupancyMap, player) {
  if (matchState.eliminatedPlayers.has(player)) {
    return;
  }

  matchState.eliminatedPlayers.add(player);
  for (const piece of matchState.pieces) {
    if (!piece.alive || piece.owner !== player) {
      continue;
    }
    piece.alive = false;
    occupancyMap.remove(piece.id);
  }
}

function applyMoveToClone(matchState, occupancyMap, move) {
  const piece = matchState.pieces.find((candidate) => candidate.alive && candidate.id === move.pieceId);
  if (!piece) {
    return false;
  }

  const destination = Coord3.from(move.to);
  const target = occupancyMap.tryGetPieceAt(destination);
  if (target && target.owner === piece.owner) {
    return false;
  }

  if (target) {
    target.alive = false;
    occupancyMap.remove(target.id);
    if (target.type === PIECE_TYPES.King) {
      eliminatePlayer(matchState, occupancyMap, target.owner);
    }
  }

  return occupancyMap.move(piece, destination);
}

function getAliveOpponents(matchState, player) {
  const owners = new Set();
  for (const piece of matchState.pieces) {
    if (!piece.alive || piece.owner === player || matchState.eliminatedPlayers.has(piece.owner)) {
      continue;
    }
    owners.add(piece.owner);
  }
  return [...owners].sort((a, b) => a.localeCompare(b));
}

function evaluateBestOpponentReply({
  matchState,
  occupancyMap,
  player,
  boardPhase,
  opponentMoveLimit,
}) {
  const opponents = getAliveOpponents(matchState, player);
  let strongestReply = 0;

  for (const opponent of opponents) {
    const legalMoves = collectLegalMovesForPlayer(matchState, occupancyMap, opponent);
    if (legalMoves.length === 0) {
      continue;
    }

    const trimmedMoves = legalMoves.slice(0, Math.max(1, opponentMoveLimit));
    const threatContext = createTurnThreatContext({ matchState, occupancyMap, player: opponent });

    let bestForOpponent = -Infinity;
    for (const move of trimmedMoves) {
      const evaluated = evaluateHeuristicMove({
        move,
        matchState,
        legalMoves: trimmedMoves,
        threatContext,
        boardPhase,
      });
      if (evaluated.score > bestForOpponent) {
        bestForOpponent = evaluated.score;
      }
    }

    if (bestForOpponent > strongestReply) {
      strongestReply = bestForOpponent;
    }
  }

  return strongestReply;
}

export function applyDangerAwareRescoring({
  scoredMoves,
  matchState,
  player,
  maxCandidates = 24,
  opponentMoveLimit = 48,
  dangerWeight = 0.8,
  signal = null,
}) {
  if (!Array.isArray(scoredMoves) || scoredMoves.length === 0) {
    return scoredMoves ?? [];
  }

  const dangerBudget = Math.max(1, Math.min(scoredMoves.length, maxCandidates));
  const topMoves = scoredMoves.slice(0, dangerBudget);
  const penaltiesByKey = new Map();

  for (const entry of topMoves) {
    if (signal?.aborted) {
      break;
    }

    const cloned = cloneMatchContext(matchState);
    const moved = applyMoveToClone(cloned.matchState, cloned.occupancyMap, entry.move);
    if (!moved) {
      continue;
    }

    const boardPhase = classifyBoardPhase(cloned.matchState);
    const strongestReply = evaluateBestOpponentReply({
      matchState: cloned.matchState,
      occupancyMap: cloned.occupancyMap,
      player,
      boardPhase,
      opponentMoveLimit,
    });

    penaltiesByKey.set(moveKey(entry.move), strongestReply * dangerWeight);
  }

  return scoredMoves.map((entry) => {
    const penalty = penaltiesByKey.get(moveKey(entry.move)) ?? 0;
    return {
      ...entry,
      dangerPenalty: penalty,
      score: entry.score - penalty,
    };
  });
}


function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function stableSortScoredMoves(scoredMoves) {
  return [...scoredMoves].sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    if (a.move.pieceId !== b.move.pieceId) {
      return a.move.pieceId.localeCompare(b.move.pieceId);
    }
    if (a.move.to.x !== b.move.to.x) return a.move.to.x - b.move.to.x;
    if (a.move.to.y !== b.move.to.y) return a.move.to.y - b.move.to.y;
    return a.move.to.z - b.move.to.z;
  });
}

export function applyDangerAwareIterativeRescoring({
  scoredMoves,
  matchState,
  player,
  stageCandidateLimits = [8, 16, 24],
  stageOpponentMoveLimits = [16, 28, 40],
  dangerWeight = 0.8,
  budgetMs = 240,
  signal = null,
}) {
  if (!Array.isArray(scoredMoves) || scoredMoves.length === 0) {
    return {
      scoredMoves: scoredMoves ?? [],
      completedStages: 0,
      timedOut: false,
    };
  }

  const stages = Math.min(stageCandidateLimits.length, stageOpponentMoveLimits.length);
  const safeBudgetMs = Math.max(0, budgetMs);
  const deadlineMs = nowMs() + safeBudgetMs;

  let bestScored = stableSortScoredMoves(
    scoredMoves.map((entry) => ({
      ...entry,
      dangerPenalty: entry.dangerPenalty ?? 0,
    }))
  );

  let completedStages = 0;

  for (let i = 0; i < stages; i += 1) {
    if (signal?.aborted || nowMs() >= deadlineMs) {
      break;
    }

    const rescored = applyDangerAwareRescoring({
      scoredMoves,
      matchState,
      player,
      maxCandidates: stageCandidateLimits[i],
      opponentMoveLimit: stageOpponentMoveLimits[i],
      dangerWeight,
      signal,
    });

    bestScored = stableSortScoredMoves(rescored);
    completedStages += 1;
  }

  return {
    scoredMoves: bestScored,
    completedStages,
    timedOut: completedStages < stages,
  };
}


