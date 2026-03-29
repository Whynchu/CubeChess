import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { initializeMatchState } from "../../Runtime/Core/GameState/initializeMatchState.js";
import { TURN_ORDER } from "../../Runtime/Core/GameState/constants.js";
import { TurnPhase, TurnStateMachine } from "../../Runtime/Core/Turn/index.js";
import { presetAllAI } from "../../Runtime/Core/Seats/index.js";
import {
  applyDangerAwareIterativeRescoring,
  applyIterativeDeepeningSearch,
  classifyBoardPhase,
  createTurnThreatContext,
  evaluateHeuristicMove,
  pruneScoredCandidates,
  TranspositionCache,
} from "../../Runtime/Core/AI/index.js";

const VERSION = "0.1.114";
const MODE = Object.freeze({ Deterministic: "deterministic", Chaotic: "chaotic" });
const SEARCH_NODE_CACHE = new TranspositionCache(4096);

const DEFAULT_SEARCH = Object.freeze({
  budgetFraction: 0.4,
  budgetMinMs: 60,
  budgetMaxMs: 1200,
  rootCandidateLimit: 16,
  depth3CandidateLimit: 8,
  depth4CandidateLimit: 4,
  opponentMoveLimit: 14,
  selfMoveLimit: 14,
  minDepth3BudgetMs: 45,
  minDepth4BudgetMs: 80,
  replyWeight: 0.9,
  recoveryWeight: 0.65,
  counterReplyWeight: 0.58,
  blendFactor: 0.78,
});

const PERSONA = Object.freeze({
  Red: { id: "red_aggressor", dangerWeight: 0.7, poolLimit: 110, maxRisk: 9.5, search: { budgetFraction: 0.4, rootCandidateLimit: 18, depth3CandidateLimit: 8, depth4CandidateLimit: 4, opponentMoveLimit: 12, selfMoveLimit: 14, minDepth3BudgetMs: 45, minDepth4BudgetMs: 85, replyWeight: 0.8, recoveryWeight: 0.74, counterReplyWeight: 0.56, blendFactor: 0.8 } },
  Orange: { id: "orange_raider", dangerWeight: 0.78, poolLimit: 102, maxRisk: 7.8, search: { budgetFraction: 0.39, rootCandidateLimit: 16, depth3CandidateLimit: 8, depth4CandidateLimit: 4, opponentMoveLimit: 12, selfMoveLimit: 13, minDepth3BudgetMs: 45, minDepth4BudgetMs: 82, replyWeight: 0.86, recoveryWeight: 0.7, counterReplyWeight: 0.57, blendFactor: 0.79 } },
  Yellow: { id: "yellow_opportunist", dangerWeight: 0.9, poolLimit: 96, maxRisk: 6.4, search: { budgetFraction: 0.38, rootCandidateLimit: 15, depth3CandidateLimit: 7, depth4CandidateLimit: 3, opponentMoveLimit: 14, selfMoveLimit: 12, minDepth3BudgetMs: 45, minDepth4BudgetMs: 80, replyWeight: 0.94, recoveryWeight: 0.66, counterReplyWeight: 0.6, blendFactor: 0.78 } },
  Green: { id: "green_swarm", dangerWeight: 0.88, poolLimit: 108, maxRisk: 7.1, search: { budgetFraction: 0.39, rootCandidateLimit: 16, depth3CandidateLimit: 8, depth4CandidateLimit: 4, opponentMoveLimit: 12, selfMoveLimit: 14, minDepth3BudgetMs: 45, minDepth4BudgetMs: 82, replyWeight: 0.9, recoveryWeight: 0.7, counterReplyWeight: 0.58, blendFactor: 0.79 } },
  Cyan: { id: "cyan_tempo", dangerWeight: 0.82, poolLimit: 100, maxRisk: 7.1, search: { budgetFraction: 0.39, rootCandidateLimit: 16, depth3CandidateLimit: 8, depth4CandidateLimit: 4, opponentMoveLimit: 13, selfMoveLimit: 13, minDepth3BudgetMs: 45, minDepth4BudgetMs: 82, replyWeight: 0.88, recoveryWeight: 0.7, counterReplyWeight: 0.58, blendFactor: 0.79 } },
  Blue: { id: "blue_fortress", dangerWeight: 1.08, poolLimit: 92, maxRisk: 4.8, search: { budgetFraction: 0.4, rootCandidateLimit: 15, depth3CandidateLimit: 7, depth4CandidateLimit: 4, opponentMoveLimit: 14, selfMoveLimit: 13, minDepth3BudgetMs: 50, minDepth4BudgetMs: 90, replyWeight: 1.03, recoveryWeight: 0.66, counterReplyWeight: 0.64, blendFactor: 0.8 } },
  Purple: { id: "purple_controller", dangerWeight: 0.95, poolLimit: 96, maxRisk: 6.2, search: { budgetFraction: 0.43, rootCandidateLimit: 18, depth3CandidateLimit: 10, depth4CandidateLimit: 6, opponentMoveLimit: 15, selfMoveLimit: 14, minDepth3BudgetMs: 55, minDepth4BudgetMs: 105, replyWeight: 0.97, recoveryWeight: 0.72, counterReplyWeight: 0.66, blendFactor: 0.82 } },
  Pink: { id: "pink_trickster", dangerWeight: 0.84, poolLimit: 104, maxRisk: 7.6, search: { budgetFraction: 0.39, rootCandidateLimit: 16, depth3CandidateLimit: 8, depth4CandidateLimit: 4, opponentMoveLimit: 13, selfMoveLimit: 13, minDepth3BudgetMs: 45, minDepth4BudgetMs: 82, replyWeight: 0.9, recoveryWeight: 0.7, counterReplyWeight: 0.58, blendFactor: 0.79 } },
});

