# CubeChess AI Trace Comparison

## Files
- Candidate: `cubechess-ai-trace-v0.1.83-turn129.json`
- Prior: `cubechess-ai-trace-v0.1.82-turn134.json`

## Summary
- `v0.1.83` trace count: **128** turns
- `v0.1.82` trace count: **133** turns
- First 128-turn overlap difference: **43 turns** (**33.6%**)

## Tactical filter impact (new in v0.1.83)
- `tacticalFilterActive`: **80 / 128 turns** (**62.5%**)
- `avg tacticalPoolCount`: **61.37** (from avg candidate pool 82.34)
- `avg tacticalRejectedCount`: **20.97** moves filtered per turn

## Selection behavior
- `selectedBy`:
  - `chaotic_sampled`: **90**
  - `chaotic_top1`: **38**
- `samplingTopK`:
  - `7`: 99 turns
  - `5`: 3 turns
  - `4`: 8 turns
  - `2`: 18 turns

## Stability / diversity signals
- Still high variety: last 30 turns had **30 unique move keys**.
- Compared with `v0.1.82`, openings/early midgame remain mostly aligned; divergence increases in late midgame/endgame (from turn ~85 onward).

## Quick interpretation
The tactical filter is active often and is reducing candidate exposure while keeping chaotic sampling active. This is producing a different late-game line without collapsing back to deterministic behavior.
