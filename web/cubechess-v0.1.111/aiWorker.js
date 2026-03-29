import { MatchState } from "./runtime/Core/GameState/matchState.js";
import { OccupancyMap } from "./runtime/Core/GameState/occupancyMap.js";
import { Piece } from "./runtime/Core/GameState/piece.js";
import { Coord3 } from "./runtime/Core/GameState/coord3.js";
import { PIECE_TYPES } from "./runtime/Core/GameState/constants.js";
import {
  applyDangerAwareIterativeRescoring,
  buildDecisionContextHash,
  buildMatchStateHash,
  classifyBoardPhase,
  createTurnThreatContext,
  evaluateHeuristicMove,
  TranspositionCache,
} from "./runtime/Core/AI/index.js";
import { collectLegalMovesForPlayer } from "./runtime/Core/Turn/turnStateMachine.js";

const DECISION_CACHE = new TranspositionCache(768);
const SEARCH_NODE_CACHE = new TranspositionCache(4096);

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

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

function formatPvStep(move, player) {
  if (!move) {
    return null;
  }
  return {
    player: player ?? null,
    pieceId: move.pieceId,
    from: move.from ? { x: move.from.x, y: move.from.y, z: move.from.z } : null,
    to: move.to ? { x: move.to.x, y: move.to.y, z: move.to.z } : null,
    capturedPieceId: move.capturedPieceId ?? null,
  };
}

