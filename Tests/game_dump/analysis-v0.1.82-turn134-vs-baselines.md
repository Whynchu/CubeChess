# CubeChess AI Trace Comparison

## Files
- Candidate: `cubechess-ai-trace-v0.1.82-turn134.json`
- Baselines: `cubechess-ai-trace-v0.1.81-turn104.json`, `cubechess-ai-trace-v0.1.79-turn104.json`

## Key outcomes
- `v0.1.82` trace count: **133** (longer match than 104-turn baselines)
- First 103 turns vs `v0.1.81`: **96** move differences
- First 103 turns vs `v0.1.79`: **96** move differences

## New selector telemetry (v0.1.82)
- `usedChaoticRerank`: **133 / 133** turns
- `selectedBy`:
  - `chaotic_sampled`: **95** turns
  - `chaotic_top1`: **38** turns
- `samplingTopK` distribution:
  - `7`: 104 turns
  - `5`: 3 turns
  - `4`: 11 turns
  - `3`: 5 turns
  - `2`: 10 turns

## Behavior signals
- No longer path-identical to prior runs; branching and piece usage diverged early (from turn 7 onward).
- Last 30 turns in v0.1.82 had **30 unique chosen moves** (no immediate repeated move key).

## Notes
- `avgScoreGapTop2` in v0.1.82 appears very large in aggregate due to score scale and outliers; useful as a per-turn diagnostic, less useful as a global average without clipping.

## Recommendation
1. Keep this selector path.
2. Run one deterministic control trace on `v0.1.82` at turn 134.
3. Run one more chaotic trace on `v0.1.82` at turn 134.
4. Compare elimination timing + piece-type distribution next.
