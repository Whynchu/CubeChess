# M1 Handoff Notes

## Implemented Runtime Modules
- `Runtime/Core/GameState/constants.js`
- `Runtime/Core/GameState/coord3.js`
- `Runtime/Core/GameState/piece.js`
- `Runtime/Core/GameState/matchState.js`
- `Runtime/Core/GameState/occupancyMap.js`
- `Runtime/Core/GameState/initializeMatchState.js`
- `Runtime/Core/Formation/formationGenerator.js`

## Contracts Ready for M2
- `Coord3` enforces bounds `[0..7]` and deterministic string key format `x,y,z`.
- Piece IDs are deterministic: `<Player>-<Type>-<Index2>`.
- `OccupancyMap` supports `isOccupied`, `tryGetPieceAt`, `place`, `move`, `remove`, `validateNoCollisions`.
- `initializeMatchState()` returns:
  - `matchState` with 32 pieces, `activePlayer=Yellow`, `turnCount=0`
  - `occupancyMap` preloaded with the same pieces

## Starting Formation (Current Mapping)
Per player:
- Layer 0: King at corner
- Layer 1: Queen + 2 Bishops at one-step inward axis positions
- Layer 2: 2 Rooks + 2 Knights at two-axis and three-axis inward positions

## Validation Coverage
- Coord bounds and equality/key behavior
- Unique placement and collision prevention
- 32-piece deterministic formation
- 8 pieces per player
- deterministic state bootstrap output

## Test Command
- `npm test`
- Uses single-process harness: `Tests/runAllTests.js`

## Notes
- Node's built-in `--test` runner is blocked in this sandbox (`spawn EPERM`), so tests run through the custom harness.
- M2 can now implement legal move generation against `matchState` + `occupancyMap` directly.