const DEFAULTS = Object.freeze({
  games: 300,
  outdir: path.join("Tests", "game_dump", "batch"),
  maxTurns: 220,
  mode: MODE.Chaotic,
  seed: 42,
  aiBudgetMs: 10000,
  startGame: 1,
  shardId: 0,
});

export function parseArgs(argv) {
  const o = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!v) continue;
    if (k === "--games") { o.games = Math.max(1, Number.parseInt(v, 10) || o.games); i += 1; }
    else if (k === "--outdir") { o.outdir = v; i += 1; }
    else if (k === "--max-turns") { o.maxTurns = Math.max(1, Number.parseInt(v, 10) || o.maxTurns); i += 1; }
    else if (k === "--mode") { o.mode = v === MODE.Deterministic ? MODE.Deterministic : MODE.Chaotic; i += 1; }
    else if (k === "--seed") { o.seed = Number.parseInt(v, 10) || o.seed; i += 1; }
    else if (k === "--ai-budget-ms") { o.aiBudgetMs = Math.max(1, Number.parseInt(v, 10) || o.aiBudgetMs); i += 1; }
    else if (k === "--start-game") { o.startGame = Math.max(1, Number.parseInt(v, 10) || o.startGame); i += 1; }
    else if (k === "--shard-id") { o.shardId = Math.max(0, Number.parseInt(v, 10) || 0); i += 1; }
  }
  return o;
}

function rngFactory(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 0x100000000);
}

function inferType(pieceId) {
  const p = String(pieceId ?? "").split("-");
  return p.length >= 2 ? p[1] : "Piece";
}

function sortScored(scored) {
  return [...scored].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.move.pieceId !== b.move.pieceId) return a.move.pieceId.localeCompare(b.move.pieceId);
    if (a.move.to.x !== b.move.to.x) return a.move.to.x - b.move.to.x;
    if (a.move.to.y !== b.move.to.y) return a.move.to.y - b.move.to.y;
    return a.move.to.z - b.move.to.z;
  });
}

function scoreGapTop2(entries) {
  if (!Array.isArray(entries) || entries.length < 2) return 0;
  return Math.max(0, Number(entries[0]?.score ?? 0) - Number(entries[1]?.score ?? 0));
}

function entryRisk(e) {
  const counter = Math.max(0, -(Number(e?.breakdown?.counterRisk ?? 0)));
  const table = Math.max(0, -(Number(e?.breakdown?.tablePressure ?? 0)));
  const anti = Math.max(0, -(Number(e?.breakdown?.antiHelper ?? 0)));
  return counter + table + anti;
}

