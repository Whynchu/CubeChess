# CubeChess AI Trace Comparison

## Files
- Baseline: `cubechess-ai-trace-v0.1.79-turn104.json`
- Candidate: `cubechess-ai-trace-v0.1.81-turn104.json`

## High-level result
- Turn-by-turn chosen move sequence diff count: **0** (all 103 traces identical)
- Legal move average: **117.15** in both
- Candidate pool average: **92.35** in both
- Danger timeout count: **0** in both
- Unique chosen moves: **102** in both

## Interpretation
The v0.1.81 anti-stale/diversity evaluator tuning did not change decisions for this run.

## Why this can happen
- The current game state can still have a single dominant top move each turn.
- Existing chaos mode may not add enough stochasticity under large score gaps.
- Diversity penalties may be too weak relative to capture/mobility in this position sequence.

## Recommended next pass
1. Increase diversity influence in chaotic mode only (stronger same-piece/type penalties).
2. Add score-gap aware top-K sampling in chaotic mode (keep deterministic mode unchanged).
3. Add telemetry fields: `selectedBy` (`deterministic_best` vs `sampled`) and `scoreGapTop2`.
4. Re-run 2 dumps (deterministic and chaotic) for turn 104+ and compare divergence.
