# CubeChess AI Tuning Protocol

## Purpose
Create a repeatable, low-noise process to improve AI strength while preserving fair win balance and visual piece diversity.

## Scope Rules
1. During balance phase, only tune persona parameters.
2. Do not change global evaluator/search logic during balance phase.
3. Do not combine structural rules changes with tuning passes.
4. Use same-seed A/B runs for every comparison.

## Primary Targets
1. Win balance target band (300-game gate): each persona between 10% and 15% win share.
2. Spread target (300-game gate): max persona win rate minus min persona win rate <= 5%.
3. Stability targets:
- safetyBreakRate = 0
- avgUniqueMoveRatio >= 0.995

## Secondary Targets (After Balance Lock)
1. Queen share target: <= 35% of total turns.
2. Knight share target: >= 16% of total turns.
3. Diversity changes are only accepted if balance does not degrade beyond guardrails.

## Iteration Funnel
1. 32 games: reject obvious regressions.
2. 64 games: directional confirmation.
3. 128 games: candidate qualification.
4. 300 games: promotion gate.
5. 1000 games: final validation only for locked candidates.

## Promotion Criteria By Stage
1. 32-game gate:
- No stability regressions.
- No catastrophic spread increase.
2. 64-game gate:
- Directionally improves target metric (balance phase: spread; diversity phase: piece mix).
3. 128-game gate:
- Improvement remains after larger sample.
4. 300-game gate:
- Meets target band and spread.

## Rejection Rules
1. Reject any pass with safetyBreakRate > 0 at 128+ games.
2. Reject any pass that worsens spread by > 1.5% at 128+ games.
3. In diversity phase, reject if balance spread worsens by > 1.5% even if piece mix improves.

## Balance Phase Procedure
1. Freeze evaluator and shared search code.
2. Tune only persona knobs:
- dangerWeight
- poolLimit
- maxRisk / riskGate
- search limits and weights
3. Change at most two personas per pass.
4. Record expected effect before each run.

## Diversity Phase Procedure
1. Start only after balance lock.
2. Allow small global heuristic changes with strict guardrails.
3. Prefer incremental changes over large shifts.
4. Re-run 64 -> 128 -> 300 with same seeds.

## Run Commands
1. Fast light batch:
```bash
npm run telemetry:batch:light -- --games 64 --workers 8 --outdir Tests/game_dump/batch --clean
node Tests/Telemetry/analyzeBatchTelemetry.js --input Tests/game_dump/batch
```

2. Same-seed A/B comparison:
```bash
npm run telemetry:ab -- --games 64 --workers 8 --outdir Tests/game_dump/ab --trace-mode light --clean
```

3. Custom A/B with configs:
```bash
node Tests/Telemetry/runABBatchCompare.js --games 128 --workers 8 --outdir Tests/game_dump/ab_custom --trace-mode light --baseline-config Tests/Telemetry/baseline.json --candidate-config Tests/Telemetry/candidate.json --clean
```

## Change Log Template
Use one block per tuning pass:

```text
Pass ID: YYYY-MM-DD-XX
Phase: balance | diversity
Files changed:
- path1
- path2
Hypothesis:
- expected effect
A/B size:
- N games
Result:
- spread delta
- key persona deltas
- queen share delta
- knight share delta
Decision:
- reject | advance to next gate | promote
```

## Current Working Policy
1. Prioritize win balance until 300-game gate passes.
2. Avoid new structural/game-rule changes during tuning.
3. Keep changes small and attributable.
4. Use light trace mode for iteration, full trace only for promoted candidates.