function chaoticPenalty(entry, recentMoves, player) {
  const move = entry?.move;
  if (!move) return 0;
  const recent = recentMoves.filter((r) => r.player === player).slice(-14);
  if (recent.length === 0) return 0;
  const moveType = inferType(move.pieceId);
  const samePiece = recent.reduce((n, r) => n + (r.pieceId === move.pieceId ? 1 : 0), 0);
  const sameType = recent.reduce((n, r) => n + (inferType(r.pieceId) === moveType ? 1 : 0), 0);
  const sameDest = recent.reduce((n, r) => n + ((r.to?.x === move.to?.x && r.to?.y === move.to?.y && r.to?.z === move.to?.z) ? 1 : 0), 0);
  const last = recent[recent.length - 1] ?? null;
  const backtrack = Boolean(last
    && last.pieceId === move.pieceId
    && last.to?.x === move.from?.x && last.to?.y === move.from?.y && last.to?.z === move.from?.z
    && last.from?.x === move.to?.x && last.from?.y === move.to?.y && last.from?.z === move.to?.z);
  return Number(((samePiece * 0.55) + (Math.max(0, sameType - 1) * 0.34) + (sameDest * 0.26) + (backtrack ? 0.22 : 0)).toFixed(4));
}

function chooseMove({ matchState, occupancyMap, player, legalMoves, behaviorContext, mode, rng, aiBudgetMs }) {
  const p = PERSONA[player] ?? { id: "default", dangerWeight: 0.8, poolLimit: 96, maxRisk: Number.POSITIVE_INFINITY, search: DEFAULT_SEARCH };
  const boardPhase = classifyBoardPhase(matchState);
  const threatContext = createTurnThreatContext({ matchState, occupancyMap, player });

  const scored = sortScored(legalMoves.map((move) => {
    const e = evaluateHeuristicMove({ move, matchState, legalMoves, threatContext, behaviorContext, boardPhase });
    return { move, score: e.score, breakdown: e.breakdown };
  }));

  const danger = applyDangerAwareIterativeRescoring({
    scoredMoves: scored,
    matchState,
    player,
    stageCandidateLimits: [8, 16, 24],
    stageOpponentMoveLimits: [16, 28, 40],
    dangerWeight: p.dangerWeight,
    budgetMs: 240,
  });

  const dangerScored = sortScored(danger.scoredMoves ?? scored);
  const candidatePool = pruneScoredCandidates(dangerScored, { limit: p.poolLimit, minPerPiece: 2 });
  const searchConfig = { ...DEFAULT_SEARCH, ...(p.search ?? {}) };
  const searchBudgetMs = Math.max(
    searchConfig.budgetMinMs ?? DEFAULT_SEARCH.budgetMinMs,
    Math.min(
      searchConfig.budgetMaxMs ?? DEFAULT_SEARCH.budgetMaxMs,
      Math.floor(aiBudgetMs * (searchConfig.budgetFraction ?? DEFAULT_SEARCH.budgetFraction))
    )
  );
  const searchResult = applyIterativeDeepeningSearch({
    dangerRescored: dangerScored,
    candidatePool,
    matchState,
    player,
    behaviorContext,
    budgetMs: searchBudgetMs,
    signal: null,
    config: searchConfig,
    searchNodeCache: SEARCH_NODE_CACHE,
  });

  const searchedDanger = sortScored(searchResult.scoredMoves ?? dangerScored);
  const searchedPool = pruneScoredCandidates(searchedDanger, { limit: p.poolLimit, minPerPiece: 2 });
  const personaPool = searchedPool.filter((e) => entryRisk(e) <= p.maxRisk);
  const finalPool = personaPool.length > 0 ? personaPool : searchedPool;

  let ranked = finalPool;
  if (mode === MODE.Chaotic) {
    ranked = [...finalPool].map((e, i) => ({ ...e, chaosScore: Number(e.score ?? 0) - chaoticPenalty(e, behaviorContext.recentMoves, player), _i: i }))
      .sort((a, b) => (b.chaosScore - a.chaosScore) || (b.score - a.score) || (a._i - b._i));
  }

  const gap = scoreGapTop2(ranked);
  const topK = mode === MODE.Deterministic ? 1 : (gap >= 6 ? 2 : gap >= 3 ? 3 : gap >= 1.5 ? 4 : gap >= 0.8 ? 5 : Math.min(7, ranked.length));

  let chosen = ranked[0] ?? searchedDanger[0] ?? dangerScored[0] ?? scored[0] ?? { move: legalMoves[0], score: 0, breakdown: null };
  let selectedBy = "deterministic_best";
  if (mode === MODE.Chaotic && ranked.length > 0) {
    const pool = ranked.slice(0, Math.max(1, topK));
    const total = pool.reduce((s, _e, i) => s + (pool.length - i), 0);
    let t = rng() * total;
    for (let i = 0; i < pool.length; i += 1) {
      t -= (pool.length - i);
      if (t <= 0) { chosen = pool[i]; selectedBy = i === 0 ? "chaotic_top1" : "chaotic_sampled"; break; }
    }
  }

  return {
    move: chosen.move,
    trace: {
      player,
      personaId: p.id,
      boardPhase,
      selectedBy,
      scoreGapTop2: Number(gap.toFixed(3)),
      samplingTopK: topK,
      usedChaoticRerank: mode === MODE.Chaotic,
      candidatePoolCount: candidatePool.length,
      personaCandidatePoolCount: finalPool.length,
      personaRiskRejectedCount: Math.max(0, searchedPool.length - finalPool.length),
      searchDepthReached: searchResult.depthReached ?? 0,
      searchNodesExpanded: searchResult.nodesExpanded ?? 0,
      searchCacheHits: searchResult.cacheHits ?? 0,
      searchTimedOut: searchResult.timedOut === true,
      searchedCandidateCount: searchResult.searchedCandidateCount ?? 0,
      chosenMove: {
        pieceId: chosen.move.pieceId,
        from: chosen.move.from,
        to: chosen.move.to,
        score: Number((chosen.score ?? 0).toFixed(3)),
      },
      deterministicBest: searchedDanger[0] ? { pieceId: searchedDanger[0].move.pieceId, to: searchedDanger[0].move.to, score: Number((searchedDanger[0].score ?? 0).toFixed(3)) } : null,
      topCandidates: ranked.slice(0, 8).map((e) => ({ pieceId: e.move.pieceId, to: e.move.to, score: Number((e.score ?? 0).toFixed(3)) })),
    },
  };
}

