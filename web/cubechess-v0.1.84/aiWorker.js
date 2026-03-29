import { MatchState } from "../../Runtime/Core/GameState/matchState.js";
import { OccupancyMap } from "../../Runtime/Core/GameState/occupancyMap.js";
import { Piece } from "../../Runtime/Core/GameState/piece.js";
import {
  applyDangerAwareIterativeRescoring,
  classifyBoardPhase,
  createTurnThreatContext,
  evaluateHeuristicMove,
} from "../../Runtime/Core/AI/index.js";

function sortScoredMoves(scored) {
  return [...scored].sort((a, b) => {
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

function moveKey(move) {
  const to = move?.to ?? { x: "?", y: "?", z: "?" };
  return String(move?.pieceId ?? "piece") + ":" + to.x + "," + to.y + "," + to.z;
}

function pruneScoredCandidates(scoredMoves, options = {}) {
  const limit = Math.max(1, options.limit ?? 96);
  const minPerPiece = Math.max(1, options.minPerPiece ?? 2);
  if (!Array.isArray(scoredMoves) || scoredMoves.length <= limit) {
    return Array.isArray(scoredMoves) ? [...scoredMoves] : [];
  }

  const kept = [];
  const keptByPiece = new Map();
  const keptMoveKeys = new Set();

  for (const entry of scoredMoves) {
    if (kept.length >= limit) {
      break;
    }
    const pieceId = entry.move.pieceId;
    const count = keptByPiece.get(pieceId) ?? 0;
    if (count >= minPerPiece) {
      continue;
    }
    const key = moveKey(entry.move);
    if (keptMoveKeys.has(key)) {
      continue;
    }
    kept.push(entry);
    keptByPiece.set(pieceId, count + 1);
    keptMoveKeys.add(key);
  }

  for (const entry of scoredMoves) {
    if (kept.length >= limit) {
      break;
    }
    const key = moveKey(entry.move);
    if (keptMoveKeys.has(key)) {
      continue;
    }
    kept.push(entry);
    keptMoveKeys.add(key);
  }

  return kept;
}

function reconstructMatchContext(snapshot) {
  const pieces = (snapshot.pieces ?? []).map((piece) => new Piece({
    id: piece.id,
    owner: piece.owner,
    type: piece.type,
    coord: piece.coord,
    alive: piece.alive,
  }));

  const matchState = new MatchState({
    pieces,
    activePlayer: snapshot.activePlayer,
    eliminatedPlayers: snapshot.eliminatedPlayers ?? [],
    turnCount: snapshot.turnCount ?? 0,
    lastMove: snapshot.lastMove ?? null,
  });

  const occupancyMap = new OccupancyMap();
  for (const piece of pieces) {
    if (piece.alive) {
      occupancyMap.place(piece);
    }
  }

  return { matchState, occupancyMap };
}

function computeDecision(payload) {
  const { matchState, occupancyMap } = reconstructMatchContext(payload.matchState);
  const legalMoves = Array.isArray(payload.legalMoves) ? payload.legalMoves : [];
  const player = payload.player ?? matchState.activePlayer;

  const behaviorContext = {
    pieceMoveCountsById: new Map(payload.behaviorContext?.pieceMoveCountsById ?? []),
    recentMoves: Array.isArray(payload.behaviorContext?.recentMoves) ? payload.behaviorContext.recentMoves : [],
  };

  const boardPhase = classifyBoardPhase(matchState);
  const threatContext = createTurnThreatContext({
    matchState,
    occupancyMap,
    player,
  });

  const scored = [];
  for (const move of legalMoves) {
    const evaluated = evaluateHeuristicMove({
      move,
      matchState,
      legalMoves,
      threatContext,
      behaviorContext,
      boardPhase,
    });
    scored.push({
      move,
      score: evaluated.score,
      breakdown: evaluated.breakdown,
    });
  }

  const sortedScored = sortScoredMoves(scored);

  const aiBudgetMs = payload.aiBudgetMs ?? 400;
  const dangerConfig = payload.dangerConfig ?? {};
  const dangerBudgetMs = Math.max(
    dangerConfig.budgetMinMs ?? 120,
    Math.min(
      dangerConfig.budgetMaxMs ?? 1800,
      Math.floor(aiBudgetMs * (dangerConfig.budgetFraction ?? 0.32))
    )
  );

  const dangerResult = applyDangerAwareIterativeRescoring({
    scoredMoves: sortedScored,
    matchState,
    player,
    stageCandidateLimits: dangerConfig.stageCandidateLimits ?? [8, 16, 24],
    stageOpponentMoveLimits: dangerConfig.stageOpponentMoveLimits ?? [16, 28, 40],
    dangerWeight: dangerConfig.dangerWeight ?? 0.8,
    budgetMs: dangerBudgetMs,
    signal: null,
  });

  const dangerRescored = sortScoredMoves(dangerResult.scoredMoves ?? []);
  const candidatePool = pruneScoredCandidates(dangerRescored, {
    limit: payload.candidateConfig?.poolLimit ?? 96,
    minPerPiece: payload.candidateConfig?.minPerPiece ?? 2,
  });

  return {
    boardPhase,
    scored: sortedScored,
    dangerBudgetMs,
    dangerRescored,
    completedStages: dangerResult.completedStages ?? 0,
    timedOut: dangerResult.timedOut === true,
    candidatePool,
  };
}

self.addEventListener("message", (event) => {
  const data = event.data ?? {};
  const id = data.id;
  try {
    const result = computeDecision(data.payload ?? {});
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error?.message ?? "AI worker failed" });
  }
});

