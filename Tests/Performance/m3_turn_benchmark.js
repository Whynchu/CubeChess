import { performance } from "node:perf_hooks";

import { initializeMatchState } from "../../Runtime/Core/GameState/initializeMatchState.js";
import { TurnStateMachine, TurnPhase } from "../../Runtime/Core/Turn/index.js";
import { presetAllAI } from "../../Runtime/Core/Seats/index.js";

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function median(values) {
  return percentile(values, 50);
}

async function runBenchmark({ totalTurns = 80, aiBudgetMs = 10_000 } = {}) {
  const turnDurations = [];
  const roundDurations = [];

  const { matchState, occupancyMap } = initializeMatchState();
  const machine = new TurnStateMachine({
    matchState,
    occupancyMap,
    seatConfig: presetAllAI(),
    aiBudgetMs,
  });

  let roundStart = performance.now();

  for (let turnIndex = 0; turnIndex < totalTurns; turnIndex += 1) {
    if (machine.phase === TurnPhase.MatchEnded) {
      break;
    }

    const turnStart = performance.now();
    const begin = machine.beginTurn();

    if (begin.type === "MatchEnded") {
      break;
    }
    if (begin.type !== TurnPhase.AwaitingAIMove) {
      throw new Error(`Expected AI turn in benchmark but received ${begin.type}`);
    }

    await machine.resolveAITurn({ requestMove: ({ legalMoves }) => legalMoves[0] });

    const turnMs = performance.now() - turnStart;
    turnDurations.push(turnMs);

    if ((turnIndex + 1) % 4 === 0) {
      roundDurations.push(performance.now() - roundStart);
      roundStart = performance.now();
    }
  }

  const p95TurnMs = percentile(turnDurations, 95);
  const medianTurnMs = median(turnDurations);
  const medianRoundMs = median(roundDurations);

  return {
    totalTurnsMeasured: turnDurations.length,
    roundsMeasured: roundDurations.length,
    p95TurnMs,
    medianTurnMs,
    medianRoundMs,
  };
}

const result = await runBenchmark();

console.log("M3 turn benchmark results:");
console.log(`- turns measured: ${result.totalTurnsMeasured}`);
console.log(`- rounds measured: ${result.roundsMeasured}`);
console.log(`- p95 turn ms: ${result.p95TurnMs.toFixed(3)}`);
console.log(`- median turn ms: ${result.medianTurnMs.toFixed(3)}`);
console.log(`- median round ms: ${result.medianRoundMs.toFixed(3)}`);

if (result.p95TurnMs > 10_000) {
  console.error(`FAIL: p95 AI turn exceeded 10,000 ms (${result.p95TurnMs.toFixed(3)} ms)`);
  process.exitCode = 1;
}

if (result.medianRoundMs > 40_000) {
  console.error(`FAIL: median round exceeded 40,000 ms (${result.medianRoundMs.toFixed(3)} ms)`);
  process.exitCode = 1;
}