function summarize(traces) {
  const unique = new Set();
  const selectedBy = new Map();
  const personas = new Map();
  let sameDest = 0;
  let backtrack = 0;
  let riskRejected = 0;
  let poolSize = 0;
  for (let i = 0; i < traces.length; i += 1) {
    const t = traces[i];
    const m = t?.chosenMove;
    unique.add(`${m?.pieceId ?? "x"}:${m?.to?.x ?? "?"},${m?.to?.y ?? "?"},${m?.to?.z ?? "?"}`);
    selectedBy.set(t.selectedBy, (selectedBy.get(t.selectedBy) ?? 0) + 1);
    personas.set(t.personaId, (personas.get(t.personaId) ?? 0) + 1);
    riskRejected += Number(t.personaRiskRejectedCount ?? 0);
    poolSize += Number(t.personaCandidatePoolCount ?? 0);
    const p = traces[i - 1]?.chosenMove;
    if (p && m && p.to?.x === m.to?.x && p.to?.y === m.to?.y && p.to?.z === m.to?.z) sameDest += 1;
    if (p && m && p.pieceId === m.pieceId && p.to?.x === m.from?.x && p.to?.y === m.from?.y && p.to?.z === m.from?.z && p.from?.x === m.to?.x && p.from?.y === m.to?.y && p.from?.z === m.to?.z) backtrack += 1;
  }
  const turnCount = traces.length;
  return {
    turnCount,
    uniqueMoveCount: unique.size,
    uniqueMoveRatio: turnCount > 0 ? Number((unique.size / turnCount).toFixed(3)) : 0,
    sameDestinationRepeatRate: turnCount > 0 ? Number((sameDest / turnCount).toFixed(3)) : 0,
    backtrackRate: turnCount > 0 ? Number((backtrack / turnCount).toFixed(3)) : 0,
    selectedBy: Object.fromEntries([...selectedBy.entries()].sort((a, b) => b[1] - a[1])),
    personas: Object.fromEntries([...personas.entries()].sort((a, b) => b[1] - a[1])),
    avgPersonaRiskRejected: turnCount > 0 ? Number((riskRejected / turnCount).toFixed(2)) : 0,
    avgPersonaCandidatePool: turnCount > 0 ? Number((poolSize / turnCount).toFixed(2)) : 0,
  };
}

