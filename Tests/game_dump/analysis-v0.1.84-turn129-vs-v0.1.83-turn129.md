# CubeChess AI Trace Validation

## Files
- `cubechess-ai-trace-v0.1.83-turn129.json`
- `cubechess-ai-trace-v0.1.84-turn129.json`

## Result
- Turn count: `128` vs `128`
- Chosen move sequence diff: `0` turns (behavior-identical)

## KPI Summary Presence (v0.1.84)
`kpiSummary` exists and includes:
- diversity/repetition metrics
- entropy metrics
- turn budget compliance
- chaotic selection breakdown
- tactical filter rates
- per-player summary + estimated elimination order

## Notable KPI values (v0.1.84)
- `uniqueMoveRatio`: `0.961`
- `repeatedConsecutiveMoveRate`: `0`
- `turnBudgetComplianceRate`: `1`
- `selectedBy.chaotic_sampled`: `90`
- `selectedBy.chaotic_top1`: `38`
- `tacticalFilterActiveRate`: `0.625`
- `avgTacticalRejected`: `20.97`

## Interpretation
This confirms `v0.1.84` added telemetry only (as intended) without altering AI move behavior relative to `v0.1.83` on this test scenario.
