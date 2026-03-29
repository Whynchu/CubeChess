import { Coord3 } from "../GameState/coord3.js";
import { MatchState } from "../GameState/matchState.js";
import { OccupancyMap } from "../GameState/occupancyMap.js";
import { Piece } from "../GameState/piece.js";
import { PIECE_TYPES } from "../GameState/constants.js";
import { collectLegalMovesForPlayer } from "../Turn/turnStateMachine.js";
import { createTurnThreatContext } from "./threat.js";
import { evaluateHeuristicMove } from "./evaluator.js";

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function moveKey(move) {
  const to = move?.to ?? { x: "?", y: "?", z: "?" };
  return String(move?.pieceId ?? "piece") + ":" + to.x + "," + to.y + "," + to.z;
}

export function formatPvStep(move, player) {
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

export function pruneScoredCandidates(scoredMoves, options = {}) {
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
  searchNodeCache,
}) {
  if (!searchNodeCache) {
    return compute();
  }

  const piecesKey = matchState.pieces
    .filter((piece) => piece.alive)
    .map((piece) => `${piece.id}@${piece.coord.x},${piece.coord.y},${piece.coord.z}`)
    .sort()
    .join("|");
  const orderKey = Array.isArray(matchState.turnOrder) ? matchState.turnOrder.join(",") : "";
  const nodeKey = `${kind}|${piecesKey}|a:${matchState.activePlayer}|p:${player}|d:${depth}|l:${moveLimit}|t:${matchState.turnCount}|o:${orderKey}`;
  const cached = searchNodeCache.get(nodeKey);
  if (cached !== null) {
    metrics.cacheHits += 1;
    return cached;
  }

  const value = compute();
  searchNodeCache.set(nodeKey, value);
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
  searchNodeCache,
}) {
  return getCachedNodeValue({
    matchState,
    player,
    kind: "opp_reply",
    depth,
    moveLimit: opponentMoveLimit,
    metrics,
    searchNodeCache,
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

        const scored = scoreMovesForPlayer({
          matchState,
          occupancyMap,
          player: opponent,
          legalMoves,
          behaviorContext,
          boardPhase: null,
        }).slice(0, Math.max(1, opponentMoveLimit));

        metrics.nodesExpanded += Math.min(scored.length, Math.max(1, opponentMoveLimit));

        const candidate = scored[0] ?? null;
        if (candidate && (!strongest || candidate.score > strongest.score)) {
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
  searchNodeCache,
}) {
  return getCachedNodeValue({
    matchState,
    player,
    kind: "self_reply",
    depth,
    moveLimit: selfMoveLimit,
    metrics,
    searchNodeCache,
    compute: () => {
      if (signal?.aborted || nowMs() >= deadlineMs) {
        return null;
      }

      const legalMoves = collectLegalMovesForPlayer(matchState, occupancyMap, player);
      if (legalMoves.length === 0) {
        return null;
      }

      const scored = scoreMovesForPlayer({
        matchState,
        occupancyMap,
        player,
        legalMoves,
        behaviorContext,
        boardPhase: null,
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
  counterReplyWeight,
  opponentMoveLimit,
  selfMoveLimit,
  metrics,
  deadlineMs,
  signal,
  searchNodeCache,
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
    searchNodeCache,
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
        searchNodeCache,
      });

      if (selfReply?.move) {
        principalVariation.push(formatPvStep(selfReply.move, rootPlayer));
      }

      if (typeof selfReply?.score === "number" && Number.isFinite(selfReply.score)) {
        score += selfReply.score * recoveryWeight;
      }

      if (depth >= 4 && selfReply?.move) {
        const selfReplied = applyMoveToClone(cloned.matchState, cloned.occupancyMap, selfReply.move);
        if (selfReplied) {
          metrics.nodesExpanded += 1;
          const counterReply = evaluateStrongestOpponentReply({
            matchState: cloned.matchState,
            occupancyMap: cloned.occupancyMap,
            player: rootPlayer,
            behaviorContext,
            opponentMoveLimit,
            metrics,
            deadlineMs,
            signal,
            depth: depth + 1,
            searchNodeCache,
          });

          if (counterReply?.move) {
            principalVariation.push(formatPvStep(counterReply.move, counterReply.opponent));
            score -= counterReply.score * counterReplyWeight;
          }
        }
      }
    }
  }

  return { score, principalVariation };
}

export function applyIterativeDeepeningSearch({
  dangerRescored,
  candidatePool,
  matchState,
  player,
  behaviorContext,
  budgetMs,
  signal,
  config,
  searchNodeCache = null,
}) {
  const base = Array.isArray(candidatePool) && candidatePool.length > 0 ? candidatePool : dangerRescored;

  if (!Array.isArray(base) || base.length === 0) {
    return {
      scoredMoves: dangerRescored,
      depthReached: 0,
      nodesExpanded: 0,
      cacheHits: 0,
      timedOut: false,
      searchedCandidateCount: 0,
      principalVariation: [],
      principalVariationByMove: {},
      bestMoveKey: null,
    };
  }

  const searchConfig = {
    rootCandidateLimit: Math.max(4, config?.rootCandidateLimit ?? 16),
    depth3CandidateLimit: Math.max(2, config?.depth3CandidateLimit ?? 8),
    depth4CandidateLimit: Math.max(2, config?.depth4CandidateLimit ?? 5),
    opponentMoveLimit: Math.max(4, config?.opponentMoveLimit ?? 14),
    selfMoveLimit: Math.max(4, config?.selfMoveLimit ?? 14),
    replyWeight: config?.replyWeight ?? 0.9,
    recoveryWeight: config?.recoveryWeight ?? 0.65,
    counterReplyWeight: config?.counterReplyWeight ?? 0.58,
    minDepth3BudgetMs: Math.max(12, config?.minDepth3BudgetMs ?? 45),
    minDepth4BudgetMs: Math.max(16, config?.minDepth4BudgetMs ?? 80),
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
      counterReplyWeight: searchConfig.counterReplyWeight,
      opponentMoveLimit: searchConfig.opponentMoveLimit,
      selfMoveLimit: searchConfig.selfMoveLimit,
      metrics,
      deadlineMs,
      signal,
      searchNodeCache,
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
        counterReplyWeight: searchConfig.counterReplyWeight,
        opponentMoveLimit: searchConfig.opponentMoveLimit,
        selfMoveLimit: searchConfig.selfMoveLimit,
        metrics,
        deadlineMs,
        signal,
        searchNodeCache,
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

    if (!timedOut && nowMs() + searchConfig.minDepth4BudgetMs < deadlineMs) {
      const depth4Candidates = [...depth3Candidates]
        .sort((a, b) => {
          const aScore = searchScores.get(moveKey(a.move)) ?? a.score;
          const bScore = searchScores.get(moveKey(b.move)) ?? b.score;
          if (aScore !== bScore) {
            return bScore - aScore;
          }
          return moveKey(a.move).localeCompare(moveKey(b.move));
        })
        .slice(0, Math.min(searchConfig.depth4CandidateLimit, depth3Candidates.length));

      for (const entry of depth4Candidates) {
        if (signal?.aborted || nowMs() >= deadlineMs) {
          timedOut = true;
          break;
        }

        const evaluated = evaluateRootMoveWithDepth({
          rootEntry: entry,
          rootPlayer: player,
          matchState,
          behaviorContext,
          depth: 4,
          replyWeight: searchConfig.replyWeight,
          recoveryWeight: searchConfig.recoveryWeight,
          counterReplyWeight: searchConfig.counterReplyWeight,
          opponentMoveLimit: searchConfig.opponentMoveLimit,
          selfMoveLimit: searchConfig.selfMoveLimit,
          metrics,
          deadlineMs,
          signal,
          searchNodeCache,
        });

        if (typeof evaluated?.score === "number" && Number.isFinite(evaluated.score)) {
          const key = moveKey(entry.move);
          searchScores.set(key, evaluated.score);
          if (Array.isArray(evaluated.principalVariation) && evaluated.principalVariation.length > 0) {
            searchLinesByMoveKey.set(key, evaluated.principalVariation.filter(Boolean));
          }
        }
      }

      if (!timedOut && depth4Candidates.length > 0) {
        depthReached = 4;
      }
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