async function runGame(gameIndex, options) {
  const seatOffset = (gameIndex - 1) % TURN_ORDER.length;
  const { matchState, occupancyMap, startingCorners } = initializeMatchState({ seatOffset });
  const machine = new TurnStateMachine({ matchState, occupancyMap, seatConfig: presetAllAI(), aiBudgetMs: options.aiBudgetMs });
  const behaviorContext = { pieceMoveCountsById: new Map(), recentMoves: [] };
  const rng = rngFactory(options.seed + (gameIndex * 104729));
  const traces = [];
  let winner = null;
  let safetyBreak = false;

  while (machine.phase !== TurnPhase.MatchEnded && matchState.turnCount < options.maxTurns) {
    const begin = machine.beginTurn();
    if (begin.type === "MatchEnded") { winner = begin.winner ?? null; break; }
    if (begin.type !== TurnPhase.AwaitingAIMove) {
      if (begin.type === "TurnPassed") {
        traces.push({ turnIndex: matchState.turnCount, player: begin.player, personaId: PERSONA[begin.player]?.id ?? "default", selectedBy: "pass", chosenMove: null, personaRiskRejectedCount: 0, personaCandidatePoolCount: 0 });
      }
      continue;
    }

    let turnTrace = null;
    const turnStart = performance.now();
    const result = await machine.resolveAITurn({
      requestMove: ({ legalMoves, player }) => {
        const c = chooseMove({ matchState, occupancyMap, player, legalMoves, behaviorContext, mode: options.mode, rng, aiBudgetMs: options.aiBudgetMs });
        turnTrace = c.trace;
        return c.move;
      },
    });

    if (result?.move?.pieceId) {
      behaviorContext.pieceMoveCountsById.set(result.move.pieceId, (behaviorContext.pieceMoveCountsById.get(result.move.pieceId) ?? 0) + 1);
      behaviorContext.recentMoves.push({ player: result.player, pieceId: result.move.pieceId, from: result.move.from, to: result.move.to });
      if (behaviorContext.recentMoves.length > 24) behaviorContext.recentMoves.splice(0, behaviorContext.recentMoves.length - 24);
      traces.push({
        turnIndex: matchState.turnCount,
        player: result.player,
        personaId: turnTrace?.personaId ?? PERSONA[result.player]?.id ?? "default",
        selectedPieceType: inferType(result.move.pieceId),
        elapsedMs: Number((performance.now() - turnStart).toFixed(2)),
        eliminatedPlayer: result.eliminatedPlayer ?? null,
        timedOut: result.timedOut === true,
        ...turnTrace,
        chosenMove: {
          pieceId: result.move.pieceId,
          from: result.move.from,
          to: result.move.to,
          isCapture: result.move.isCapture,
          capturedPieceId: result.move.capturedPieceId ?? null,
          score: turnTrace?.chosenMove?.score ?? null,
        },
      });
    }
  }

  if (machine.phase !== TurnPhase.MatchEnded && matchState.turnCount >= options.maxTurns) safetyBreak = true;
  winner = winner ?? machine.winner ?? null;

  return {
    version: VERSION,
    mode: options.mode,
    shardId: options.shardId,
    gameIndex,
    seatOffset,
    startingCorners,
    seed: options.seed + (gameIndex * 104729),
    exportedAt: new Date().toISOString(),
    maxTurns: options.maxTurns,
    traceCount: traces.length,
    winner,
    safetyBreak,
    kpiSummary: summarize(traces),
    traces,
  };
}

export async function runBatch(options) {
  const config = { ...DEFAULTS, ...options };
  await fs.mkdir(config.outdir, { recursive: true });
  const endGame = config.startGame + config.games - 1;
  console.log(`Generating ${config.games} games -> ${config.outdir} (games ${config.startGame}-${endGame}, shard ${config.shardId})`);
  const t0 = performance.now();
  let totalTurns = 0;
  for (let offset = 0; offset < config.games; offset += 1) {
    const gameIndex = config.startGame + offset;
    const game = await runGame(gameIndex, config);
    totalTurns += game.traceCount;
    const file = `cubechess-ai-batch-v${VERSION}-game${String(gameIndex).padStart(4, "0")}-turn${game.traceCount}.json`;
    await fs.writeFile(path.join(config.outdir, file), `${JSON.stringify(game, null, 2)}\n`, "utf8");
    const completed = offset + 1;
    if (completed % 10 === 0 || completed === config.games) {
      console.log(`  shard ${config.shardId} ${completed}/${config.games} saved (game ${gameIndex}, winner: ${game.winner ?? "None"}, turns: ${game.traceCount})`);
    }
  }
  const ms = performance.now() - t0;
  console.log(`Done. ${config.games} games, ${totalTurns} turns, ${(ms / 1000).toFixed(2)}s total.`);
}

async function main() {
  const options = parseArgs(process.argv);
  await runBatch(options);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error("Batch generation failed:", error);
    process.exitCode = 1;
  });
}