function pruneScoredCandidates(scoredMoves, options = {}) {
  const limit = Math.max(1, options.limit ?? 96);
  const minPerPiece = Math.max(1, options.minPerPiece ?? 2);
  const scoreWindow = Math.max(0, options.scoreWindow ?? 4.5);
  const eliteCount = Math.max(
    minPerPiece,
    Math.min(limit, options.eliteCount ?? Math.max(12, Math.floor(limit * 0.25)))
  );
  const captureBoostCount = Math.max(0, Math.min(limit, options.captureBoostCount ?? Math.max(6, Math.floor(limit * 0.12))));
  if (!Array.isArray(scoredMoves) || scoredMoves.length <= limit) {
    return Array.isArray(scoredMoves) ? [...scoredMoves] : [];
  }

  const sorted = sortScoredMoves(scoredMoves);
  const kept = [];
  const keptByPiece = new Map();
  const keptMoveKeys = new Set();
  const bestByPiece = new Map();
  const topByPiece = new Map();

  const addEntry = (entry) => {
    if (!entry || kept.length >= limit) {
      return false;
    }
    const key = moveKey(entry.move);
    if (keptMoveKeys.has(key)) {
      return false;
    }
    kept.push(entry);
    keptMoveKeys.add(key);
    const pieceId = entry.move?.pieceId;
    if (pieceId) {
      keptByPiece.set(pieceId, (keptByPiece.get(pieceId) ?? 0) + 1);
    }
    return true;
  };

  for (const entry of sorted) {
    const pieceId = entry.move?.pieceId;
    if (!pieceId) {
      continue;
    }
    if (!bestByPiece.has(pieceId)) {
      bestByPiece.set(pieceId, Number(entry.score ?? 0));
      topByPiece.set(pieceId, entry);
    }
  }

  for (let index = 0; index < eliteCount && index < sorted.length; index += 1) {
    addEntry(sorted[index]);
  }

  if (captureBoostCount > 0) {
    const captures = sorted
      .filter((entry) => Boolean(entry?.move?.capturedPieceId) || Number(entry?.breakdown?.capture ?? 0) > 0)
      .slice(0, captureBoostCount);
    for (const entry of captures) {
      if (kept.length >= limit) {
        break;
      }
      addEntry(entry);
    }
  }

  for (const entry of topByPiece.values()) {
    if (kept.length >= limit) {
      break;
    }
    addEntry(entry);
  }

  for (const entry of sorted) {
    if (kept.length >= limit) {
      break;
    }
    const pieceId = entry.move?.pieceId;
    if (!pieceId) {
      continue;
    }
    const count = keptByPiece.get(pieceId) ?? 0;
    if (count >= minPerPiece) {
      continue;
    }
    const bestScore = bestByPiece.get(pieceId) ?? Number(entry.score ?? 0);
    const score = Number(entry.score ?? 0);
    if (score < bestScore - scoreWindow) {
      continue;
    }
    addEntry(entry);
  }

  for (const entry of sorted) {
    if (kept.length >= limit) {
      break;
    }
    addEntry(entry);
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

  const moved = occupancyMap.move(piece, destination);
  if (!moved) {
    return false;
  }

  matchState.lastMove = {
    pieceId: move.pieceId,
    from: move.from,
    to: move.to,
    isCapture: Boolean(move.capturedPieceId),
    capturedPieceId: move.capturedPieceId ?? null,
  };

  return true;
}

function toSnapshot(matchState) {
  return {
    activePlayer: matchState.activePlayer,
    turnCount: matchState.turnCount,
    lastMove: matchState.lastMove,
    eliminatedPlayers: [...matchState.eliminatedPlayers],
    pieces: matchState.pieces.map((piece) => ({
      id: piece.id,
      owner: piece.owner,
      type: piece.type,
      alive: piece.alive,
      coord: {
        x: piece.coord.x,
        y: piece.coord.y,
        z: piece.coord.z,
      },
    })),
  };
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

function scoreMovesForPlayer({
  matchState,
  occupancyMap,
  player,
  legalMoves,
  behaviorContext,
  boardPhase,
}) {
  if (!Array.isArray(legalMoves) || legalMoves.length === 0) {
    return [];
  }

  const threatContext = createTurnThreatContext({ matchState, occupancyMap, player });

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

  return sortScoredMoves(scored);
}

function getCachedNodeValue({
  matchState,
  player,
  kind,
  depth,
  moveLimit,
  compute,
  metrics,
}) {
  const stateHash = buildMatchStateHash(toSnapshot(matchState));
  const nodeKey = `${kind}|${stateHash}|p:${player}|d:${depth}|l:${moveLimit}`;
  const cached = SEARCH_NODE_CACHE.get(nodeKey);
  if (cached !== null) {
    metrics.cacheHits += 1;
    return cached;
  }

  const value = compute();
  SEARCH_NODE_CACHE.set(nodeKey, value);
  return value;
}

function evaluateStrongestOpponentReply({
  matchState,
  occupancyMap,
  player,
  behaviorContext,
  opponentMoveLimit,
  metrics,
  deadlineMs,
  signal,
  depth,
}) {
  return getCachedNodeValue({
    matchState,
    player,
    kind: "opp_reply",
    depth,
    moveLimit: opponentMoveLimit,
    metrics,
    compute: () => {
      const opponents = getAliveOpponents(matchState, player);
      let strongest = null;

      for (const opponent of opponents) {
        if (signal?.aborted || nowMs() >= deadlineMs) {
          break;
        }

        const legalMoves = collectLegalMovesForPlayer(matchState, occupancyMap, opponent);
        if (legalMoves.length === 0) {
          continue;
        }

        const boardPhase = classifyBoardPhase(matchState);
        const scored = scoreMovesForPlayer({
          matchState,
          occupancyMap,
          player: opponent,
          legalMoves,
          behaviorContext,
          boardPhase,
        }).slice(0, Math.max(1, opponentMoveLimit));

        metrics.nodesExpanded += Math.min(scored.length, Math.max(1, opponentMoveLimit));

        const candidate = scored[0] ?? null;
        if (!candidate) {
          continue;
        }

        if (!strongest || candidate.score > strongest.score) {
          strongest = {
            opponent,
            move: candidate.move,
            score: candidate.score,
          };
        }
      }

      return strongest;
    },
  });
}

function evaluateBestSelfReplyScore({
  matchState,
  occupancyMap,
  player,
  behaviorContext,
  selfMoveLimit,
  metrics,
  deadlineMs,
  signal,
  depth,
}) {
  return getCachedNodeValue({
    matchState,
    player,
    kind: "self_reply",
    depth,
    moveLimit: selfMoveLimit,
    metrics,
    compute: () => {
      if (signal?.aborted || nowMs() >= deadlineMs) {
        return null;
      }

      const legalMoves = collectLegalMovesForPlayer(matchState, occupancyMap, player);
      if (legalMoves.length === 0) {
        return null;
      }

      const boardPhase = classifyBoardPhase(matchState);
      const scored = scoreMovesForPlayer({
        matchState,
        occupancyMap,
        player,
        legalMoves,
        behaviorContext,
        boardPhase,
      }).slice(0, Math.max(1, selfMoveLimit));

      metrics.nodesExpanded += Math.min(scored.length, Math.max(1, selfMoveLimit));
      const best = scored[0] ?? null;
      if (!best) {
        return null;
      }
      return {
        move: best.move,
        score: best.score,
      };
    },
  });
}

function evaluateRootMoveWithDepth({
  rootEntry,
  rootPlayer,
  matchState,
  behaviorContext,
  depth,
  replyWeight,
  recoveryWeight,
  opponentMoveLimit,
  selfMoveLimit,
  metrics,
  deadlineMs,
  signal,
}) {
  if (signal?.aborted || nowMs() >= deadlineMs) {
    return null;
  }

  const cloned = cloneMatchContext(matchState);
  const moved = applyMoveToClone(cloned.matchState, cloned.occupancyMap, rootEntry.move);
  if (!moved) {
    return null;
  }

  metrics.nodesExpanded += 1;

  const principalVariation = [formatPvStep(rootEntry.move, rootPlayer)];
  let score = Number(rootEntry.score ?? 0);

  if (depth < 2) {
    return { score, principalVariation };
  }

  const strongestReply = evaluateStrongestOpponentReply({
    matchState: cloned.matchState,
    occupancyMap: cloned.occupancyMap,
    player: rootPlayer,
    behaviorContext,
    opponentMoveLimit,
    metrics,
    deadlineMs,
    signal,
    depth,
  });

  if (strongestReply?.move) {
    principalVariation.push(formatPvStep(strongestReply.move, strongestReply.opponent));
    score -= strongestReply.score * replyWeight;

    const replied = applyMoveToClone(cloned.matchState, cloned.occupancyMap, strongestReply.move);
    if (!replied) {
      return { score, principalVariation };
    }

    metrics.nodesExpanded += 1;

    if (depth >= 3) {
      const selfReply = evaluateBestSelfReplyScore({
        matchState: cloned.matchState,
        occupancyMap: cloned.occupancyMap,
        player: rootPlayer,
        behaviorContext,
        selfMoveLimit,
        metrics,
        deadlineMs,
        signal,
        depth,
      });

      if (selfReply?.move) {
        principalVariation.push(formatPvStep(selfReply.move, rootPlayer));
      }

      if (typeof selfReply?.score === "number" && Number.isFinite(selfReply.score)) {
        score += selfReply.score * recoveryWeight;
      }
    }
  }

  return { score, principalVariation };
}

function applyIterativeDeepeningSearchV2({
  dangerRescored,
  candidatePool,
  matchState,
  player,
  behaviorContext,
  budgetMs,
  signal,
  config,
}) {
  const base = Array.isArray(candidatePool) && candidatePool.length > 0
    ? candidatePool
    : dangerRescored;

  if (!Array.isArray(base) || base.length === 0) {
    return {
      scoredMoves: dangerRescored,
      depthReached: 0,
      nodesExpanded: 0,
      cacheHits: 0,
      timedOut: false,
      searchedCandidateCount: 0,
    };
  }

  const searchConfig = {
    rootCandidateLimit: Math.max(4, config?.rootCandidateLimit ?? 16),
    depth3CandidateLimit: Math.max(2, config?.depth3CandidateLimit ?? 8),
    opponentMoveLimit: Math.max(4, config?.opponentMoveLimit ?? 14),
    selfMoveLimit: Math.max(4, config?.selfMoveLimit ?? 14),
    replyWeight: config?.replyWeight ?? 0.9,
    recoveryWeight: config?.recoveryWeight ?? 0.65,
    minDepth3BudgetMs: Math.max(12, config?.minDepth3BudgetMs ?? 45),
    blendFactor: Math.min(1, Math.max(0, config?.blendFactor ?? 0.75)),
  };

  const safeBudgetMs = Math.max(0, budgetMs ?? 0);
  const deadlineMs = nowMs() + safeBudgetMs;
  const metrics = { nodesExpanded: 0, cacheHits: 0 };

  const sortedBase = sortScoredMoves(base);
  const scoreGapTop2 = sortedBase.length >= 2
    ? Number(sortedBase[0].score ?? 0) - Number(sortedBase[1].score ?? 0)
    : Number.POSITIVE_INFINITY;
  let adaptiveRootLimit = searchConfig.rootCandidateLimit;
  if (scoreGapTop2 >= 4) {
    adaptiveRootLimit = Math.max(8, adaptiveRootLimit - 4);
  } else if (scoreGapTop2 >= 2) {
    adaptiveRootLimit = Math.max(10, adaptiveRootLimit - 2);
  }
  const rootCandidates = sortedBase.slice(0, adaptiveRootLimit);

  const searchScores = new Map();
  const searchLinesByMoveKey = new Map();
  let depthReached = 1;
  let timedOut = false;

  for (const entry of rootCandidates) {
    if (signal?.aborted || nowMs() >= deadlineMs) {
      timedOut = true;
      break;
    }

    const evaluated = evaluateRootMoveWithDepth({
      rootEntry: entry,
      rootPlayer: player,
      matchState,
      behaviorContext,
      depth: 2,
      replyWeight: searchConfig.replyWeight,
      recoveryWeight: searchConfig.recoveryWeight,
      opponentMoveLimit: searchConfig.opponentMoveLimit,
      selfMoveLimit: searchConfig.selfMoveLimit,
      metrics,
      deadlineMs,
      signal,
    });

    if (typeof evaluated?.score === "number" && Number.isFinite(evaluated.score)) {
      const key = moveKey(entry.move);
      searchScores.set(key, evaluated.score);
      if (Array.isArray(evaluated.principalVariation) && evaluated.principalVariation.length > 0) {
        searchLinesByMoveKey.set(key, evaluated.principalVariation.filter(Boolean));
      }
    }
  }

  if (!timedOut && rootCandidates.length > 0) {
    depthReached = 2;
  }

  if (!timedOut && nowMs() + searchConfig.minDepth3BudgetMs < deadlineMs) {
    let adaptiveDepth3Limit = searchConfig.depth3CandidateLimit;
    if (scoreGapTop2 >= 4) {
      adaptiveDepth3Limit = Math.max(3, adaptiveDepth3Limit - 3);
    } else if (scoreGapTop2 >= 2) {
      adaptiveDepth3Limit = Math.max(4, adaptiveDepth3Limit - 2);
    }

    const depth3Candidates = [...rootCandidates]
      .sort((a, b) => {
        const aScore = searchScores.get(moveKey(a.move)) ?? a.score;
        const bScore = searchScores.get(moveKey(b.move)) ?? b.score;
        if (aScore !== bScore) {
          return bScore - aScore;
        }
        return moveKey(a.move).localeCompare(moveKey(b.move));
      })
      .slice(0, Math.min(adaptiveDepth3Limit, rootCandidates.length));

    for (const entry of depth3Candidates) {
      if (signal?.aborted || nowMs() >= deadlineMs) {
        timedOut = true;
        break;
      }

      const evaluated = evaluateRootMoveWithDepth({
        rootEntry: entry,
        rootPlayer: player,
        matchState,
        behaviorContext,
        depth: 3,
        replyWeight: searchConfig.replyWeight,
        recoveryWeight: searchConfig.recoveryWeight,
        opponentMoveLimit: searchConfig.opponentMoveLimit,
        selfMoveLimit: searchConfig.selfMoveLimit,
        metrics,
        deadlineMs,
        signal,
      });

      if (typeof evaluated?.score === "number" && Number.isFinite(evaluated.score)) {
        const key = moveKey(entry.move);
        searchScores.set(key, evaluated.score);
        if (Array.isArray(evaluated.principalVariation) && evaluated.principalVariation.length > 0) {
          searchLinesByMoveKey.set(key, evaluated.principalVariation.filter(Boolean));
        }
      }
    }

    if (!timedOut && depth3Candidates.length > 0) {
      depthReached = 3;
    }
  }

  const updated = dangerRescored.map((entry) => {
    const key = moveKey(entry.move);
    const searched = searchScores.get(key);
    if (typeof searched !== "number" || !Number.isFinite(searched)) {
      return entry;
    }

    const baseScore = Number(entry.score ?? 0);
    const blended = baseScore + ((searched - baseScore) * searchConfig.blendFactor);

    return {
      ...entry,
      searchScore: searched,
      score: blended,
    };
  });

  const sortedUpdated = sortScoredMoves(updated);
  const bestMove = sortedUpdated[0]?.move ?? null;
  const bestKey = moveKey(bestMove);
  const principalVariation = searchLinesByMoveKey.get(bestKey)
    ?? (bestMove ? [formatPvStep(bestMove, player)].filter(Boolean) : []);

  const principalVariationByMove = {};
  for (const [key, line] of searchLinesByMoveKey.entries()) {
    principalVariationByMove[key] = Array.isArray(line) ? line.filter(Boolean) : [];
  }
  if (bestMove && !principalVariationByMove[bestKey]) {
    principalVariationByMove[bestKey] = principalVariation;
  }

  return {
    scoredMoves: sortedUpdated,
    depthReached,
    nodesExpanded: metrics.nodesExpanded,
    cacheHits: metrics.cacheHits,
    timedOut,
    searchedCandidateCount: searchScores.size,
    principalVariation,
    principalVariationByMove,
    bestMoveKey: bestKey,
  };
}

function computeDecision(payload) {
  const matchStateSnapshot = payload.matchState ?? {};
  const legalMoves = Array.isArray(payload.legalMoves) ? payload.legalMoves : [];
  const player = payload.player ?? matchStateSnapshot.activePlayer;
  const personaId = typeof payload.personaId === "string" && payload.personaId.trim().length > 0 ? payload.personaId.trim() : "default";

  const behaviorContext = {
    pieceMoveCountsById: new Map(payload.behaviorContext?.pieceMoveCountsById ?? []),
    recentMoves: Array.isArray(payload.behaviorContext?.recentMoves) ? payload.behaviorContext.recentMoves : [],
  };

  const cacheKey = buildDecisionContextHash({
    matchStateSnapshot,
    player,
    legalMoves,
    behaviorContext: {
      pieceMoveCountsById: [...behaviorContext.pieceMoveCountsById.entries()],
      recentMoves: behaviorContext.recentMoves,
    },
    aiBudgetMs: payload.aiBudgetMs ?? 400,
    personaId,
    dangerConfig: payload.dangerConfig ?? {},
    candidateConfig: payload.candidateConfig ?? {},
  });

  const cached = DECISION_CACHE.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      cacheHit: true,
      cacheKey,
      cacheSize: DECISION_CACHE.size,
    };
  }

  const { matchState, occupancyMap } = reconstructMatchContext(matchStateSnapshot);

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

  const searchConfig = payload.searchConfig ?? {};
  const searchBudgetMs = Math.max(
    searchConfig.budgetMinMs ?? 60,
    Math.min(
      searchConfig.budgetMaxMs ?? 1200,
      Math.floor(aiBudgetMs * (searchConfig.budgetFraction ?? 0.42))
    )
  );

  const searchResult = applyIterativeDeepeningSearchV2({
    dangerRescored,
    candidatePool,
    matchState,
    player,
    behaviorContext,
    budgetMs: searchBudgetMs,
    signal: null,
    config: searchConfig,
  });

  const searchedDangerRescored = sortScoredMoves(searchResult.scoredMoves ?? dangerRescored);
  const searchedCandidatePool = pruneScoredCandidates(searchedDangerRescored, {
    limit: payload.candidateConfig?.poolLimit ?? 96,
    minPerPiece: payload.candidateConfig?.minPerPiece ?? 2,
  });

  const result = {
    personaId,
    boardPhase,
    scored: sortedScored,
    dangerBudgetMs,
    dangerRescored: searchedDangerRescored,
    completedStages: dangerResult.completedStages ?? 0,
    timedOut: dangerResult.timedOut === true,
    candidatePool: searchedCandidatePool,
    searchBudgetMs,
    searchDepthReached: searchResult.depthReached ?? 0,
    searchNodesExpanded: searchResult.nodesExpanded ?? 0,
    searchCacheHits: searchResult.cacheHits ?? 0,
    searchTimedOut: searchResult.timedOut === true,
    searchedCandidateCount: searchResult.searchedCandidateCount ?? 0,
    searchPrincipalVariationBest: Array.isArray(searchResult.principalVariation)
      ? searchResult.principalVariation
      : [],
    searchPrincipalVariationByMove: searchResult.principalVariationByMove && typeof searchResult.principalVariationByMove === "object"
      ? searchResult.principalVariationByMove
      : {},
    searchPrincipalVariationBestMoveKey: typeof searchResult.bestMoveKey === "string" ? searchResult.bestMoveKey : null,
  };

  DECISION_CACHE.set(cacheKey, result);
  return {
    ...result,
    cacheHit: false,
    cacheKey,
    cacheSize: DECISION_CACHE.size,
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





















