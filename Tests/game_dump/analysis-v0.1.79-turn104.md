# CubeChess AI Trace Analysis (v0.1.79 turn104)

Source: cubechess-ai-trace-v0.1.79-turn104.json
Generated: 2026-03-28 18:57:59

## Summary
- Trace rows: 103
- Avg decision time: 2172.15 ms
- P95 decision time: 3181.7 ms
- Avg legal moves: 117.15
- P95 legal moves: 171
- Danger timed out: 0
- Aborted: 0

## Board Phase Mix
- midgame: 88
- opening: 15

## Turns by Player
- Blue: 15
- Cyan: 7
- Green: 1
- Orange: 3
- Pink: 25
- Purple: 5
- Red: 21
- Yellow: 26

## Most Frequently Chosen Pieces
- Yellow-Queen-00: 12
- Yellow-Bishop-01: 9
- Pink-Bishop-01: 8
- Blue-Bishop-01: 8
- Red-Bishop-00: 7
- Pink-Knight-00: 6
- Pink-Bishop-00: 6
- Yellow-Bishop-00: 5
- Red-Queen-00: 5
- Red-Rook-01: 4

## Staleness Signals
- Turns with ecentSamePieceCount >= 3: 7
- Turns with ecentSameDestinationCount >= 2: 0

## Terminal Snapshot
- Last trace row id: 103
- Player: Yellow
- Piece: Yellow-Bishop-00
- Target: (0, 7, 7)
- Score: 9999.88

## Notes
- No danger-search timeouts were observed in this run.
- Decision latency is stable and well below the 10s hard turn budget.
- Piece concentration is still visible in top picks (queen/bishop-heavy), which is a target for future diversity tuning.
